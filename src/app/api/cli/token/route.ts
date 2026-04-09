import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Returns the user's CLI token (which is their user ID)
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ token: session.userId });
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
}
