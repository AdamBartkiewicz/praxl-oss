import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

// Client-side error reporting endpoint
// POST /api/errors { message, stack, url, userAgent }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const error = {
      message: String(body.message || "Unknown error").slice(0, 500),
      stack: String(body.stack || "").slice(0, 2000),
      url: String(body.url || "").slice(0, 500),
      userAgent: request.headers.get("user-agent")?.slice(0, 200) || "",
      timestamp: new Date().toISOString(),
    };

    // Store in app_settings as a rotating log (keep last 100)
    const existing = await db.query.appSettings.findFirst({
      where: (s, { eq }) => eq(s.key, "error_log"),
    });

    const logs: typeof error[] = existing?.value
      ? JSON.parse(existing.value)
      : [];
    logs.push(error);
    const trimmed = logs.slice(-100);

    if (existing) {
      const { eq } = await import("drizzle-orm");
      await db.update(appSettings).set({ value: JSON.stringify(trimmed) }).where(eq(appSettings.id, existing.id));
    } else {
      await db.insert(appSettings).values({
        userId: "system",
        key: "error_log",
        value: JSON.stringify(trimmed),
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// GET /api/errors - view error log (protected by middleware)
export async function GET() {
  const existing = await db.query.appSettings.findFirst({
    where: (s, { eq }) => eq(s.key, "error_log"),
  });
  const logs = existing?.value ? JSON.parse(existing.value) : [];
  return NextResponse.json({ errors: logs, count: logs.length });
}
