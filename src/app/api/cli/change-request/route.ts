import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skillChangeRequests, skills } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { securityScan } from "@/lib/security-scan";
import { rateLimiter } from "@/lib/rate-limit";
import { authenticateCliRequest, authenticateCliOrSession } from "@/lib/cli-auth";

// CLI submits a change request when local file differs from deployed version
export async function POST(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  const { userId } = auth;

  const rl = rateLimiter.check(`cli:change-request:${userId}`, 30, 60 * 60 * 1000);
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
        eq(skillChangeRequests.userId, userId),
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
      where: and(eq(skills.slug, change.slug), eq(skills.userId, userId)),
    });

    const status = scanResult.criticalCount > 0 ? "security_review" : "pending";

    await db.insert(skillChangeRequests).values({
      userId,
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
  // Accepts either a CLI token (daemon) or a browser session (web app).
  const auth = await authenticateCliOrSession(request);
  if (!auth.ok) {
    // A bad CLI token is a hard error; an absent session just means "no pending".
    if (auth.source === "cli") return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    return NextResponse.json({ count: 0 });
  }
  const userId = auth.userId;

  const pending = await db.query.skillChangeRequests.findMany({
    where: and(
      eq(skillChangeRequests.userId, userId),
      eq(skillChangeRequests.status, "pending")
    ),
  });

  return NextResponse.json({ count: pending.length });
}
