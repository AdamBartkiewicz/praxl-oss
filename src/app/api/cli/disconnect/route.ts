import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateCliOrSession } from "@/lib/cli-auth";

export async function POST(request: NextRequest) {
  // Support both web (session) and CLI (token header).
  const auth = await authenticateCliOrSession(request);
  if (!auth.ok) {
    const error = auth.source === "cli" ? "Invalid or expired token" : "Not authenticated";
    return NextResponse.json({ error }, { status: 401 });
  }
  const userId = auth.userId;
  const calledFromCli = auth.source === "cli";

  try {
    // Clear heartbeat = CLI appears offline immediately
    await db.delete(appSettings).where(
      and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, userId))
    );

    // If called from web, send disconnect command to CLI
    // If called from CLI itself, no need (CLI is already exiting)
    if (!calledFromCli) {
      const existing = await db.query.appSettings.findFirst({
        where: and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, userId)),
      });
      const command = JSON.stringify({ action: "disconnect", timestamp: new Date().toISOString() });
      if (existing) {
        await db.update(appSettings).set({ value: command }).where(
          and(eq(appSettings.key, "cli_pending_sync"), eq(appSettings.userId, userId))
        );
      } else {
        await db.insert(appSettings).values({ userId, key: "cli_pending_sync", value: command });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
