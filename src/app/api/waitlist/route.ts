import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { sql } from "drizzle-orm";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  "http://localhost:3000",
  "http://localhost:3001",
]);

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400, headers: corsHeaders });
    }

    // Ensure table exists
    await db.execute(sql`CREATE TABLE IF NOT EXISTS waitlist (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) UNIQUE NOT NULL,
      plan varchar(50) DEFAULT 'pro' NOT NULL,
      source varchar(100) DEFAULT 'landing' NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )`);

    // Insert (ignore if already exists)
    try {
      await db.execute(sql`INSERT INTO waitlist (email, plan, source) VALUES (${email}, 'pro', 'landing') ON CONFLICT (email) DO NOTHING`);
    } catch { /* ignore */ }

    // Log for admin
    try {
      await db.insert(appSettings).values({
        userId: "system",
        key: `waitlist_${Date.now()}`,
        value: JSON.stringify({ email, plan: "pro", timestamp: new Date().toISOString() }),
      });
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: corsHeaders });
  }
}
