import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncTargets, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// CLI fetches this to know which platforms/skills to sync
export async function GET(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "x-praxl-token required" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, token) });
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const targets = await db.query.syncTargets.findMany({
    where: eq(syncTargets.userId, token),
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
