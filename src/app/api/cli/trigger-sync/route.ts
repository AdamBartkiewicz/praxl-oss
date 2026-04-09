import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Web app triggers a sync on the connected CLI
export async function POST() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = session.userId;

    const command = JSON.stringify({ action: "sync", timestamp: new Date().toISOString() });

    const existing = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, userId)),
    });
    if (existing) {
      await db.update(appSettings).set({ value: command }).where(and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, userId)));
    } else {
      await db.insert(appSettings).values({ userId, key: "cli_pending_sync", value: command });
    }

    return NextResponse.json({ ok: true, message: "Sync command queued. CLI will pick it up on next heartbeat." });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
