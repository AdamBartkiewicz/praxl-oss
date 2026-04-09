import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skills, skillVersions, users } from "@/db/schema";
import { eq, and, lt, desc, sql } from "drizzle-orm";

export const maxDuration = 300;

// Open-source: no version trimming by plan. Keep all versions.
// This cron is kept for optional cleanup of very old versions if needed.
const RETENTION_DAYS = 365; // Keep 1 year of history

export async function GET(request: NextRequest) {
  // Vercel Cron auth: requests include "Authorization: Bearer CRON_SECRET"
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const allUsers = await db.select({ id: users.id }).from(users);
  if (allUsers.length === 0) {
    return NextResponse.json({ ok: true, trimmed: 0, usersScanned: 0 });
  }

  let trimmed = 0;

  for (const user of allUsers) {
    const userSkills = await db.select({ id: skills.id }).from(skills).where(eq(skills.userId, user.id));
    for (const s of userSkills) {
      // Find the latest version id (to protect it)
      const latest = await db.select({ id: skillVersions.id })
        .from(skillVersions)
        .where(eq(skillVersions.skillId, s.id))
        .orderBy(desc(skillVersions.createdAt))
        .limit(1);
      const latestId = latest[0]?.id;

      const deleteWhere = latestId
        ? and(
            eq(skillVersions.skillId, s.id),
            lt(skillVersions.createdAt, cutoff),
            sql`${skillVersions.id} <> ${latestId}`,
          )
        : and(eq(skillVersions.skillId, s.id), lt(skillVersions.createdAt, cutoff));

      const result = await db.delete(skillVersions).where(deleteWhere);
      trimmed += (result as unknown as { rowCount?: number }).rowCount || 0;
    }
  }

  return NextResponse.json({
    ok: true,
    trimmed,
    usersScanned: allUsers.length,
    cutoff: cutoff.toISOString(),
  });
}
