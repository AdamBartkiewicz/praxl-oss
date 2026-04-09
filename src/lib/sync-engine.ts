import fs from "fs";
import path from "path";
import os from "os";

export interface SyncResult {
  skillId: string;
  skillName: string;
  targetId: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  path?: string;
}

// Resolve ~ and env vars in paths
function resolvePath(p: string): string {
  let resolved = p;
  if (resolved.startsWith("~/")) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  }
  resolved = resolved.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || "");
  return resolved;
}

// Platform default paths
export const PLATFORM_PATHS: Record<string, string> = {
  "claude-code": "~/.claude/skills/",
  "cursor": ".cursor/skills/",
  "codex": ".agents/skills/",
  "gemini-cli": "~/.claude/skills/",
  "copilot": ".agents/skills/",
  "opencode": ".opencode/skills/",
  "windsurf": ".windsurf/skills/",
  "openclaw": "~/.openclaw/skills/",
};

// Write a skill to filesystem
export function writeSkillToPath(
  basePath: string,
  slug: string,
  content: string,
  files: { folder: string; filename: string; content: string; mimeType: string }[] = []
): { success: boolean; fullPath: string; error?: string } {
  const resolved = resolvePath(basePath);
  const skillDir = path.join(resolved, slug);

  try {
    // Create directories
    fs.mkdirSync(skillDir, { recursive: true });

    // Write SKILL.md
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");

    // Write support files
    for (const file of files) {
      const subDir = path.join(skillDir, file.folder);
      fs.mkdirSync(subDir, { recursive: true });

      if (file.mimeType.startsWith("text/") || file.mimeType === "application/json") {
        fs.writeFileSync(path.join(subDir, file.filename), file.content, "utf-8");
      } else {
        // Binary - decode base64
        const buffer = Buffer.from(file.content, "base64");
        fs.writeFileSync(path.join(subDir, file.filename), buffer);
      }
    }

    return { success: true, fullPath: skillDir };
  } catch (err) {
    return {
      success: false,
      fullPath: skillDir,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Remove a skill from filesystem
export function removeSkillFromPath(basePath: string, slug: string): boolean {
  const resolved = resolvePath(basePath);
  const skillDir = path.join(resolved, slug);
  try {
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
    return true;
  } catch {
    return false;
  }
}

// Check if a skill exists at path
export function skillExistsAtPath(basePath: string, slug: string): boolean {
  const resolved = resolvePath(basePath);
  const skillMd = path.join(resolved, slug, "SKILL.md");
  return fs.existsSync(skillMd);
}

// Read a skill from filesystem (for pull/import)
export function readSkillFromPath(basePath: string, slug: string): { content: string; files: { folder: string; filename: string; content: string }[] } | null {
  const resolved = resolvePath(basePath);
  const skillDir = path.join(resolved, slug);
  const skillMd = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMd)) return null;

  const content = fs.readFileSync(skillMd, "utf-8");
  const files: { folder: string; filename: string; content: string }[] = [];

  for (const folder of ["references", "scripts", "assets"]) {
    const subDir = path.join(skillDir, folder);
    if (!fs.existsSync(subDir)) continue;
    const entries = fs.readdirSync(subDir);
    for (const filename of entries) {
      const filePath = path.join(subDir, filename);
      if (fs.statSync(filePath).isFile()) {
        files.push({
          folder,
          filename,
          content: fs.readFileSync(filePath, "utf-8"),
        });
      }
    }
  }

  return { content, files };
}

// List all skills at a base path
export function listSkillsAtPath(basePath: string): string[] {
  const resolved = resolvePath(basePath);
  if (!fs.existsSync(resolved)) return [];

  return fs.readdirSync(resolved).filter((name) => {
    const skillMd = path.join(resolved, name, "SKILL.md");
    return fs.existsSync(skillMd);
  });
}

// Check if path is writable
export function isPathWritable(basePath: string): boolean {
  const resolved = resolvePath(basePath);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    const testFile = path.join(resolved, ".praxl-test");
    fs.writeFileSync(testFile, "test", "utf-8");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}
