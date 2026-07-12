import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateCliRequest, authenticateCliOrSession } from "@/lib/cli-auth";

// Version requirements - update these when shipping breaking changes
const CLI_MIN_VERSION = "1.0.0";       // Below this: hard block, must update
const CLI_RECOMMENDED_VERSION = "1.0.6"; // Below this: soft warning

// CLI sends heartbeat every poll interval
export async function POST(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  const { userId } = auth;

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
    where: and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, userId)),
  });
  if (existing) {
    await db.update(appSettings).set({ value: info }).where(and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, userId)));
  } else {
    await db.insert(appSettings).values({ userId, key: "cli_heartbeat", value: info });
  }

  // Check if there are pending deploy commands from the web app
  const pendingDeploy = await db.query.appSettings.findFirst({
    where: and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, userId)),
  });

  let command = null;
  if (pendingDeploy?.value) {
    command = JSON.parse(pendingDeploy.value);
    // Clear the pending command
    await db.delete(appSettings).where(and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, userId)));
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
  // Accepts either a CLI token (daemon) or a browser session (web app).
  const auth = await authenticateCliOrSession(request);
  if (!auth.ok) {
    // A bad CLI token is a hard error; an absent session just means "not online".
    if (auth.source === "cli") return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    return NextResponse.json({ online: false });
  }
  const userId = auth.userId;

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
