import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skills, skillFiles, skillVersions, skillTargetAssignments, syncTargets, syncLog, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { rateLimiter } from "@/lib/rate-limit";

// GET: Returns skills with deployed version content per platform
export async function GET(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "x-praxl-token header required" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, token) });
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const rl = rateLimiter.check(`cli:sync:${token}`, 60, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const since = request.nextUrl.searchParams.get("since");

  // Get user's targets
  const userTargets = await db.query.syncTargets.findMany({
    where: eq(syncTargets.userId, token),
  });

  // Get all assignments with deployed versions
  const assignments = await db.query.skillTargetAssignments.findMany({
    with: {
      skill: true,
      target: { columns: { id: true, platform: true } },
    },
  });

  // Filter to user's targets
  const targetIds = new Set(userTargets.map(t => t.id));
  const userAssignments = assignments.filter(a => targetIds.has(a.targetId));

  // Group by skill and get the right version content
  const skillMap = new Map<string, {
    id: string; slug: string; name: string; content: string;
    currentVersion: number; deployedVersion: number;
    updatedAt: Date; isActive: boolean;
    files: { folder: string; filename: string; content: string; mimeType: string }[];
    platforms: string[];
  }>();

  for (const a of userAssignments) {
    const skill = a.skill;
    if (!skill.isActive) continue;

    // Skip if incremental and nothing was DEPLOYED since last sync
    // Only react to deployedAt changes - NOT updatedAt (which changes on every save)
    if (since) {
      const sinceDate = new Date(since);
      const deployedAt = a.deployedAt ? new Date(a.deployedAt) : new Date(0);
      if (deployedAt < sinceDate) continue;
    }

    const key = `${skill.id}:${a.target.platform}`;
    if (skillMap.has(key)) {
      skillMap.get(key)!.platforms.push(a.target.platform);
      continue;
    }

    // Get deployed version content (not latest!)
    let content = skill.content;
    if (a.deployedVersion < skill.currentVersion) {
      const version = await db.query.skillVersions.findFirst({
        where: and(
          eq(skillVersions.skillId, skill.id),
          eq(skillVersions.version, a.deployedVersion)
        ),
      });
      if (version) content = version.content;
    }

    const files = await db.query.skillFiles.findMany({
      where: eq(skillFiles.skillId, skill.id),
      columns: { folder: true, filename: true, content: true, mimeType: true },
    });

    skillMap.set(key, {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      content,
      currentVersion: skill.currentVersion,
      deployedVersion: a.deployedVersion,
      updatedAt: skill.updatedAt,
      isActive: skill.isActive,
      files,
      platforms: [a.target.platform],
    });
  }

  // Log sync operations - only for incremental syncs with actual deployed changes
  // Deduplicate: skip if same skill+target+version was already logged
  const syncedSkills = Array.from(skillMap.values());
  if (since && syncedSkills.length > 0) {
    const logEntries = [];
    for (const s of syncedSkills) {
      const assignment = userAssignments.find(a => a.skill.id === s.id);
      if (assignment) {
        // Check if this exact version was already logged for this target
        const existing = await db.query.syncLog.findFirst({
          where: and(
            eq(syncLog.skillId, s.id),
            eq(syncLog.targetId, assignment.targetId),
            eq(syncLog.versionSynced, s.deployedVersion),
          ),
          orderBy: [desc(syncLog.syncedAt)],
        });
        if (!existing) {
          logEntries.push({
            skillId: s.id,
            targetId: assignment.targetId,
            versionSynced: s.deployedVersion,
            status: "success",
          });
        }
      }
    }
    if (logEntries.length > 0) {
      try {
        await db.insert(syncLog).values(logEntries);
      } catch { /* don't fail sync if logging fails */ }
    }
  }

  return NextResponse.json({
    skills: syncedSkills,
    syncedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email, name: user.name },
  });
}
