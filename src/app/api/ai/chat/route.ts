import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { skills, projects, appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { SKILL_EXPERT_SYSTEM_PROMPT, DEFAULT_MODEL } from "@/lib/ai-config";

export const maxDuration = 60;

const TOOLS = [
  {
    name: "edit_skill",
    description: "Replace the SKILL.md content. Always include COMPLETE content.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Complete updated SKILL.md, starting with ---" },
        summary: { type: "string", description: "One-line summary" },
        changelog: { type: "string", description: "Bullet list of changes" },
      },
      required: ["content", "summary"],
    },
  },
  {
    name: "update_frontmatter_field",
    description: "Update a single YAML frontmatter field.",
    input_schema: {
      type: "object",
      properties: { field: { type: "string" }, value: { type: "string" }, summary: { type: "string" } },
      required: ["field", "value", "summary"],
    },
  },
  {
    name: "edit_file",
    description: "Create/update a file in skill folder (references/, scripts/, assets/).",
    input_schema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "references, scripts, or assets" },
        filename: { type: "string" }, content: { type: "string" }, summary: { type: "string" },
      },
      required: ["folder", "filename", "content", "summary"],
    },
  },
  {
    name: "save_note",
    description: "Save a persistent note about this skill.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string" } },
      required: ["note"],
    },
  },
];

function sendEvent(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: Record<string, unknown>) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = session.userId;

    const body = await request.json();
    const { messages, skillId, skillContent, model } = body as {
      messages: Array<{ role: string; content: string | Array<unknown> }>;
      skillId?: string;
      skillContent?: string;
      model?: string;
    };
    if (!messages?.length) return NextResponse.json({ error: "No messages" }, { status: 400 });

    const row = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "anthropic_api_key"), eq(appSettings.userId, userId)),
    });
    let userKey = row?.value?.trim() || "";
    // Decrypt if encrypted
    if (userKey) {
      try {
        const { decrypt, isEncrypted } = await import("@/lib/encryption");
        if (isEncrypted(userKey)) userKey = decrypt(userKey);
      } catch {} // Fallback to raw value if ENCRYPTION_KEY not configured
    }
    const serverKey = (process.env.ANTHROPIC_SERVER_KEY || "").trim();
    const usingServerKey = !userKey && !!serverKey;
    const apiKey = userKey || serverKey;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 400 });

    // If using server key, check and enforce limits
    if (usingServerKey) {
      const { canUseAi } = await import("@/lib/ai-usage");
      const { getIsPro } = await import("@/lib/server-auth");
      const isPro = await getIsPro();
      const check = await canUseAi(userId, isPro, "chat");
      if (!check.allowed) {
        return NextResponse.json({
          error: `Chat limit reached (${check.used}/${check.limit} this month). Add your own API key in Settings for unlimited, or upgrade to Pro.`,
          limitReached: true,
          used: check.used,
          limit: check.limit,
        }, { status: 429 });
      }
    }

    const hasSkill = skillContent && skillContent.length > 10;
    const useModel = usingServerKey ? "claude-haiku-4-5-20251001" : (model || DEFAULT_MODEL);

    let systemPrompt = SKILL_EXPERT_SYSTEM_PROMPT;

    // Inject project context if skill belongs to a project
    if (hasSkill && skillId) {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
        columns: { projectId: true },
      });
      if (skill?.projectId) {
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, skill.projectId),
          columns: { name: true, context: true },
        });
        if (project?.context) {
          systemPrompt += `\n\n## Project Context: ${project.name}\n${project.context}`;
        }
      }
    }

    if (hasSkill) {
      systemPrompt += `\n\n## Current Skill\n\`\`\`markdown\n${skillContent}\n\`\`\`\n\n## Tools\nUse tools for modifications. Never show code to copy.\nDo ONE change per response. After user accepts, they'll ask for the next one.\n\nAvailable:\n- edit_skill: rewrite SKILL.md\n- update_frontmatter_field: update one field\n- edit_file: create/update reference/script/asset file\n- save_note: remember something`;
    }

    const encoder = new TextEncoder();

    // Single streaming call - no agentic loop
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: useModel.includes("haiku") ? 4096 : 8192,
        system: systemPrompt,
        messages,
        stream: true,
        ...(hasSkill ? { tools: TOOLS } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `${res.status}`;
      try { errMsg = JSON.parse(errText)?.error?.message || errMsg; } catch (e) { console.error("[ai-chat] parse error response", e); }
      return NextResponse.json({ error: errMsg }, { status: res.status });
    }

    const reader = res.body?.getReader();
    if (!reader) return NextResponse.json({ error: "No stream" }, { status: 500 });

    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let currentToolName = "";
        let currentToolId = "";
        let currentToolInput = "";
        let currentBlockType = "";

        // Keepalive: send ping every 10s so connection doesn't die silently
        const keepalive = setInterval(() => {
          try { sendEvent(controller, encoder, { type: "ping" }); } catch {}
        }, 10000);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const event = JSON.parse(data);
                if (event.type === "content_block_start") {
                  currentBlockType = event.content_block?.type || "";
                  if (currentBlockType === "tool_use") {
                    currentToolName = event.content_block.name || "";
                    currentToolId = event.content_block.id || "";
                    currentToolInput = "";
                  }
                } else if (event.type === "content_block_delta") {
                  if (event.delta?.type === "text_delta" && event.delta.text) {
                    sendEvent(controller, encoder, { type: "text_delta", text: event.delta.text });
                  } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
                    currentToolInput += event.delta.partial_json;
                  }
                } else if (event.type === "content_block_stop") {
                  if (currentBlockType === "tool_use" && currentToolName) {
                    let input: Record<string, string> = {};
                    try { input = JSON.parse(currentToolInput); } catch (e) { console.error("[ai-chat] parse tool input", e); }

                    // Execute save_note server-side
                    if (currentToolName === "save_note" && input.note && skillId) {
                      try {
                        const skill = await db.query.skills.findFirst({
                          where: and(eq(skills.id, skillId), eq(skills.userId, userId!)),
                          columns: { aiNotes: true },
                        });
                        const notes = (skill?.aiNotes as Array<{ note: string; createdAt: string }>) || [];
                        await db.update(skills).set({
                          aiNotes: [...notes.slice(-19), { note: input.note, createdAt: new Date().toISOString() }],
                        }).where(eq(skills.id, skillId));
                      } catch (e) { console.error("[ai-chat] save_note", e); }
                    }

                    sendEvent(controller, encoder, { type: "tool_use", name: currentToolName, input });
                    currentToolName = "";
                    currentToolInput = "";
                  }
                  currentBlockType = "";
                }
              } catch (e) { console.error("[ai-chat] parse stream event", e); }
            }
          }
          // After stream complete, increment if using server key
          if (usingServerKey) {
            const { incrementAiUsage } = await import("@/lib/ai-usage");
            await incrementAiUsage(userId, "chat");
          }
          sendEvent(controller, encoder, { type: "done" });
        } catch (e) {
          sendEvent(controller, encoder, { type: "error", error: (e as Error).message });
        } finally {
          clearInterval(keepalive);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
