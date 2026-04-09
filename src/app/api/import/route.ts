import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { securityScan, SecurityFlag } from "@/lib/security-scan";

interface ParsedFile {
  folder: string; // "references" | "scripts" | "assets"
  filename: string;
  content: string; // text or base64
  mimeType: string;
  size: number;
}

interface ParsedSkill {
  name: string;
  slug: string;
  description: string;
  content: string;
  folderName: string;
  license: string | null;
  compatibility: string | null;
  allowedTools: string | null;
  skillCategory: string | null;
  pattern: string | null;
  tags: string[];
  platformHints: string[];
  skillMetadata: Record<string, string>;
  files: ParsedFile[];
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  let currentKey = "";
  let currentValue = "";
  let inMultiline = false;
  let inMetadata = false;
  const metadata: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    if (inMetadata) {
      if (line.startsWith("  ") && line.includes(":")) {
        const [k, ...v] = line.trim().split(":");
        metadata[k.trim()] = v.join(":").trim();
        continue;
      } else {
        fm.metadata = metadata;
        inMetadata = false;
      }
    }

    if (inMultiline) {
      if (line.startsWith("  ")) {
        currentValue += (currentValue ? " " : "") + line.trim();
        continue;
      } else {
        fm[currentKey] = currentValue;
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

    // Handle arrays like [tag1, tag2]
    if (value.startsWith("[") && value.endsWith("]")) {
      fm[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }

    fm[key] = value.replace(/^["']|["']$/g, "");
  }

  if (inMultiline) {
    fm[currentKey] = currentValue;
  }
  if (inMetadata && Object.keys(metadata).length > 0) {
    fm.metadata = metadata;
  }

  return fm;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "File must be a .zip archive" },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();

    // Validate ZIP size (max 50MB compressed)
    if (buffer.byteLength > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "ZIP file too large (max 50MB)" }, { status: 413 });
    }

    // Validate ZIP magic bytes
    const header = new Uint8Array(buffer.slice(0, 4));
    if (header[0] !== 0x50 || header[1] !== 0x4B) {
      return NextResponse.json({ error: "Invalid ZIP file" }, { status: 400 });
    }

    const zip = await JSZip.loadAsync(buffer);

    // Limit number of files to prevent zip bombs
    const fileCount = Object.values(zip.files).filter(f => !f.dir).length;
    if (fileCount > 500) {
      return NextResponse.json({ error: "ZIP contains too many files (max 500)" }, { status: 413 });
    }

    const skills: ParsedSkill[] = [];

    // Find all SKILL.md files in the ZIP
    const skillFiles: { path: string; file: JSZip.JSZipObject }[] = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && relativePath.toLowerCase().endsWith("skill.md")) {
        skillFiles.push({ path: relativePath, file: zipEntry });
      }
    });

    for (const { path, file: zipEntry } of skillFiles) {
      const content = await zipEntry.async("string");

      // Extract folder name from path
      const parts = path.split("/");
      const folderName =
        parts.length > 1 ? parts[parts.length - 2] : "root";

      // Parse frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const frontmatter = parseFrontmatter(fmMatch[1]);

      const name =
        (frontmatter.name as string) || folderName;
      const slug = toSlug(name);
      const description = (frontmatter.description as string) || "";

      // Collect files from references/, scripts/, assets/ subfolders
      const parsedFiles: ParsedFile[] = [];
      const skillDir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "";
      const subfolders = ["references", "scripts", "assets"];

      for (const subfolder of subfolders) {
        const prefix = skillDir + subfolder + "/";
        const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
        zip.forEach((p, e) => {
          if (!e.dir && p.startsWith(prefix)) {
            entries.push({ path: p, entry: e });
          }
        });
        for (const { path: filePath, entry } of entries) {
          const filename = filePath.slice(prefix.length);
          if (!filename) continue;
          const isText = /\.(md|txt|json|yaml|yml|py|sh|bash|js|ts|html|css|csv|xml|toml)$/i.test(filename);
          let fileContent: string;
          let mimeType: string;
          if (isText) {
            fileContent = await entry.async("string");
            mimeType = filename.endsWith(".json") ? "application/json" : "text/plain";
          } else {
            const buf = await entry.async("base64");
            fileContent = buf;
            mimeType = filename.endsWith(".png") ? "image/png" :
                       filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" :
                       filename.endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
          }
          const rawBuf = await entry.async("nodebuffer");
          parsedFiles.push({
            folder: subfolder,
            filename,
            content: fileContent,
            mimeType,
            size: rawBuf.length,
          });
        }
      }

      skills.push({
        name,
        slug,
        description,
        content,
        folderName,
        license: (frontmatter.license as string) || null,
        compatibility: (frontmatter.compatibility as string) || null,
        allowedTools:
          (frontmatter["allowed-tools"] as string) ||
          (frontmatter.allowedTools as string) ||
          null,
        skillCategory:
          (frontmatter["skill-category"] as string) ||
          (frontmatter.skillCategory as string) ||
          null,
        pattern: (frontmatter.pattern as string) || null,
        tags: Array.isArray(frontmatter.tags)
          ? (frontmatter.tags as string[])
          : [],
        platformHints: Array.isArray(frontmatter["platform-hints"])
          ? (frontmatter["platform-hints"] as string[])
          : Array.isArray(frontmatter.platformHints)
            ? (frontmatter.platformHints as string[])
            : [],
        skillMetadata:
          (frontmatter.metadata as Record<string, string>) || {},
        files: parsedFiles,
      });
    }

    // Security scan all skills before returning
    const blockedSkills: { name: string; slug: string; flags: SecurityFlag[] }[] = [];
    const warningsBySkill: Record<string, SecurityFlag[]> = {};
    for (const skill of skills) {
      const scanResult = securityScan(skill.content);
      if (scanResult.criticalCount > 0) {
        blockedSkills.push({ name: skill.name, slug: skill.slug, flags: scanResult.flags });
      } else if (scanResult.warningCount > 0) {
        warningsBySkill[skill.slug] = scanResult.flags;
      }
    }

    if (blockedSkills.length > 0) {
      return NextResponse.json(
        {
          error: "security_blocked",
          message: "One or more skills contain potentially dangerous patterns.",
          blockedSkills,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      skills,
      ...(Object.keys(warningsBySkill).length > 0 ? { securityWarnings: warningsBySkill } : {}),
    });
  } catch (error) {
    console.error("ZIP import error:", error);
    return NextResponse.json(
      { error: "Failed to process ZIP file" },
      { status: 500 },
    );
  }
}
