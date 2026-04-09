import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure, rateLimitedProcedure } from "../trpc";
import { SKILL_EXPERT_SYSTEM_PROMPT, DEFAULT_MODEL } from "@/lib/ai-config";
import { callAnthropicRaw, extractJson } from "@/lib/ai-utils";
import { securityScan } from "@/lib/security-scan";
import { canUseAi, incrementAiUsage, type AiFeature } from "@/lib/ai-usage";
import { db } from "@/db";
import { skills, skillVersions, skillFiles, skillTargetAssignments, aiSuggestions, appSettings, marketplaceSkills } from "@/db/schema";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

async function getApiKey(userId?: string): Promise<string> {
  const result = await getApiKeyWithMeta(userId);
  return result.apiKey;
}

async function getApiKeyWithMeta(userId?: string): Promise<{ apiKey: string; usingServerKey: boolean }> {
  let userKey: string | undefined;
  if (userId) {
    const dbRow = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "anthropic_api_key"), eq(appSettings.userId, userId)),
    });
    userKey = dbRow?.value?.trim() || undefined;
    // Decrypt if encrypted
    if (userKey) {
      try {
        const { decrypt, isEncrypted } = await import("@/lib/encryption");
        if (isEncrypted(userKey)) userKey = decrypt(userKey);
      } catch {} // Fallback to raw value if ENCRYPTION_KEY not configured
    }
  }
  if (userKey && userKey.startsWith("sk-ant-")) {
    return { apiKey: userKey, usingServerKey: false };
  }
  const serverKey = (process.env.ANTHROPIC_SERVER_KEY || "").trim();
  if (serverKey) {
    return { apiKey: serverKey, usingServerKey: true };
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Anthropic API key not configured. Go to Settings to add your API key." });
}

// Wrapper that converts callAnthropicRaw errors into TRPCErrors with appropriate codes
async function callAnthropicWithTrpc(
  apiKey: string,
  model: string,
  system: string,
  messages: { role: string; content: string }[],
  maxTokens: number
): Promise<string> {
  try {
    return await callAnthropicRaw(apiKey, model, system, messages, maxTokens);
  } catch (err: unknown) {
    if (err instanceof TRPCError) throw err;
    const e = err as Error & { status?: number };
    if (e.status === 401) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "API key rejected (401). Check your key in Settings." });
    }
    if (e.status === 429) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limited by Anthropic. Wait a moment and try again." });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: e.message || "Unknown Anthropic API error" });
  }
}

async function callClaude(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens?: number,
  userId?: string
): Promise<string> {
  const apiKey = await getApiKey(userId);
  const limit = model.includes("haiku") ? 8192 : 16384;
  const tokens = maxTokens ? Math.min(maxTokens, limit) : limit;
  return callAnthropicWithTrpc(apiKey, model, systemPrompt, [{ role: "user", content: userMessage }], tokens);
}

// Shared indexing function (used by mutation + auto-trigger)
async function triggerMarketplaceIndex() {
  const { CREATORS } = await import("@/lib/marketplace-data");

  await db.execute(sql`CREATE TABLE IF NOT EXISTS marketplace_skills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id varchar(100) NOT NULL,
    creator_name varchar(255) NOT NULL,
    repo varchar(255) NOT NULL,
    slug varchar(255) NOT NULL,
    name varchar(255) NOT NULL,
    description text DEFAULT '' NOT NULL,
    path text NOT NULL,
    category varchar(50) DEFAULT 'curated' NOT NULL,
    search_text text DEFAULT '' NOT NULL,
    indexed_at timestamp DEFAULT now() NOT NULL
  )`);

  const allSkills: typeof marketplaceSkills.$inferInsert[] = [];
  const results: { creator: string; skills: number }[] = [];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
  };

  for (const creator of CREATORS) {
    const [owner, repo] = creator.github.split("/");
    const paths = ["skills", ".", "src/skills", "agent-skills"];
    let found = false;
    for (const basePath of paths) {
      if (found) break;
      try {
        const url = basePath === "."
          ? `https://api.github.com/repos/${owner}/${repo}/contents`
          : `https://api.github.com/repos/${owner}/${repo}/contents/${basePath}`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const items = await res.json();
        if (!Array.isArray(items)) continue;
        let dirs = items.filter((i: { type: string; name: string }) => i.type === "dir" && !i.name.startsWith("."));
        if (dirs.length === 0) continue;

        // Nested structure: skills/username/skillname/ - use git tree API (1 request for whole repo)
        if (creator.nested) {
          try {
            const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`, { headers, signal: AbortSignal.timeout(15000) });
            if (treeRes.ok) {
              const tree = await treeRes.json();
              if (Array.isArray(tree.tree)) {
                // Find all SKILL.md files under skills/ and extract their parent dirs
                const skillDirs = new Map<string, { name: string; path: string }>();
                for (const entry of tree.tree) {
                  if (entry.type === "blob" && /\/(SKILL|skill)\.md$/.test(entry.path) && entry.path.startsWith("skills/")) {
                    const dirPath = entry.path.replace(/\/(SKILL|skill)\.md$/, "");
                    const parts = dirPath.split("/");
                    const userName = parts[1];
                    const skillName = parts[parts.length - 1];
                    skillDirs.set(dirPath, { name: `${skillName} (${userName})`, path: dirPath });
                  }
                }
                if (skillDirs.size > 0) {
                  dirs = Array.from(skillDirs.values());
                }
              }
            }
          } catch {
            // Fall back to pagination
          }
        }

        for (let i = 0; i < dirs.length; i += 10) {
          const batch = dirs.slice(i, i + 10);
          const fetched = await Promise.allSettled(
            batch.map(async (item: { name: string; path: string }) => {
              for (const fn of ["SKILL.md", "skill.md", "README.md"]) {
                try {
                  const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/${item.path}/${fn}`, { signal: AbortSignal.timeout(5000) });
                  if (!r.ok) continue;
                  const text = await r.text();
                  const fm = text.match(/^---\s*\n([\s\S]*?)\n---/);
                  let desc = "";
                  if (fm) {
                    const d = fm[1].match(/description:\s*["']?(.*?)["']?\s*$/m);
                    if (d) desc = d[1].trim();
                  }
                  if (!desc) {
                    for (const line of text.split("\n")) {
                      const t = line.trim();
                      if (t && !t.startsWith("#") && !t.startsWith("---") && t.length > 10) { desc = t.slice(0, 200); break; }
                    }
                  }
                  return { path: item.path, name: item.name, desc, content: text };
                } catch { continue; }
              }
              return null;
            })
          );

          for (const r of fetched) {
            if (r.status !== "fulfilled" || !r.value) continue;
            const { path: skillPath, name: skillName, desc, content } = r.value;

            // Filter: skip skills with ANY security flags (critical OR warning)
            const scan = securityScan(content);
            if (scan.flags.length > 0) continue;

            // Filter: skip non-English skills (detect by ratio of non-Latin chars in desc+name)
            const checkText = `${skillName} ${desc}`.slice(0, 500);
            const nonLatin = (checkText.match(/[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]/g) || []).length;
            if (nonLatin / Math.max(checkText.length, 1) > 0.15) continue;

            const slug = skillName.toLowerCase().replace(/\s+/g, "-");
            const displayName = skillName.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            allSkills.push({
              creatorId: creator.id, creatorName: creator.name, repo: creator.github,
              slug, name: displayName, description: desc, path: skillPath,
              category: creator.category,
              searchText: `${displayName} ${desc} ${slug} ${creator.name}`.toLowerCase(),
            });
          }
        }
        results.push({ creator: creator.id, skills: dirs.length });
        found = true;
      } catch { continue; }
    }
    if (!found) results.push({ creator: creator.id, skills: 0 });
  }

  if (allSkills.length > 0) {
    await db.delete(marketplaceSkills);
    for (let i = 0; i < allSkills.length; i += 100) {
      await db.insert(marketplaceSkills).values(allSkills.slice(i, i + 100));
    }
  }
  return { indexed: allSkills.length, creators: results };
}

export const aiRouter = router({
  // Index marketplace skills into DB
  indexMarketplace: rateLimitedProcedure
    .mutation(async () => {
      return triggerMarketplaceIndex();
    }),

  // Get marketplace index status - auto-triggers indexing if empty
  marketplaceStatus: authedProcedure
    .query(async ({ ctx }) => {
      try {
        const [result] = await db.select({ count: sql<number>`count(*)` }).from(marketplaceSkills);
        const total = Number(result?.count || 0);

        // Auto-index if empty (runs in background, doesn't block response)
        if (total === 0) {
          // Check if already indexing (prevent concurrent runs)
          const lock = await db.query.appSettings.findFirst({
            where: and(eq(appSettings.key, "marketplace_indexing"), eq(appSettings.userId, "system")),
          });
          const isLocked = lock?.value && (Date.now() - new Date(lock.value).getTime()) < 5 * 60 * 1000; // 5 min lock

          if (!isLocked) {
            // Set lock
            if (lock) {
              await db.update(appSettings).set({ value: new Date().toISOString() }).where(eq(appSettings.id, lock.id));
            } else {
              await db.insert(appSettings).values({ userId: "system", key: "marketplace_indexing", value: new Date().toISOString() });
            }
            // Trigger indexing without awaiting (fire and forget)
            triggerMarketplaceIndex().catch(() => {});
          }
        }

        return { totalSkills: total };
      } catch {
        return { totalSkills: 0 };
      }
    }),

  // AI-powered marketplace search from DB
  searchMarketplace: rateLimitedProcedure
    .input(z.object({
      query: z.string().min(2),
      model: z.string().default("claude-haiku-4-5-20251001"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Step 1: keyword search in DB
      const words = input.query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      const conditions = words.map((word: string) => ilike(marketplaceSkills.searchText, `%${word}%`));

      let candidates = await db
        .select()
        .from(marketplaceSkills)
        .where(conditions.length > 0 ? or(...conditions) : undefined)
        .limit(50);

      if (candidates.length === 0) {
        return { results: [], aiPowered: false, totalIndexed: 0 };
      }

      // Step 2: AI ranking
      try {
        const skillList = candidates.map((s, i) =>
          `${i + 1}. "${s.name}" by ${s.creatorName} - ${s.description || "no description"}`
        ).join("\n");

        const result = await callClaude(
          input.model,
          "You are a skill recommendation engine. Given a user's need and a list of AI coding skills, return the indices of the most relevant skills. Consider semantic meaning, not just keywords. A skill for 'creating presentations' would match 'pptx' or 'slide deck' even if the exact words differ.",
          `User needs: "${input.query}"\n\nSkills (pick most relevant, max 10):\n${skillList}\n\nReturn ONLY a JSON array of numbers. Most relevant first. Example: [5, 12, 3]\nIf nothing relevant, return [].`,
          256,
          ctx.userId
        );

        const match = result.match(/\[[\d,\s]*\]/);
        if (match) {
          const indices: number[] = JSON.parse(match[0]);
          const ranked = indices
            .filter(i => i >= 1 && i <= candidates.length)
            .map(i => candidates[i - 1]);
          if (ranked.length > 0) candidates = ranked;
        }
      } catch {
        // AI failed - use keyword order
      }

      return {
        results: candidates.slice(0, 10).map(s => ({
          name: s.name,
          slug: s.slug,
          description: s.description,
          creator: s.creatorName,
          repo: s.repo,
          path: s.path,
          category: s.category,
          installCommand: s.path.split("/").length > 2
            ? `npx skills add https://github.com/${s.repo} --skill ${s.path.split("/").pop()} --path ${s.path}`
            : `npx skills add https://github.com/${s.repo} --skill ${s.path.split("/").pop()}`,
        })),
        aiPowered: true,
        totalIndexed: candidates.length,
      };
    }),

  // Review a skill
  reviewSkill: rateLimitedProcedure
    .input(z.object({ skillId: z.string(), content: z.string(), model: z.string().default(DEFAULT_MODEL) }))
    .mutation(async ({ ctx, input }) => {
      const { apiKey, usingServerKey } = await getApiKeyWithMeta(ctx.userId);

      // If using server key, check and enforce limits
      if (usingServerKey) {
        const check = await canUseAi(ctx.userId, ctx.isPro, "review");
        if (!check.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Review limit reached (${check.used}/${check.limit} this month). Add your own API key in Settings for unlimited, or upgrade to Pro.`,
          });
        }
      }

      const useModel = usingServerKey ? "claude-haiku-4-5-20251001" : input.model;
      const limit = useModel.includes("haiku") ? 8192 : 16384;
      const result = await callAnthropicWithTrpc(apiKey, useModel, SKILL_EXPERT_SYSTEM_PROMPT, [{ role: "user", content: `Review this SKILL.md. Rate 5 areas (1-5 each) and give specific improvements.

Areas: Frontmatter Quality, Instruction Clarity, Examples, Error Handling, Structure.

Format your response as markdown with:
## Skill Review
### Overall Score: X/5
### [Area]: X/5
[specific feedback]
### Top 3 Improvements
1. ...

Skill:
\`\`\`markdown
${input.content}
\`\`\`` }], Math.min(4096, limit));

      if (usingServerKey) {
        await incrementAiUsage(ctx.userId, "review");
      }

      await db.insert(aiSuggestions).values({
        skillId: input.skillId,
        type: "improve-description",
        suggestion: result,
        proposedContent: "",
        diff: "",
        status: "pending",
      });

      return { review: result };
    }),

  // Improve description
  improveDescription: rateLimitedProcedure
    .input(z.object({
      currentDescription: z.string(),
      skillName: z.string(),
      skillContent: z.string().optional(),
      model: z.string().default(DEFAULT_MODEL),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await callClaude(
        input.model,
        SKILL_EXPERT_SYSTEM_PROMPT,
        `Improve this skill description. Include: WHAT it does, WHEN to use it (with trigger phrases in quotes), key capabilities. Under 1024 chars. No XML brackets.

Skill name: ${input.skillName}
Current description: "${input.currentDescription}"
${input.skillContent ? `\nContext:\n${input.skillContent.slice(0, 2000)}` : ""}

Return ONLY the improved description text. No explanation, no JSON, no markdown.`,
        1024,
        ctx.userId
      );
      return { description: result.trim() };
    }),

  // Optimize description for Claude Code's 250-char trigger limit
  optimizeDescription: rateLimitedProcedure
    .input(z.object({
      currentDescription: z.string(),
      skillName: z.string(),
      skillContent: z.string().optional(),
      model: z.string().default(DEFAULT_MODEL),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await callClaude(
        input.model,
        SKILL_EXPERT_SYSTEM_PROMPT,
        `Claude Code only reads the first 250 characters of a skill description to decide when to trigger it. Rewrite this description to be UNDER 250 characters while maximizing trigger accuracy.

Rules:
- MUST be under 250 characters total
- Start with WHAT the skill does (verb phrase)
- Include WHEN to use it (trigger condition)
- Front-load the most important information
- Use concise, keyword-rich language
- Include 1-2 trigger phrases users might say
- No XML brackets, no quotes around the whole thing
- No filler words ("This skill", "A tool that", etc.)

Skill name: ${input.skillName}
Current description (${input.currentDescription.length} chars): "${input.currentDescription}"
${input.skillContent ? `\nSkill content for context:\n${input.skillContent.slice(0, 2000)}` : ""}

Return ONLY the optimized description text. Nothing else.`,
        512,
        ctx.userId
      );
      return { description: result.trim() };
    }),

  // Suggest triggers
  suggestTriggers: rateLimitedProcedure
    .input(z.object({
      skillName: z.string(),
      description: z.string(),
      content: z.string().optional(),
      model: z.string().default(DEFAULT_MODEL),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await callClaude(
        input.model,
        SKILL_EXPERT_SYSTEM_PROMPT,
        `Suggest 8-10 trigger phrases for this skill - phrases a user might say to activate it. Mix obvious, paraphrased, and domain-specific phrases.

Skill: ${input.skillName}
Description: "${input.description}"
${input.content ? `\nContent:\n${input.content.slice(0, 2000)}` : ""}

Return ONLY a JSON array of strings. Example: ["phrase 1", "phrase 2"]`,
        1024,
        ctx.userId
      );

      const parsed = extractJson(result, "array");
      if (Array.isArray(parsed)) return { triggers: parsed as string[] };

      // Fallback: parse line by line
      return {
        triggers: result.split("\n")
          .map((l) => l.replace(/^[-"*\d.\s]+|["]+$/g, "").trim())
          .filter((l) => l.length > 3 && l.length < 100),
      };
    }),

  // Generate a skill
  generateSkill: rateLimitedProcedure
    .input(z.object({
      prompt: z.string().min(1),
      category: z.string().optional(),
      pattern: z.string().optional(),
      model: z.string().default(DEFAULT_MODEL),
    }))
    .mutation(async ({ ctx, input }) => {
      const { apiKey, usingServerKey } = await getApiKeyWithMeta(ctx.userId);

      // If using server key, check and enforce limits
      if (usingServerKey) {
        const check = await canUseAi(ctx.userId, ctx.isPro, "generate");
        if (!check.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Generate limit reached (${check.used}/${check.limit} this month). Add your own API key in Settings for unlimited, or upgrade to Pro.`,
          });
        }
      }

      const useModel = usingServerKey ? "claude-haiku-4-5-20251001" : input.model;
      const limit = useModel.includes("haiku") ? 8192 : 16384;
      const result = await callAnthropicWithTrpc(apiKey, useModel, SKILL_EXPERT_SYSTEM_PROMPT, [{ role: "user", content: `Generate a complete SKILL.md for: "${input.prompt}"
${input.category ? `Category: ${input.category}` : ""}

Requirements: valid YAML frontmatter (---), kebab-case name, description with WHAT+WHEN+triggers, instructions, examples, troubleshooting. Under 5000 words.

Return ONLY the SKILL.md content starting with ---.` }], Math.min(8192, limit));

      if (usingServerKey) {
        await incrementAiUsage(ctx.userId, "generate");
      }

      return { content: result.trim() };
    }),

  // Improve skill
  improveSkill: rateLimitedProcedure
    .input(z.object({ content: z.string(), focusArea: z.string().optional(), model: z.string().default(DEFAULT_MODEL) }))
    .mutation(async ({ ctx, input }) => {
      const focus = input.focusArea ? `Focus on: ${input.focusArea}` : "Improve all aspects.";
      const result = await callClaude(
        input.model,
        SKILL_EXPERT_SYSTEM_PROMPT,
        `Improve this skill. ${focus}

Current skill:
\`\`\`markdown
${input.content}
\`\`\`

Return ONLY the improved SKILL.md content starting with ---.`,
        8192,
        ctx.userId
      );
      return { content: result.trim() };
    }),

  // Chat with tool use - AI agent with rich context and memory
  chat: rateLimitedProcedure
    .input(z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      skillId: z.string().optional(),
      skillContent: z.string().optional(),
      model: z.string().default(DEFAULT_MODEL),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
      const { apiKey, usingServerKey } = await getApiKeyWithMeta(ctx.userId);

      // If using server key, check and enforce limits
      if (usingServerKey) {
        const check = await canUseAi(ctx.userId, ctx.isPro, "chat");
        if (!check.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Chat limit reached (${check.used}/${check.limit} this month). Add your own API key in Settings for unlimited, or upgrade to Pro.`,
          });
        }
      }

      const hasSkill = input.skillContent && input.skillContent.length > 10;

      // Build context - lightweight, no extra DB queries
      let contextSections = "";
      if (hasSkill) {
        contextSections = `

## Current Skill
\`\`\`markdown
${input.skillContent}
\`\`\`

## Tools
Use tools for ALL modification requests. Never show code to copy.
- edit_skill: rewrite SKILL.md content
- update_frontmatter_field: update a single field
- edit_file: create/update file in skill folder (references/, scripts/, assets/)
- save_note: remember something about this skill for next time`;
      }

      const tools = hasSkill ? [
        {
          name: "edit_skill",
          description: "Replace the SKILL.md content. Use for any content modification. Always include the COMPLETE content.",
          input_schema: {
            type: "object" as const,
            properties: {
              content: { type: "string" as const, description: "Complete updated SKILL.md content, starting with ---" },
              summary: { type: "string" as const, description: "One-line summary of changes" },
              changelog: { type: "string" as const, description: "Bullet list of changes" },
            },
            required: ["content", "summary"],
          },
        },
        {
          name: "update_frontmatter_field",
          description: "Update a single YAML frontmatter field quickly.",
          input_schema: {
            type: "object" as const,
            properties: {
              field: { type: "string" as const, description: "Field name (e.g., 'description', 'name')" },
              value: { type: "string" as const, description: "New value" },
              summary: { type: "string" as const, description: "What was changed" },
            },
            required: ["field", "value", "summary"],
          },
        },
        {
          name: "edit_file",
          description: "Create or update a file in the skill folder (references/, scripts/, or assets/). Use for adding documentation, scripts, templates, etc.",
          input_schema: {
            type: "object" as const,
            properties: {
              folder: { type: "string" as const, description: "Folder: 'references', 'scripts', or 'assets'" },
              filename: { type: "string" as const, description: "Filename (e.g., 'api-docs.md', 'validate.py')" },
              content: { type: "string" as const, description: "File content" },
              summary: { type: "string" as const, description: "What this file does" },
            },
            required: ["folder", "filename", "content", "summary"],
          },
        },
        {
          name: "save_note",
          description: "Save a persistent observation about this skill. Notes are remembered across conversations. Use to track: user preferences, known issues, improvement ideas, decisions made.",
          input_schema: {
            type: "object" as const,
            properties: {
              note: { type: "string" as const, description: "The observation to remember" },
            },
            required: ["note"],
          },
        },
      ] : undefined;

      const useModel = usingServerKey ? "claude-haiku-4-5-20251001" : input.model;
      const chatLimit = useModel.includes("haiku") ? 4096 : 8192;

      let res: Response;
      try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: useModel,
            max_tokens: chatLimit,
            system: SKILL_EXPERT_SYSTEM_PROMPT + (contextSections || ""),
            messages: input.messages,
            ...(tools ? { tools } : {}),
          }),
        });
      } catch (fetchErr: unknown) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Network error: ${fetchErr instanceof Error ? fetchErr.message : "Unknown"}` });
      }

      const rawText = await res.text().catch(() => "");
      if (!res.ok) {
        let errMsg = `${res.status}`;
        try { const e = JSON.parse(rawText); errMsg = e?.error?.message || errMsg; } catch (e) { console.error("[ai-router] parse error response", e); }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `AI error (${res.status}): ${errMsg}` });
      }

      let body: { content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, string>; id?: string }> };
      try { body = JSON.parse(rawText); } catch (e) {
        console.error("[ai-router] parse AI response", e);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Invalid response from AI` });
      }

      // Process blocks - execute server-side tools, pass client-side tools through
      const blocks: Array<{ type: "text"; text: string } | { type: "tool_use"; name: string; input: Record<string, string> }> = [];

      for (const block of body.content || []) {
        if (block.type === "text" && block.text) {
          blocks.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use" && block.name && block.input) {
          // Server-executed tool: save_note
          if (block.name === "save_note" && block.input.note && input.skillId) {
            const skill = await db.query.skills.findFirst({
              where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
              columns: { aiNotes: true },
            });
            const currentNotes = (skill?.aiNotes as Array<{ note: string; createdAt: string }>) || [];
            const updatedNotes = [...currentNotes.slice(-19), { note: block.input.note, createdAt: new Date().toISOString() }];
            await db.update(skills).set({ aiNotes: updatedNotes }).where(eq(skills.id, input.skillId));
            // Show as a subtle status in chat
            blocks.push({ type: "tool_use", name: "save_note", input: { note: block.input.note, summary: "Noted" } });
          } else {
            // Client-rendered tools: edit_skill, update_frontmatter_field, edit_file
            blocks.push({ type: "tool_use", name: block.name, input: block.input });
          }
        }
      }

      if (usingServerKey) {
        await incrementAiUsage(ctx.userId, "chat");
      }

      return { blocks };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AI Chat Error]", msg, err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `AI chat error: ${msg.slice(0, 200)}` });
      }
    }),

  // Batch review
  batchReview: rateLimitedProcedure
    .input(z.object({ model: z.string().default(DEFAULT_MODEL) }))
    .mutation(async ({ ctx, input }) => {
      const allSkills = await db.query.skills.findMany({
        where: eq(skills.userId, ctx.userId),
      });
      const summaries: { skillId: string; name: string; score: number; issues: string[] }[] = [];

      for (const skill of allSkills) {
        const result = await callClaude(
          input.model,
          SKILL_EXPERT_SYSTEM_PROMPT,
          `Rate this skill 1-5 and list up to 3 issues. Return JSON: {"score": N, "issues": ["..."]}

\`\`\`markdown
${skill.content.slice(0, 3000)}
\`\`\``,
          512,
          ctx.userId
        );

        const parsed = extractJson(result, "object") as { score?: number; issues?: string[] } | null;
        summaries.push({
          skillId: skill.id,
          name: skill.name,
          score: parsed?.score ?? 0,
          issues: parsed?.issues ?? ["Parse failed"],
        });
      }

      return { reviews: summaries };
    }),

  // Analyze skill - structured issues
  analyzeSkillLive: rateLimitedProcedure
    .input(z.object({ content: z.string(), model: z.string().default(DEFAULT_MODEL) }))
    .mutation(async ({ ctx, input }) => {
      const result = await callClaude(
        input.model,
        SKILL_EXPERT_SYSTEM_PROMPT,
        `Analyze this skill and return issues as a JSON array. Each item:
{"severity": "error"|"warning"|"suggestion", "category": "frontmatter"|"description"|"structure"|"instructions"|"examples"|"error-handling", "title": "short title", "description": "what's wrong", "fix": "how to fix it"}

Check: frontmatter validity, description quality, structure, instructions clarity, examples, error handling.

Return ONLY a JSON array. No markdown, no explanation.

Skill:
\`\`\`markdown
${input.content}
\`\`\``,
        4096,
        ctx.userId
      );

      const parsed = extractJson(result, "array");
      if (Array.isArray(parsed)) {
        return { issues: parsed as Array<{
          severity: "error" | "warning" | "suggestion";
          category: string;
          title: string;
          description: string;
          fix: string;
          lineHint?: string;
        }> };
      }
      return { issues: [] };
    }),

  // Proactive suggestions - instant heuristic check (no AI call)
  getProactiveSuggestions: authedProcedure
    .input(z.object({ skillId: z.string() }))
    .query(async ({ ctx, input }) => {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) return { suggestions: [] };

      const suggestions: Array<{ type: "info" | "warning" | "action"; message: string; action?: string }> = [];
      const content = skill.content;
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const fm = fmMatch?.[1] || "";
      const body = fmMatch ? content.slice(fmMatch[0].length) : content;

      // Frontmatter checks
      if (!fmMatch) {
        suggestions.push({ type: "warning", message: "Missing YAML frontmatter", action: "Add valid YAML frontmatter with name and description" });
      } else {
        const nameMatch = fm.match(/^name:\s*(.+)$/m);
        const descMatch = fm.match(/^description:\s*(.+)$/m);
        const name = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
        const desc = descMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "";

        if (!name) suggestions.push({ type: "warning", message: "Missing 'name' field in frontmatter", action: "Add a kebab-case name to frontmatter" });
        else if (name !== name.toLowerCase() || /\s/.test(name)) suggestions.push({ type: "warning", message: `Name "${name}" should be kebab-case`, action: `Fix the name field to be kebab-case` });

        if (!desc) suggestions.push({ type: "warning", message: "Missing description", action: "Write a description with WHAT the skill does and WHEN to use it" });
        else if (desc.length < 50) suggestions.push({ type: "warning", message: `Description too short (${desc.length} chars)`, action: "Expand description with trigger phrases and use cases" });
        else if (desc.length > 1024) suggestions.push({ type: "warning", message: `Description too long (${desc.length}/1024)`, action: "Shorten description to under 1024 characters" });

        // Context-specific: check if description mentions what the skill actually does
        const h2s = body.match(/^##\s+(.+)/gm)?.map(h => h.replace(/^##\s+/, "").toLowerCase()) || [];
        if (desc && h2s.length > 0) {
          const bodyKeywords = body.toLowerCase();
          if (bodyKeywords.includes("typescript") && !desc.toLowerCase().includes("typescript")) {
            suggestions.push({ type: "info", message: "Skill mentions TypeScript but description doesn't", action: "Add TypeScript mention to description" });
          }
          if (bodyKeywords.includes("python") && !desc.toLowerCase().includes("python")) {
            suggestions.push({ type: "info", message: "Skill mentions Python but description doesn't", action: "Add Python mention to description" });
          }
          if (bodyKeywords.includes("api") && !desc.toLowerCase().includes("api")) {
            suggestions.push({ type: "info", message: "Skill mentions API but description doesn't", action: "Add API mention to description" });
          }
        }
      }

      // Structure checks
      const hasExamples = /^##\s+(examples?|usage)/im.test(body);
      const hasErrorHandling = /^##\s+(error|troubleshoot|common (issues|problems))/im.test(body);
      const hasInstructions = /^##\s+(instructions?|how to|steps|workflow)/im.test(body);
      const codeBlocks = (body.match(/```/g) || []).length / 2;
      const wordCount = body.split(/\s+/).length;

      if (!hasInstructions) suggestions.push({ type: "warning", message: "No instructions section", action: "Add a ## Instructions section with step-by-step guidance" });
      if (!hasExamples && codeBlocks < 1) suggestions.push({ type: "info", message: "No examples or code blocks", action: "Add practical examples with code blocks" });
      if (!hasErrorHandling) suggestions.push({ type: "info", message: "No error handling section", action: "Add a ## Troubleshooting section" });
      if (wordCount > 5000) suggestions.push({ type: "warning", message: `Skill is long (${wordCount} words). Consider moving details to references/`, action: "Extract reference content to separate files" });
      if (wordCount < 50) suggestions.push({ type: "info", message: "Skill content is very short", action: "Expand with detailed instructions, examples, and error handling" });

      // Deploy status
      const assignments = await db.query.skillTargetAssignments.findMany({
        where: eq(skillTargetAssignments.skillId, input.skillId),
      });
      const outdated = assignments.filter(a => a.deployedVersion < skill.currentVersion);
      if (outdated.length > 0) {
        suggestions.push({ type: "action", message: `${outdated.length} target(s) on older version` });
      }

      // Version-specific: check for regressions
      if (skill.currentVersion > 1) {
        const prevVersion = await db.query.skillVersions.findFirst({
          where: and(eq(skillVersions.skillId, input.skillId), eq(skillVersions.version, skill.currentVersion - 1)),
          columns: { content: true },
        });
        if (prevVersion) {
          const prevHadExamples = /^##\s+(examples?|usage)/im.test(prevVersion.content);
          const prevHadErrorHandling = /^##\s+(error|troubleshoot)/im.test(prevVersion.content);
          if (prevHadExamples && !hasExamples) suggestions.push({ type: "warning", message: "Previous version had examples section - removed in current", action: "Restore the examples section from previous version" });
          if (prevHadErrorHandling && !hasErrorHandling) suggestions.push({ type: "warning", message: "Previous version had error handling - removed in current", action: "Restore error handling section" });
        }
      }

      return { suggestions: suggestions.slice(0, 6) };
    }),

  // Apply feedback - edit the skill based on user instruction
  applyFeedback: rateLimitedProcedure
    .input(z.object({ content: z.string(), feedback: z.string().min(1), model: z.string().default(DEFAULT_MODEL) }))
    .mutation(async ({ ctx, input }) => {
      const result = await callClaude(
        input.model,
        `${SKILL_EXPERT_SYSTEM_PROMPT}

CRITICAL: You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences. Just raw JSON.`,
        `Apply this change to the skill:
"${input.feedback}"

Current skill:
\`\`\`
${input.content}
\`\`\`

Return a JSON object with exactly these keys:
- "content": the FULL updated SKILL.md (must start with ---)
- "changelog": bullet list of changes (each line starts with "- ")
- "summary": one-line summary

IMPORTANT: Return ONLY the JSON object. No \`\`\` fences. No explanation before or after.`,
        8192,
        ctx.userId
      );

      // Try JSON extraction
      const parsed = extractJson(result, "object") as { content?: string; changelog?: string; summary?: string } | null;

      if (parsed?.content && parsed.content.trimStart().startsWith("---")) {
        return {
          content: parsed.content,
          changelog: parsed.changelog ?? "- Applied changes",
          summary: parsed.summary ?? "Applied feedback",
        };
      }

      // Fallback: try to find raw skill content in the response
      const skillMatch = result.match(/(---[\s\S]*)/);
      if (skillMatch) {
        return {
          content: skillMatch[1].trim(),
          changelog: "- Applied user feedback",
          summary: "Applied feedback",
        };
      }

      // Last resort: return original unchanged
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AI did not return valid skill content. Try rephrasing your request.",
      });
    }),

  // Fix a specific issue
  fixIssue: rateLimitedProcedure
    .input(z.object({
      content: z.string(),
      issueTitle: z.string(),
      issueFix: z.string(),
      issueCategory: z.string(),
      model: z.string().default(DEFAULT_MODEL),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await callClaude(
        input.model,
        `${SKILL_EXPERT_SYSTEM_PROMPT}

CRITICAL: Respond with ONLY a valid JSON object. No markdown, no code fences.`,
        `Fix this issue in the skill:
Issue: ${input.issueTitle} (${input.issueCategory})
Fix: ${input.issueFix}

Skill:
\`\`\`
${input.content}
\`\`\`

Return JSON: {"content": "full fixed SKILL.md starting with ---", "summary": "what changed"}`,
        8192,
        ctx.userId
      );

      const parsed = extractJson(result, "object") as { content?: string; summary?: string } | null;

      if (parsed?.content && parsed.content.trimStart().startsWith("---")) {
        return { content: parsed.content, summary: parsed.summary ?? `Fixed: ${input.issueTitle}` };
      }

      const skillMatch = result.match(/(---[\s\S]*)/);
      if (skillMatch) {
        return { content: skillMatch[1].trim(), summary: `Fixed: ${input.issueTitle}` };
      }

      return { content: input.content, summary: "Fix failed - AI returned unexpected format" };
    }),

  // Test API key
  testKey: authedProcedure.mutation(async ({ ctx }) => {
    const apiKey = await getApiKey(ctx.userId);
    const masked = apiKey.slice(0, 12) + "..." + apiKey.slice(-4);

    try {
      const text = await callAnthropicRaw(
        apiKey,
        "claude-haiku-4-5-20251001",
        "You are helpful.",
        [{ role: "user", content: "Say OK" }],
        16
      );
      return { success: true, masked, response: text.slice(0, 50) };
    } catch (err: unknown) {
      const e = err as { message?: string };
      return { success: false, masked, error: e.message || "Unknown error" };
    }
  }),
});
