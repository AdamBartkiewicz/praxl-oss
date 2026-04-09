import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { localSkillState, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// CLI reports what skills exist locally per platform
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, token) });
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json();
  const { skills: localSkills } = body as {
    skills: Array<{ platform: string; slug: string; localPath: string; sizeBytes: number; lastModified?: string }>;
  };

  if (!localSkills) return NextResponse.json({ error: "skills array required" }, { status: 400 });

  // Clear old state for this user
  await db.delete(localSkillState).where(eq(localSkillState.userId, token));

  // Insert new state
  if (localSkills.length > 0) {
    await db.insert(localSkillState).values(
      localSkills.map((s) => ({
        userId: token,
        platform: s.platform,
        slug: s.slug,
        localPath: s.localPath,
        sizeBytes: s.sizeBytes,
        lastModified: s.lastModified ? new Date(s.lastModified) : null,
      }))
    );
  }

  return NextResponse.json({ ok: true, count: localSkills.length });
}
