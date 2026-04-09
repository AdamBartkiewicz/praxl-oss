export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function validateSkillName(name: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!name) {
    issues.push({ field: "name", message: "Name is required", severity: "error" });
    return issues;
  }

  if (name !== name.toLowerCase()) {
    issues.push({ field: "name", message: "Name must be lowercase (kebab-case)", severity: "error" });
  }

  if (/\s/.test(name)) {
    issues.push({ field: "name", message: "Name cannot contain spaces. Use hyphens instead", severity: "error" });
  }

  if (/_/.test(name)) {
    issues.push({ field: "name", message: "Name cannot contain underscores. Use hyphens instead", severity: "error" });
  }

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    issues.push({ field: "name", message: "Name must be kebab-case: lowercase letters, numbers, and hyphens only", severity: "error" });
  }

  if (name.includes("claude") || name.includes("anthropic")) {
    issues.push({ field: "name", message: '"claude" and "anthropic" are reserved and cannot be used in skill names', severity: "error" });
  }

  return issues;
}

export function validateDescription(description: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!description) {
    issues.push({ field: "description", message: "Description is required", severity: "error" });
    return issues;
  }

  if (description.length > 1024) {
    issues.push({ field: "description", message: `Description is ${description.length} chars. Maximum is 1024`, severity: "error" });
  }

  if (/<|>/.test(description)) {
    issues.push({ field: "description", message: "Description cannot contain XML angle brackets (< >)", severity: "error" });
  }

  // Check for WHAT component
  const hasWhat = description.length > 20;
  // Check for WHEN component - trigger phrases
  const whenPatterns = /\b(use when|use for|use this|trigger|when user|when you|helps with|use if)\b/i;
  const hasWhen = whenPatterns.test(description);

  if (!hasWhat) {
    issues.push({ field: "description", message: "Description should explain WHAT the skill does", severity: "warning" });
  }

  if (!hasWhen) {
    issues.push({ field: "description", message: 'Description should include WHEN to use it (trigger conditions). Add phrases like "Use when..." or "Use for..."', severity: "warning" });
  }

  return issues;
}

export function validateFrontmatter(frontmatter: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!frontmatter.name) {
    issues.push({ field: "frontmatter", message: "Frontmatter must include 'name' field", severity: "error" });
  } else {
    issues.push(...validateSkillName(frontmatter.name as string));
  }

  if (!frontmatter.description) {
    issues.push({ field: "frontmatter", message: "Frontmatter must include 'description' field", severity: "error" });
  } else {
    issues.push(...validateDescription(frontmatter.description as string));
  }

  // Check for XML in any string field
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === "string" && /<|>/.test(value)) {
      issues.push({ field: key, message: `Field "${key}" contains forbidden XML angle brackets`, severity: "error" });
    }
  }

  return issues;
}

export function validateSkillContent(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!content || content.trim().length === 0) {
    issues.push({ field: "content", message: "Skill content is empty", severity: "error" });
    return issues;
  }

  // Check for frontmatter
  if (!content.startsWith("---")) {
    issues.push({ field: "content", message: "SKILL.md must start with YAML frontmatter (--- delimiters)", severity: "error" });
  }

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    issues.push({ field: "content", message: "Invalid or unclosed YAML frontmatter. Must have opening and closing ---", severity: "error" });
    return issues;
  }

  // Check for instructions section
  const body = content.slice(fmMatch[0].length);
  if (!/^#+\s/m.test(body)) {
    issues.push({ field: "content", message: "Skill body should have structured sections with headings (#)", severity: "warning" });
  }

  // Check for examples
  if (!/example/i.test(body)) {
    issues.push({ field: "content", message: "Consider adding examples to help Claude understand expected usage", severity: "warning" });
  }

  // Check for error handling
  if (!/error|troubleshoot|issue|fail/i.test(body)) {
    issues.push({ field: "content", message: "Consider adding error handling or troubleshooting section", severity: "warning" });
  }

  // Word count check
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount > 5000) {
    issues.push({ field: "content", message: `SKILL.md body has ~${wordCount} words. Keep under 5,000 and move details to references/`, severity: "warning" });
  }

  return issues;
}

export function validateSkill(skill: {
  name: string;
  description: string;
  content: string;
}): ValidationResult {
  // Extract the kebab-case name from frontmatter, not the display name
  const fmMatch = skill.content.match(/^---\n[\s\S]*?^name:\s*(.+)$/m);
  const frontmatterName = fmMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || skill.name;

  const allIssues = [
    ...validateSkillName(frontmatterName),
    ...validateDescription(skill.description),
    ...validateSkillContent(skill.content),
  ];

  return {
    valid: allIssues.filter((i) => i.severity === "error").length === 0,
    errors: allIssues.filter((i) => i.severity === "error"),
    warnings: allIssues.filter((i) => i.severity === "warning"),
  };
}

// Quality checklist items from the guide
export interface ChecklistItem {
  id: string;
  category: "planning" | "development" | "pre-upload" | "post-upload";
  label: string;
  autoCheck?: (skill: { name: string; description: string; content: string }) => boolean;
}

export const qualityChecklist: ChecklistItem[] = [
  // Planning
  { id: "use-cases", category: "planning", label: "Identified 2-3 concrete use cases" },
  { id: "tools-identified", category: "planning", label: "Tools identified (built-in or MCP)" },
  { id: "folder-structure", category: "planning", label: "Planned folder structure" },

  // Development
  {
    id: "kebab-case",
    category: "development",
    label: "Folder named in kebab-case",
    autoCheck: (s) => /^[a-z][a-z0-9-]*$/.test(s.name),
  },
  {
    id: "frontmatter",
    category: "development",
    label: "YAML frontmatter has --- delimiters",
    autoCheck: (s) => s.content.startsWith("---") && s.content.indexOf("---", 3) > 3,
  },
  {
    id: "name-valid",
    category: "development",
    label: "Name field: kebab-case, no spaces, no capitals",
    autoCheck: (s) => validateSkillName(s.name).filter((i) => i.severity === "error").length === 0,
  },
  {
    id: "desc-what-when",
    category: "development",
    label: "Description includes WHAT and WHEN",
    autoCheck: (s) => validateDescription(s.description).length === 0,
  },
  {
    id: "no-xml",
    category: "development",
    label: "No XML tags (< >) anywhere in frontmatter",
    autoCheck: (s) => !/<|>/.test(s.description) && !/<|>/.test(s.name),
  },
  {
    id: "instructions-clear",
    category: "development",
    label: "Instructions are clear and actionable",
  },
  {
    id: "error-handling",
    category: "development",
    label: "Error handling included",
    autoCheck: (s) => /error|troubleshoot|issue|fail/i.test(s.content),
  },
  {
    id: "examples-provided",
    category: "development",
    label: "Examples provided",
    autoCheck: (s) => /example/i.test(s.content),
  },

  // Pre-upload
  { id: "test-trigger-obvious", category: "pre-upload", label: "Tested triggering on obvious tasks" },
  { id: "test-trigger-paraphrase", category: "pre-upload", label: "Tested triggering on paraphrased requests" },
  { id: "test-no-false-trigger", category: "pre-upload", label: "Verified doesn't trigger on unrelated topics" },
  { id: "functional-tests", category: "pre-upload", label: "Functional tests pass" },

  // Post-upload
  { id: "test-real", category: "post-upload", label: "Test in real conversations" },
  { id: "monitor-triggering", category: "post-upload", label: "Monitor for under/over-triggering" },
  { id: "collect-feedback", category: "post-upload", label: "Collect user feedback" },
];

// Generate proper SKILL.md from structured data
export function generateSkillMd(data: {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  metadata?: Record<string, string>;
  body: string;
}): string {
  const lines: string[] = ["---"];
  lines.push(`name: ${data.name}`);

  // Multi-line description
  if (data.description.includes("\n") || data.description.length > 80) {
    lines.push(`description: >`);
    const descLines = data.description.split("\n");
    descLines.forEach((l) => lines.push(`  ${l.trim()}`));
  } else {
    lines.push(`description: ${data.description}`);
  }

  if (data.license) {
    lines.push(`license: ${data.license}`);
  }
  if (data.compatibility) {
    lines.push(`compatibility: ${data.compatibility}`);
  }
  if (data.allowedTools) {
    lines.push(`allowed-tools: "${data.allowedTools}"`);
  }
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    lines.push("metadata:");
    for (const [key, value] of Object.entries(data.metadata)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(data.body);

  return lines.join("\n");
}

// Parse SKILL.md into structured data
export function parseSkillMd(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const yamlStr = match[1];
  const body = match[2].trim();

  // Simple YAML parser for skill frontmatter
  const frontmatter: Record<string, unknown> = {};
  let currentKey = "";
  let currentValue = "";
  let inMultiline = false;
  let inMetadata = false;
  const metadata: Record<string, string> = {};

  for (const line of yamlStr.split("\n")) {
    if (inMetadata) {
      if (line.startsWith("  ") && line.includes(":")) {
        const [k, ...v] = line.trim().split(":");
        metadata[k.trim()] = v.join(":").trim();
        continue;
      } else {
        frontmatter.metadata = metadata;
        inMetadata = false;
      }
    }

    if (inMultiline) {
      if (line.startsWith("  ")) {
        currentValue += (currentValue ? " " : "") + line.trim();
        continue;
      } else {
        frontmatter[currentKey] = currentValue;
        inMultiline = false;
      }
    }

    if (!line.includes(":")) continue;

    const colonIdx = line.indexOf(":");
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "metadata") {
      inMetadata = true;
      continue;
    }

    if (value === ">" || value === "|") {
      currentKey = key;
      currentValue = "";
      inMultiline = true;
      continue;
    }

    frontmatter[key] = value.replace(/^["']|["']$/g, "");
  }

  if (inMultiline) {
    frontmatter[currentKey] = currentValue;
  }
  if (inMetadata && Object.keys(metadata).length > 0) {
    frontmatter.metadata = metadata;
  }

  return { frontmatter, body };
}
