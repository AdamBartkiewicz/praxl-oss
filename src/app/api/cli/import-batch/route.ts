import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skills, skillVersions, syncTargets, skillTargetAssignments, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const PLATFORM_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  "cursor": "Cursor",
  "codex": "Codex CLI",
  "copilot": "GitHub Copilot",
  "windsurf": "Windsurf",
  "opencode": "OpenCode",
  "gemini-cli": "Gemini CLI",
  "openclaw": "OpenClaw",
};

const PLATFORM_PATHS: Record<string, string> = {
  "claude-code": "~/.claude/skills/",
  "cursor": "~/.cursor/skills/",
  "codex": "~/.agents/skills/",
  "copilot": "~/.agents/skills/",
  "windsurf": "~/.windsurf/skills/",
  "opencode": "~/.opencode/skills/",
  "gemini-cli": "~/.claude/skills/",
  "openclaw": "~/.openclaw/skills/",
};

// CLI pushes local skill content for batch import
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, token) });
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const items = body.skills as Array<{
    slug: string;
    name: string;
    content: string;
    platform: string;
  }>;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ imported: 0, targets: 0 });
  }

  // Filter by allowed slugs if provided (from onboarding selection)
  const allowedSlugs = body.slugs as string[] | undefined;
  const filteredItems = allowedSlugs?.length
    ? items.filter((i) => allowedSlugs.includes(i.slug))
    : items;

  if (filteredItems.length === 0) {
    return NextResponse.json({ imported: 0, targets: 0 });
  }

  // 1. Auto-create sync targets for each discovered platform
  const discoveredPlatforms = [...new Set(filteredItems.map((i) => i.platform))];
  const targetsCreated: string[] = [];

  for (const platform of discoveredPlatforms) {
    const existing = await db.query.syncTargets.findFirst({
      where: and(eq(syncTargets.userId, token), eq(syncTargets.platform, platform)),
    });
    if (!existing) {
      const targetId = uuid();
      await db.insert(syncTargets).values({
        id: targetId,
        userId: token,
        platform,
        label: PLATFORM_LABELS[platform] || platform,
        basePath: PLATFORM_PATHS[platform] || "",
        isActive: true,
        syncMode: "manual",
      });
      targetsCreated.push(platform);
    }
  }

  // Re-fetch all user targets for assignment
  const userTargets = await db.query.syncTargets.findMany({
    where: eq(syncTargets.userId, token),
  });
  const targetByPlatform = Object.fromEntries(userTargets.map((t) => [t.platform, t]));

  // 2. Import skills
  let imported = 0;
  for (const item of filteredItems.slice(0, 200)) {
    const existing = await db.query.skills.findFirst({
      where: and(eq(skills.slug, item.slug), eq(skills.userId, token)),
    });
    if (existing) {
      // Skill exists - just ensure it's assigned to this platform's target
      const target = targetByPlatform[item.platform];
      if (target) {
        const assignmentExists = await db.query.skillTargetAssignments.findFirst({
          where: and(
            eq(skillTargetAssignments.skillId, existing.id),
            eq(skillTargetAssignments.targetId, target.id),
          ),
        });
        if (!assignmentExists) {
          await db.insert(skillTargetAssignments).values({
            skillId: existing.id,
            targetId: target.id,
            deployedVersion: existing.currentVersion,
          });
        }
      }
      continue;
    }

    const id = uuid();
    const description = extractDescription(item.content);

    await db.insert(skills).values({
      id,
      userId: token,
      slug: item.slug,
      name: item.name || item.slug,
      description,
      content: item.content,
      currentVersion: 1,
      tags: [],
      platformHints: [item.platform],
    });

    await db.insert(skillVersions).values({
      skillId: id,
      version: 1,
      content: item.content,
      description,
      changelog: "Imported from local machine",
      author: "cli",
    });

    // Auto-assign to the source platform's sync target
    const target = targetByPlatform[item.platform];
    if (target) {
      await db.insert(skillTargetAssignments).values({
        skillId: id,
        targetId: target.id,
        deployedVersion: 1,
      });
    }

    imported++;
  }

  return NextResponse.json({
    imported,
    total: items.length,
    targets: targetsCreated.length,
    targetPlatforms: targetsCreated,
  });
}

function extractDescription(content: string): string {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (match) {
    const descMatch = match[1].match(/description:\s*["']?(.+?)["']?\s*$/m);
    if (descMatch) return descMatch[1].slice(0, 500);
  }
  const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
  return (lines[0] || "").slice(0, 500);
}
