import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { skills, skillVersions, skillFiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rateLimiter } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Check auth - either session cookie or API token
  const apiToken = request.headers.get("x-praxl-token");
  let userId: string | null = null;

  if (apiToken) {
    // Token-based auth (from CLI)
    const user = await db.query.users.findFirst({
      where: eq(users.id, apiToken),
    });
    if (user) userId = user.id;
  } else {
    // Session-based auth (from browser)
    try {
      const session = await getSession();
      userId = session?.userId ?? null;
    } catch (e) { console.error("[cli-import] auth", e); }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized. Pass x-praxl-token header or be signed in." }, { status: 401 });
  }

  const rl = rateLimiter.check(`cli:import:${userId}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await request.json();

    // Validate total size
    const totalSize = JSON.stringify(body).length;
    if (totalSize > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Request too large (max 10MB)" }, { status: 413 });
    }

    const { skills: importSkills } = body as {
      skills: Array<{
        slug: string;
        name: string;
        description: string;
        content: string;
        files?: Array<{ folder: string; filename: string; content: string; mimeType?: string; size?: number }>;
      }>;
    };

    if (!importSkills || !Array.isArray(importSkills)) {
      return NextResponse.json({ error: "Invalid body. Expected { skills: [...] }" }, { status: 400 });
    }

    // Validate individual skill content size
    for (const skill of importSkills) {
      if (skill.content && skill.content.length > 500000) {
        return NextResponse.json({ error: `Skill ${skill.slug} content too large (max 500KB)` }, { status: 413 });
      }
    }

    let imported = 0;
    let skipped = 0;

    for (const skill of importSkills) {
      // Check if already exists
      const existing = await db.query.skills.findFirst({
        where: eq(skills.slug, skill.slug),
      });
      if (existing) {
        skipped++;
        continue;
      }

      const [inserted] = await db.insert(skills).values({
        userId,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        currentVersion: 1,
      }).returning({ id: skills.id });

      await db.insert(skillVersions).values({
        skillId: inserted.id,
        version: 1,
        content: skill.content,
        description: skill.description,
        author: "cli-import",
        changelog: "Imported via Praxl CLI",
      });

      if (skill.files && skill.files.length > 0) {
        for (const file of skill.files) {
          await db.insert(skillFiles).values({
            skillId: inserted.id,
            folder: file.folder,
            filename: file.filename,
            content: file.content,
            mimeType: file.mimeType || "text/plain",
            size: file.size || file.content.length,
          });
        }
      }

      imported++;
    }

    return NextResponse.json({ imported, skipped, total: importSkills.length });
  } catch (error) {
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}

// GET endpoint returns user info for token verification
export async function GET(request: NextRequest) {
  const apiToken = request.headers.get("x-praxl-token");
  if (!apiToken) {
    return NextResponse.json({ error: "Pass x-praxl-token header" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, apiToken),
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
