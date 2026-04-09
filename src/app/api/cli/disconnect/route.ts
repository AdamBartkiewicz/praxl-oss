import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { appSettings, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  // Support both web (session) and CLI (token header)
  let userId: string | null = null;

  const token = request.headers.get("x-praxl-token");
  if (token) {
    const user = await db.query.users.findFirst({ where: eq(users.id, token) });
    if (user) userId = user.id;
  }

  if (!userId) {
    const session = await getSession();
    userId = session?.userId ?? null;
  }

  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    // Clear heartbeat = CLI appears offline immediately
    await db.delete(appSettings).where(
      and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, userId))
    );

    // If called from web, send disconnect command to CLI
    // If called from CLI itself, no need (CLI is already exiting)
    if (!token) {
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
