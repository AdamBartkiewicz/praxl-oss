import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncTargets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateCliRequest } from "@/lib/cli-auth";

// CLI fetches which skills go to which platforms
export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });

  const targets = await db.query.syncTargets.findMany({
    where: eq(syncTargets.userId, auth.userId),
  });

  const assignments = await db.query.skillTargetAssignments.findMany({
    with: { skill: { columns: { id: true, slug: true } }, target: { columns: { id: true, platform: true } } },
  });

  // Filter to this user's targets
  const targetIds = new Set(targets.map(t => t.id));
  const userAssignments = assignments.filter(a => targetIds.has(a.targetId));

  // Build map: platform → [slugs]
  const platformSkills: Record<string, string[]> = {};
  for (const a of userAssignments) {
    const platform = a.target.platform;
    if (!platformSkills[platform]) platformSkills[platform] = [];
    platformSkills[platform].push(a.skill.slug);
  }

  return NextResponse.json({
    assignments: platformSkills,
    hasAssignments: userAssignments.length > 0,
  });
}
