// Shared AI tool definitions for chat (usable in browser or server)

export const CHAT_TOOLS = [
  {
    name: "create_plan",
    description: "Create a multi-step plan when the user's request requires multiple actions (e.g. 'refactor skill' = restructure + create references + shorten main). ALWAYS call this FIRST for multi-step tasks before making any edits. Skip for simple single-step requests.",
    input_schema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "Ordered list of concrete steps to complete. Each step should be ONE clear action.",
          items: { type: "string" },
        },
        reasoning: { type: "string", description: "Brief explanation of the plan (1 sentence)" },
      },
      required: ["steps"],
    },
  },
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
      properties: {
        field: { type: "string" },
        value: { type: "string" },
        summary: { type: "string" },
      },
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
        filename: { type: "string" },
        content: { type: "string" },
        summary: { type: "string" },
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

export interface SkillFile {
  folder: string;
  filename: string;
  content: string;
  mimeType?: string;
}

export interface AiNote {
  note: string;
  createdAt: string;
}

// Returns system blocks with cache_control for prompt caching (90% cost reduction).
// Stable parts (expert prompt + reference files) are cached; volatile parts (skill content) are not.
export function buildChatSystemBlocks(
  baseSystemPrompt: string,
  skillContent?: string,
  files?: SkillFile[],
  notes?: AiNote[],
): Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> {
  const blocks: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }> = [];

  // Block 1: Stable expert prompt (CACHEABLE)
  blocks.push({
    type: "text",
    text: baseSystemPrompt,
    cache_control: { type: "ephemeral" },
  });

  // Block 2: Reference files (CACHEABLE - stable across turns until files change)
  if (files && files.length > 0) {
    const textFiles = files.filter(f =>
      (f.mimeType?.startsWith("text/") || f.mimeType === "application/json" || !f.mimeType) &&
      /\.(md|txt|json|yaml|yml|py|sh|js|ts|html|css|csv|xml)$/i.test(f.filename)
    );
    const otherFiles = files.filter(f => !textFiles.includes(f));

    let totalSize = 0;
    const MAX_CONTEXT_FILES_SIZE = 50_000;
    const includedFiles: SkillFile[] = [];
    const truncatedFiles: SkillFile[] = [];
    for (const file of textFiles) {
      if (totalSize + file.content.length < MAX_CONTEXT_FILES_SIZE) {
        includedFiles.push(file);
        totalSize += file.content.length;
      } else {
        truncatedFiles.push(file);
      }
    }

    let filesText = "## Reference Files in Skill\n";
    if (includedFiles.length > 0) {
      filesText += "\nFull contents:\n";
      for (const f of includedFiles) {
        filesText += `\n### ${f.folder}/${f.filename}\n\`\`\`\n${f.content}\n\`\`\`\n`;
      }
    }
    if (truncatedFiles.length > 0 || otherFiles.length > 0) {
      filesText += "\nOther files (content not shown):\n";
      for (const f of [...truncatedFiles, ...otherFiles]) {
        filesText += `- ${f.folder}/${f.filename}${f.mimeType ? ` (${f.mimeType})` : ""}\n`;
      }
    }
    blocks.push({ type: "text", text: filesText, cache_control: { type: "ephemeral" } });
  }

  // Block 3: Persistent memory from save_note (CACHEABLE)
  if (notes && notes.length > 0) {
    const recent = notes.slice(-10); // last 10 notes
    const notesText = `## Persistent Memory (from past sessions)\n\nNotes you've saved about this skill:\n${recent.map((n, i) => `${i + 1}. [${new Date(n.createdAt).toLocaleDateString()}] ${n.note}`).join("\n")}`;
    blocks.push({ type: "text", text: notesText, cache_control: { type: "ephemeral" } });
  }

  // Block 4: Volatile skill content (NOT cached - changes every turn)
  if (skillContent && skillContent.length > 10) {
    const currentSkillText = `## Current Skill (REAL current state - this IS what's in the skill right now)
\`\`\`markdown
${skillContent}
\`\`\`

## Tools
Use tools for modifications. Never show code to copy.
Do ONE change per response. After user accepts, they'll ask for the next one.

Available:
- create_plan: for multi-step requests, call FIRST with list of steps
- edit_skill: rewrite SKILL.md
- update_frontmatter_field: update one field
- edit_file: create/update reference/script/asset file (you can read existing files above and edit them)
- save_note: remember something about this skill for future sessions

## Multi-step workflow

For complex requests that need multiple actions:
1. FIRST call: create_plan with all steps listed
2. After plan is created, IMMEDIATELY call the tool for step 1 in the SAME response
3. User accepts → system auto-continues by asking you for next step
4. When user says "continue" or similar, execute the NEXT uncompleted step from your plan
5. When all steps done, respond with "Plan complete. All X steps finished." - do NOT call more tools.

Example:
User: "Refactor: split into 3 files"
You: [create_plan with steps: "1. Create file A", "2. Create file B", "3. Update main skill"] then [edit_file for step 1]
User: "continue"
You: [edit_file for step 2]
User: "continue"
You: [edit_skill for step 3]
User: "continue"
You: "Plan complete. All 3 steps finished."

NEVER create_plan twice in a row. If you see "Execute step N from the plan" in user's message, the plan ALREADY EXISTS. Call the edit tool directly. DO NOT create a new plan.

## CRITICAL: Task isolation - each turn is independent

The "Current Skill" above ALREADY includes any previously accepted changes. Your starting point is ALWAYS what's shown above - NOT some older version.

For EVERY new turn:
1. Read the user's LATEST message
2. Identify ONLY what they asked for in THAT message
3. Do ONLY that ONE thing
4. If using edit_skill, your output must be: [current skill above] + [your ONE new change]

DO NOT:
- Re-apply changes from previous turns (they're ALREADY in "Current Skill" above)
- Combine the current request with previous tasks
- Re-include rejected changes
- Add improvements the user didn't ask for

EXAMPLE:
Turn 1: User: "shorten the description" → You: edit_skill with shorter description → ACCEPTED
Turn 2: User: "add examples" → You should ONLY add examples. The description is already updated in "Current Skill". Do NOT rewrite it. Just add the Examples section.`;
    blocks.push({ type: "text", text: currentSkillText });
  }

  return blocks;
}

// Legacy string version (kept for non-streaming AI calls that don't use caching)
export function buildChatSystemPrompt(
  baseSystemPrompt: string,
  skillContent?: string,
  files?: SkillFile[],
): string {
  let systemPrompt = baseSystemPrompt;
  if (skillContent && skillContent.length > 10) {
    systemPrompt += `\n\n## Current Skill\n\`\`\`markdown\n${skillContent}\n\`\`\``;

    // Include reference files if they exist
    if (files && files.length > 0) {
      // Show text files with content (up to 50KB total), list others just by name
      const textFiles = files.filter(f =>
        (f.mimeType?.startsWith("text/") || f.mimeType === "application/json" || !f.mimeType) &&
        /\.(md|txt|json|yaml|yml|py|sh|js|ts|html|css|csv|xml)$/i.test(f.filename)
      );
      const otherFiles = files.filter(f => !textFiles.includes(f));

      let totalSize = 0;
      const MAX_CONTEXT_FILES_SIZE = 50_000;
      const includedFiles: SkillFile[] = [];
      const truncatedFiles: SkillFile[] = [];

      for (const file of textFiles) {
        if (totalSize + file.content.length < MAX_CONTEXT_FILES_SIZE) {
          includedFiles.push(file);
          totalSize += file.content.length;
        } else {
          truncatedFiles.push(file);
        }
      }

      systemPrompt += `\n\n## Reference Files in Skill\n`;
      if (includedFiles.length > 0) {
        systemPrompt += `\nFull contents:\n`;
        for (const f of includedFiles) {
          systemPrompt += `\n### ${f.folder}/${f.filename}\n\`\`\`\n${f.content}\n\`\`\`\n`;
        }
      }
      if (truncatedFiles.length > 0 || otherFiles.length > 0) {
        systemPrompt += `\nOther files in skill (content not shown, ask user if needed):\n`;
        for (const f of [...truncatedFiles, ...otherFiles]) {
          systemPrompt += `- ${f.folder}/${f.filename}${f.mimeType ? ` (${f.mimeType})` : ""}\n`;
        }
      }
    }

    systemPrompt += `\n\n## Tools\nUse tools for modifications. Never show code to copy.\nDo ONE change per response. After user accepts, they'll ask for the next one.\n\nAvailable:\n- edit_skill: rewrite SKILL.md\n- update_frontmatter_field: update one field\n- edit_file: create/update reference/script/asset file (you can read existing files above and edit them)\n- save_note: remember something

## CRITICAL: Handling rejected proposals
The "Current Skill" section above ALWAYS shows the REAL current state. If a previous edit was marked REJECTED, those changes are NOT in the skill. Your new edits must:
- Start from the "Current Skill" content shown above (the REAL state)
- Do ONLY what the user's LATEST message asks
- NEVER re-include rejected changes
- If unsure whether something was accepted, trust the "Current Skill" content above`;
  }
  return systemPrompt;
}
