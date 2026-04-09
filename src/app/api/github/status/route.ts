import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ connected: false, error: "Not authenticated" });
    const userId = session.userId;

    // Get GitHub PAT from settings
    const patSetting = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "github_pat"), eq(appSettings.userId, userId)),
    });

    if (!patSetting?.value) {
      return NextResponse.json({ connected: false, error: "GitHub not connected. Add a Personal Access Token in Settings." });
    }

    const ghToken = patSetting.value;

    // Verify token works by fetching GitHub user
    const ghRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json" },
    });

    if (ghRes.ok) {
      const ghUser = await ghRes.json();
      return NextResponse.json({
        connected: true,
        username: ghUser.login,
        name: ghUser.name,
        avatar: ghUser.avatar_url,
      });
    }

    return NextResponse.json({ connected: false, error: "GitHub token expired or invalid. Update it in Settings." });
  } catch {
    return NextResponse.json({ connected: false, error: "Not authenticated" });
  }
}
