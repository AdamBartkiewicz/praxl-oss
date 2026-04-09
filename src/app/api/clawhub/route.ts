import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchClawHub, trendingClawHub, latestClawHub, getClawHubSkill } from "@/lib/clawhub";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.userId;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "trending";
  const query = url.searchParams.get("q") || "";
  const slug = url.searchParams.get("slug") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

  if (action === "search" && query) {
    const results = await searchClawHub(query, limit);
    return NextResponse.json({ skills: results });
  }

  if (action === "get" && slug) {
    const skill = await getClawHubSkill(slug);
    if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ skill });
  }

  if (action === "latest") {
    const results = await latestClawHub(limit);
    return NextResponse.json({ skills: results });
  }

  // Default: trending
  const results = await trendingClawHub(limit);
  return NextResponse.json({ skills: results });
}
