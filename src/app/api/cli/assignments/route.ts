import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skillTargetAssignments, syncTargets, skills, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// CLI fetches which skills go to which platforms
export async function GET(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, token) });
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const targets = await db.query.syncTargets.findMany({
    where: eq(syncTargets.userId, token),
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
