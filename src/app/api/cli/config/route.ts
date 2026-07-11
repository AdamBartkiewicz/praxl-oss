import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncTargets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateCliRequest } from "@/lib/cli-auth";

// CLI fetches this to know which platforms/skills to sync
export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });

  const targets = await db.query.syncTargets.findMany({
    where: eq(syncTargets.userId, auth.userId),
  });

  return NextResponse.json({
    targets: targets.map((t) => ({
      id: t.id,
      platform: t.platform,
      label: t.label,
      basePath: t.basePath,
      isActive: t.isActive,
      syncMode: t.syncMode,
      includeTags: t.includeTags,
      excludeTags: t.excludeTags,
    })),
  });
}
