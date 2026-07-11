import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { localSkillState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateCliRequest } from "@/lib/cli-auth";

// CLI reports what skills exist locally per platform
export async function POST(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });

  const body = await request.json();
  const { skills: localSkills } = body as {
    skills: Array<{ platform: string; slug: string; localPath: string; sizeBytes: number; lastModified?: string }>;
  };

  if (!localSkills) return NextResponse.json({ error: "skills array required" }, { status: 400 });

  // Clear old state for this user
  await db.delete(localSkillState).where(eq(localSkillState.userId, auth.userId));

  // Insert new state
  if (localSkills.length > 0) {
    await db.insert(localSkillState).values(
      localSkills.map((s) => ({
        userId: auth.userId,
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
