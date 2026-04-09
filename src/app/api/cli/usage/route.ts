import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { skillUsageEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

// Auto-migrate
async function ensureTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS skill_usage_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        skill_slug varchar(255) NOT NULL,
        platform varchar(50) NOT NULL,
        used_at timestamp NOT NULL,
        reported_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS skill_usage_events_user_id_idx ON skill_usage_events(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS skill_usage_events_used_at_idx ON skill_usage_events(used_at)`);
  } catch {}
}
ensureTable();

// DELETE /api/cli/usage - clear all usage events for this user
export async function DELETE(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
  await db.delete(skillUsageEvents).where(eq(skillUsageEvents.userId, token));
  return NextResponse.json({ cleared: true });
}

// POST /api/cli/usage - receive batched usage events from CLI
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-praxl-token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  try {
    const body = await request.json();
    const events = body.events as Array<{ slug: string; platform: string; usedAt: string }>;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ received: 0 });
    }

    // Cap at 500 events per batch to prevent abuse
    const batch = events.slice(0, 500);

    await db.insert(skillUsageEvents).values(
      batch.map((e) => ({
        userId: token,
        skillSlug: e.slug,
        platform: e.platform,
        usedAt: new Date(e.usedAt),
      }))
    );

    return NextResponse.json({ received: batch.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record usage" },
      { status: 500 }
    );
  }
}
