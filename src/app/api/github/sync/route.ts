import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { skills, skillFiles, appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Push skills to user's GitHub repo
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = session.userId;

    const body = await request.json();
    const { repo, branch = "main" } = body as { repo: string; branch?: string };

    if (!repo) {
      return NextResponse.json({ error: "repo is required (e.g. 'username/my-skills')" }, { status: 400 });
    }

    // Get GitHub token from PAT setting
    const patSetting = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "github_pat"), eq(appSettings.userId, userId)),
    });
    const githubToken = patSetting?.value || null;

    if (!githubToken) {
      return NextResponse.json({ error: "No GitHub token. Add a Personal Access Token in Settings." }, { status: 400 });
    }

    // Get user's skills
    const userSkills = await db.query.skills.findMany({
      where: eq(skills.userId, userId),
    });

    const results: { slug: string; status: string; error?: string }[] = [];

    for (const skill of userSkills) {
      if (!skill.isActive) continue;

      const skillPath = `skills/${skill.slug}/SKILL.md`;

      try {
        let sha: string | undefined;
        try {
          const existing = await fetch(
            `https://api.github.com/repos/${repo}/contents/${skillPath}?ref=${branch}`,
            { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" } }
          );
          if (existing.ok) {
            const data = await existing.json();
            sha = data.sha;
          }
        } catch { /* file doesn't exist yet */ }

        const res = await fetch(
          `https://api.github.com/repos/${repo}/contents/${skillPath}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: `Sync ${skill.slug} v${skill.currentVersion} from Praxl`,
              content: Buffer.from(skill.content).toString("base64"),
              branch,
              ...(sha ? { sha } : {}),
            }),
          }
        );

        if (res.ok) {
          results.push({ slug: skill.slug, status: "synced" });
        } else {
          const err = await res.json();
          results.push({ slug: skill.slug, status: "failed", error: err.message });
        }

        // Also push reference files
        const files = await db.query.skillFiles.findMany({
          where: eq(skillFiles.skillId, skill.id),
        });

        for (const file of files) {
          const filePath = `skills/${skill.slug}/${file.folder}/${file.filename}`;
          let fileSha: string | undefined;

          try {
            const existingFile = await fetch(
              `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`,
              { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" } }
            );
            if (existingFile.ok) {
              const data = await existingFile.json();
              fileSha = data.sha;
            }
          } catch { /* */ }

          const isText = file.mimeType.startsWith("text/") || file.mimeType === "application/json";
          const fileContent = isText ? Buffer.from(file.content).toString("base64") : file.content;

          await fetch(
            `https://api.github.com/repos/${repo}/contents/${filePath}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github.v3+json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: `Sync ${skill.slug}/${file.folder}/${file.filename} from Praxl`,
                content: fileContent,
                branch,
                ...(fileSha ? { sha: fileSha } : {}),
              }),
            }
          );
        }
      } catch (err) {
        results.push({ slug: skill.slug, status: "failed", error: (err as Error).message });
      }
    }

    // Save repo config
    const existing = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "github_repo"), eq(appSettings.userId, userId)),
    });
    if (existing) {
      await db.update(appSettings).set({ value: repo }).where(and(eq(appSettings.key, "github_repo"), eq(appSettings.userId, userId)));
    } else {
      await db.insert(appSettings).values({ userId, key: "github_repo", value: repo });
    }

    const synced = results.filter((r) => r.status === "synced").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({ synced, failed, total: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
