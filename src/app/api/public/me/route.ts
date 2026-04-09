import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const ALLOWED_ORIGINS = new Set([
  APP_URL,
  "http://localhost:3000",
  "http://localhost:3001",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request.headers.get("origin"));
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ loggedIn: false }, { headers });
    }
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });
    return NextResponse.json(
      { loggedIn: true, plan: "pro", firstName: user?.name || null },
      { headers },
    );
  } catch {
    return NextResponse.json({ loggedIn: false }, { headers });
  }
}
