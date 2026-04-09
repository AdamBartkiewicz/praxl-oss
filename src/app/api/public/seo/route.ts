import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const SYSTEM_USER = "__system__";
const SEO_PREFIX = "seo_";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const rows = await db.query.appSettings.findMany({
    where: and(eq(appSettings.userId, SYSTEM_USER)),
  });

  const seo: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith(SEO_PREFIX)) {
      seo[row.key.slice(SEO_PREFIX.length)] = row.value;
    }
  }

  return NextResponse.json(seo, { headers: CORS_HEADERS });
}
