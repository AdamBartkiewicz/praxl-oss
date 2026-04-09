import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skillChangeRequests, skills, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { securityScan } from "@/lib/security-scan";
import { rateLimiter } from "@/lib/rate-limit";

// CLI submits a change request when local file differs from deployed version
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, token) });
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const rl = rateLimiter.check(`cli:change-request:${token}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const body = await request.json();
  const { changes } = body as {
    changes: Array<{
      slug: string;
      platform: string;
      oldContent: string | null;
      newContent: string;
    }>;
  };

  if (!changes?.length) return NextResponse.json({ created: 0 });

  let created = 0;
  const securityFlagsBySlug: Record<string, import("@/lib/security-scan").SecurityFlag[]> = {};

  for (const change of changes) {
    // Security scan the new content
    const scanResult = securityScan(change.newContent);
    if (scanResult.flags.length > 0) {
      securityFlagsBySlug[change.slug] = scanResult.flags;
    }
    // Check if pending request already exists for this slug+platform
    const existing = await db.query.skillChangeRequests.findFirst({
      where: and(
        eq(skillChangeRequests.userId, token),
        eq(skillChangeRequests.slug, change.slug),
        eq(skillChangeRequests.platform, change.platform),
        eq(skillChangeRequests.status, "pending")
      ),
    });

    if (existing) {
      // Update existing pending request for this platform with latest content
      await db.update(skillChangeRequests)
        .set({ newContent: change.newContent, createdAt: new Date() })
        .where(eq(skillChangeRequests.id, existing.id));
      continue;
    }

    // Find matching skill in DB
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.slug, change.slug), eq(skills.userId, token)),
    });

    const status = scanResult.criticalCount > 0 ? "security_review" : "pending";

    await db.insert(skillChangeRequests).values({
      userId: token,
      skillId: skill?.id || null,
      slug: change.slug,
      source: "local",
      platform: change.platform,
      oldContent: change.oldContent,
      newContent: change.newContent,
      status,
    });
    created++;
  }

  return NextResponse.json({
    created,
    ...(Object.keys(securityFlagsBySlug).length > 0 ? { securityFlags: securityFlagsBySlug } : {}),
  });
}

// GET: Count pending change requests
export async function GET(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");

  let userId = token;
  if (!userId) {
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      userId = session?.userId ?? null;
    } catch (e) { console.error("[change-request] auth", e); }
  }

  if (!userId) return NextResponse.json({ count: 0 });

  const pending = await db.query.skillChangeRequests.findMany({
    where: and(
      eq(skillChangeRequests.userId, userId),
      eq(skillChangeRequests.status, "pending")
    ),
  });

  return NextResponse.json({ count: pending.length });
}
