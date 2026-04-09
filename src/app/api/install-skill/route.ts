import { NextRequest, NextResponse } from "next/server";
import { securityScan } from "@/lib/security-scan";

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const allowedHosts = ["raw.githubusercontent.com", "api.github.com"];
    if (!allowedHosts.includes(parsed.hostname)) return false;
    if (parsed.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

interface InstalledSkill {
  name: string;
  slug: string;
  description: string;
  content: string;
  files: { folder: string; filename: string; content: string; mimeType: string; size: number }[];
  source: string;
}

// Parse "npx skills add https://github.com/owner/repo --skill skill-name [--path path/to/skill]" command
function parseCommand(cmd: string): { repoUrl: string; skillName: string; skillPath?: string } | null {
  // Remove "npx skills add " prefix variations
  const cleaned = cmd.replace(/^\$?\s*npx\s+skills\s+add\s+/, "").trim();

  // Extract --skill name
  const skillMatch = cleaned.match(/--skill\s+(\S+)/);
  const skillName = skillMatch?.[1] || "";

  // Extract --path (for nested skills)
  const pathMatch = cleaned.match(/--path\s+(\S+)/);
  const skillPath = pathMatch?.[1];

  // Extract repo URL (strip all flags)
  const urlPart = cleaned
    .replace(/--skill\s+\S+/, "")
    .replace(/--path\s+\S+/, "")
    .trim();

  if (!urlPart || !skillName) return null;
  return { repoUrl: urlPart, skillName, skillPath };
}

// Convert GitHub URL to raw content URL
function toRawUrl(repoUrl: string, branch: string, path: string): string {
  // Handle various GitHub URL formats
  let owner = "", repo = "";

  const ghMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (ghMatch) {
    owner = ghMatch[1];
    repo = ghMatch[2].replace(/\.git$/, "");
  }

  if (!owner || !repo) return "";
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

// Try to fetch a file, trying multiple branches
async function fetchFromRepo(repoUrl: string, path: string): Promise<string | null> {
  for (const branch of ["main", "master"]) {
    const url = toRawUrl(repoUrl, branch, path);
    if (!url) continue;
    if (!isAllowedUrl(url)) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 5 * 1024 * 1024) continue; // 5MB limit
      return text;
    } catch (e) { console.error("[install-skill] fetchFromRepo", e); }
  }
  return null;
}

// List files in a GitHub directory via API
async function listGitHubDir(repoUrl: string, dirPath: string): Promise<string[]> {
  const ghMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!ghMatch) return [];
  const owner = ghMatch[1];
  const repo = ghMatch[2].replace(/\.git$/, "");

  for (const branch of ["main", "master"]) {
    try {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
      if (!isAllowedUrl(apiUrl)) continue;
      const res = await fetch(apiUrl, {
        headers: { "Accept": "application/vnd.github.v3+json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const items = await res.json();
      if (Array.isArray(items)) {
        return items.filter((i: { type: string }) => i.type === "file").map((i: { name: string }) => i.name);
      }
    } catch (e) { console.error("[install-skill] listGitHubDir", e); }
  }
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command, repoUrl: directRepo, skillName: directSkill, skillPath: directPath } = body as {
      command?: string;
      repoUrl?: string;
      skillName?: string;
      skillPath?: string;
    };

    let repoUrl: string;
    let skillName: string;
    let pathsToTryOverride: string[] = [];

    const input = (command || "").trim();

    if (input) {
      // Try parsing as npx skills add command
      const parsed = parseCommand(input);
      if (parsed) {
        repoUrl = parsed.repoUrl;
        skillName = parsed.skillName;
        if (parsed.skillPath) {
          // Prepend explicit path to paths to try
          pathsToTryOverride = [`${parsed.skillPath}/SKILL.md`, `${parsed.skillPath}/skill.md`];
        }
      }
      // Try parsing as skills.sh URL: https://skills.sh/owner/repo/skill-name
      else if (input.includes("skills.sh/")) {
        const match = input.match(/skills\.sh\/([^\/]+)\/([^\/]+)\/([^\/\s]+)/);
        if (match) {
          repoUrl = `https://github.com/${match[1]}/${match[2]}`;
          skillName = match[3];
        } else {
          return NextResponse.json({ error: "Invalid skills.sh URL. Expected: https://skills.sh/owner/repo/skill-name" }, { status: 400 });
        }
      }
      // Try parsing as GitHub URL: https://github.com/owner/repo/tree/main/skills/skill-name
      else if (input.includes("github.com/")) {
        const treeMatch = input.match(/github\.com\/([^\/]+)\/([^\/]+)\/tree\/[^\/]+\/(.*)/);
        if (treeMatch) {
          repoUrl = `https://github.com/${treeMatch[1]}/${treeMatch[2]}`;
          skillName = treeMatch[3].split("/").pop() || treeMatch[3];
        } else {
          const simpleMatch = input.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
          if (simpleMatch) {
            repoUrl = `https://github.com/${simpleMatch[1]}/${simpleMatch[2]}`;
            skillName = simpleMatch[2].replace(/\.git$/, "");
          } else {
            return NextResponse.json({ error: "Could not parse GitHub URL" }, { status: 400 });
          }
        }
      }
      else {
        return NextResponse.json({ error: "Paste an npx skills add command, a skills.sh URL, or a GitHub URL" }, { status: 400 });
      }
    } else if (directRepo && directSkill) {
      repoUrl = directRepo;
      skillName = directSkill;
    } else {
      return NextResponse.json({ error: "Provide a command, skills.sh URL, or GitHub URL" }, { status: 400 });
    }

    // Try multiple folder structures to find SKILL.md
    // If explicit path provided (nested repos), try it first
    const pathsToTry = [
      ...pathsToTryOverride,
      ...(directPath ? [`${directPath}/SKILL.md`, `${directPath}/skill.md`] : []),
      `skills/${skillName}/SKILL.md`,
      `${skillName}/SKILL.md`,
      `skills/${skillName}/skill.md`,
      `${skillName}/skill.md`,
      `SKILL.md`, // root level if skillName matches repo name
    ];

    let content: string | null = null;
    let foundPath = "";
    for (const p of pathsToTry) {
      content = await fetchFromRepo(repoUrl, p);
      if (content) { foundPath = p; break; }
    }

    if (!content) {
      return NextResponse.json({
        error: `Could not find SKILL.md for "${skillName}" in repository. Tried: ${pathsToTry.join(", ")}`,
      }, { status: 404 });
    }

    // Security scan before processing
    const scanResult = securityScan(content);
    if (scanResult.criticalCount > 0) {
      return NextResponse.json(
        {
          error: "security_blocked",
          flags: scanResult.flags,
          message: "This skill contains potentially dangerous patterns.",
        },
        { status: 422 },
      );
    }

    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let description = "";
    let name = skillName;

    if (fmMatch) {
      const yaml = fmMatch[1];
      const descMatch = yaml.match(/^description:\s*(.+)$/m);
      const nameMatch = yaml.match(/^name:\s*(.+)$/m);
      if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, "");
      if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
    }

    // Try to fetch reference files (use same base path as SKILL.md)
    const basePath = foundPath.replace(/\/?(SKILL|skill)\.md$/, "");
    const files: InstalledSkill["files"] = [];
    for (const folder of ["references", "scripts", "assets"]) {
      const dirPath = basePath ? `${basePath}/${folder}` : folder;
      const fileNames = await listGitHubDir(repoUrl, dirPath);

      for (const fileName of fileNames) {
        const fileContent = await fetchFromRepo(repoUrl, `${dirPath}/${fileName}`);
        if (fileContent) {
          const isText = /\.(md|txt|json|yaml|yml|py|sh|js|ts|html|css|csv)$/i.test(fileName);
          files.push({
            folder,
            filename: fileName,
            content: isText ? fileContent : Buffer.from(fileContent).toString("base64"),
            mimeType: isText ? "text/plain" : "application/octet-stream",
            size: fileContent.length,
          });
        }
      }
    }

    const result: InstalledSkill = {
      name: name.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      slug: skillName,
      description,
      content,
      files,
      source: `${repoUrl} → ${foundPath}`,
    };

    return NextResponse.json({
      skill: result,
      ...(scanResult.warningCount > 0 ? { securityFlags: scanResult.flags } : {}),
    });
  } catch (error) {
    console.error("Install skill error:", error);
    return NextResponse.json({ error: "Failed to install skill" }, { status: 500 });
  }
}
