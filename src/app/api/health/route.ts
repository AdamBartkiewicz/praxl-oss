import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  let database = "connected";

  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    database = "error";
  }

  return NextResponse.json({
    status: "ok",
    database,
    timestamp: new Date().toISOString(),
  });
}
