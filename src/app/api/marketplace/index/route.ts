import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceSkills } from "@/db/schema";
import { CREATORS } from "@/lib/marketplace-data";
import { sql } from "drizzle-orm";

// Index all marketplace skills from GitHub repos
// POST /api/marketplace/index?secret=INDEXING_SECRET
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.INDEXING_SECRET || "praxl-index-2026")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { creator: string; skills: number; error?: string }[] = [];
  const allSkills: typeof marketplaceSkills.$inferInsert[] = [];

  for (const creator of CREATORS) {
    try {
      const skills = await fetchSkillsFromGitHub(creator.github);
      const descs = await fetchDescriptionsParallel(creator.github, skills);

      for (const skill of skills) {
        const desc = descs[skill.path] || "";
        const slug = skill.name.toLowerCase().replace(/\s+/g, "-");
        allSkills.push({
          creatorId: creator.id,
          creatorName: creator.name,
          repo: creator.github,
          slug,
          name: skill.name,
          description: desc,
          path: skill.path,
          category: creator.category,
          searchText: `${skill.name} ${desc} ${slug} ${creator.name}`.toLowerCase(),
        });
      }

      results.push({ creator: creator.id, skills: skills.length });
    } catch (e) {
      results.push({ creator: creator.id, skills: 0, error: (e as Error).message });
    }
  }

  // Truncate and insert all
  if (allSkills.length > 0) {
    await db.delete(marketplaceSkills);
    // Insert in chunks of 100
    for (let i = 0; i < allSkills.length; i += 100) {
      await db.insert(marketplaceSkills).values(allSkills.slice(i, i + 100));
    }
  }

  return NextResponse.json({
    indexed: allSkills.length,
    creators: results,
  });
}

// GET /api/marketplace/index - return index stats
export async function GET() {
  const count = await db.select({ count: sql<number>`count(*)` }).from(marketplaceSkills);
  return NextResponse.json({ totalSkills: Number(count[0]?.count || 0) });
}

// ─── GitHub fetching helpers ─────────────────────────────────────────────────

interface GitHubItem { name: string; path: string; type: string }

function humanize(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchSkillsFromGitHub(repo: string): Promise<{ name: string; path: string }[]> {
  const paths = ["skills", ".", "src/skills", "agent-skills"];

  for (const basePath of paths) {
    try {
      const url = basePath === "."
        ? `https://api.github.com/repos/${repo}/contents`
        : `https://api.github.com/repos/${repo}/contents/${basePath}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const items: GitHubItem[] = await res.json();
      if (!Array.isArray(items)) continue;

      const skills = items
        .filter((item) => item.type === "dir" && !item.name.startsWith("."))
        .map((item) => ({ name: humanize(item.name), path: item.path }));

      if (skills.length > 0) return skills;
    } catch { continue; }
  }
  return [];
}

async function fetchDescriptionsParallel(
  repo: string,
  skills: { name: string; path: string }[]
): Promise<Record<string, string>> {
  const descs: Record<string, string> = {};
  const headers: Record<string, string> = {
    ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
  };

  // Batch 10 at a time
  for (let i = 0; i < skills.length; i += 10) {
    const batch = skills.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (skill) => {
        for (const filename of ["SKILL.md", "skill.md", "README.md"]) {
          try {
            const url = `https://raw.githubusercontent.com/${repo}/main/${skill.path}/${filename}`;
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
            if (!res.ok) continue;
            const text = await res.text();
            const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
            if (fmMatch) {
              const descMatch = fmMatch[1].match(/description:\s*["']?(.*?)["']?\s*$/m);
              if (descMatch) return { path: skill.path, desc: descMatch[1].trim() };
            }
            for (const line of text.split("\n")) {
              const t = line.trim();
              if (t && !t.startsWith("#") && !t.startsWith("---") && t.length > 10) {
                return { path: skill.path, desc: t.slice(0, 200) };
              }
            }
          } catch { continue; }
        }
        return { path: skill.path, desc: "" };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        descs[r.value.path] = r.value.desc;
      }
    }
  }
  return descs;
}
