import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Version requirements - update these when shipping breaking changes
const CLI_MIN_VERSION = "1.0.0";       // Below this: hard block, must update
const CLI_RECOMMENDED_VERSION = "1.0.6"; // Below this: soft warning

// CLI sends heartbeat every poll interval
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, token) });
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cliVersion = body.version || "unknown";
  const info = JSON.stringify({
    lastSeen: new Date().toISOString(),
    platforms: body.platforms || [],
    hostname: body.hostname || "unknown",
    mode: body.mode || "sync",
    skillCount: body.skillCount || 0,
    cliVersion,
  });

  // Upsert heartbeat
  const existing = await db.query.appSettings.findFirst({
    where: and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, token)),
  });
  if (existing) {
    await db.update(appSettings).set({ value: info }).where(and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, token)));
  } else {
    await db.insert(appSettings).values({ userId: token, key: "cli_heartbeat", value: info });
  }

  // Check if there are pending deploy commands from the web app
  const pendingDeploy = await db.query.appSettings.findFirst({
    where: and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, token)),
  });

  let command = null;
  if (pendingDeploy?.value) {
    command = JSON.parse(pendingDeploy.value);
    // Clear the pending command
    await db.delete(appSettings).where(and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, token)));
  }

  return NextResponse.json({
    ok: true,
    command,
    versionPolicy: {
      minimum: CLI_MIN_VERSION,
      recommended: CLI_RECOMMENDED_VERSION,
    },
  });
}

// Web app checks if CLI is online
export async function GET(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");

  // Also support cookie-based auth for web app
  let userId = token;
  if (!userId) {
    try {
      const { getSession } = await import("@/lib/auth");
      const session = await getSession();
      userId = session?.userId ?? null;
    } catch (e) { console.error("[cli-heartbeat] auth", e); }
  }

  if (!userId) return NextResponse.json({ online: false });

  const heartbeat = await db.query.appSettings.findFirst({
    where: and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, userId)),
  });

  if (!heartbeat?.value) return NextResponse.json({ online: false });

  try {
    const data = JSON.parse(heartbeat.value);
    const lastSeen = new Date(data.lastSeen);
    const secondsAgo = (Date.now() - lastSeen.getTime()) / 1000;
    const online = secondsAgo < 90; // Consider online if heartbeat within 90s

    return NextResponse.json({
      online,
      lastSeen: data.lastSeen,
      secondsAgo: Math.round(secondsAgo),
      platforms: data.platforms,
      hostname: data.hostname,
      mode: data.mode,
      skillCount: data.skillCount,
    });
  } catch {
    return NextResponse.json({ online: false });
  }
}
