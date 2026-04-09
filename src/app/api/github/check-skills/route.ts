import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Check which skills exist in the user's GitHub repo
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ slugs: [], connected: false });
    const userId = session.userId;

    // Get repo
    const repoSetting = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "github_repo"), eq(appSettings.userId, userId)),
    });
    if (!repoSetting?.value) return NextResponse.json({ slugs: [], connected: false, error: "No repo configured" });
    const repo = repoSetting.value;

    // Get GitHub token from PAT setting
    const patSetting = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "github_pat"), eq(appSettings.userId, userId)),
    });
    const ghToken = patSetting?.value || null;

    if (!ghToken) return NextResponse.json({ slugs: [], connected: false, error: "No GitHub token" });

    // List skills/ directory in repo
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/skills?ref=main`, {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json" },
    });

    if (!res.ok) return NextResponse.json({ slugs: [], connected: true, repo });

    const items = await res.json();
    const slugs = Array.isArray(items)
      ? items.filter((i: { type: string }) => i.type === "dir").map((i: { name: string }) => i.name)
      : [];

    return NextResponse.json({ slugs, connected: true, repo });
  } catch {
    return NextResponse.json({ slugs: [], connected: false });
  }
}
