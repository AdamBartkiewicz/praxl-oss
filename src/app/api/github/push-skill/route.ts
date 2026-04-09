import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { skills, skillFiles, appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const userId = session.userId;

    const { skillId } = await request.json();
    if (!skillId) return NextResponse.json({ error: "skillId required" }, { status: 400 });

    // Get saved repo
    const repoSetting = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "github_repo"), eq(appSettings.userId, userId)),
    });
    if (!repoSetting?.value) {
      return NextResponse.json({ error: "No GitHub repo configured. Set it in Settings." }, { status: 400 });
    }
    const repo = repoSetting.value;

    // Get GitHub token from PAT setting
    const patSetting = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "github_pat"), eq(appSettings.userId, userId)),
    });
    const ghToken = patSetting?.value || null;

    if (!ghToken) {
      return NextResponse.json({ error: "No GitHub token. Add a Personal Access Token in Settings." }, { status: 400 });
    }

    // Verify token has repo access
    const verifyRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json" },
    });
    if (!verifyRes.ok) {
      const verifyErr = await verifyRes.json().catch(() => ({}));
      return NextResponse.json({
        error: `Cannot access repo "${repo}": ${verifyRes.status} ${verifyErr.message || ""}. Check your Personal Access Token permissions.`,
      }, { status: 400 });
    }

    // Get skill
    const skill = await db.query.skills.findFirst({ where: eq(skills.id, skillId) });
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

    const branch = "main";
    const results: string[] = [];

    // Push SKILL.md
    const skillPath = `skills/${skill.slug}/SKILL.md`;
    let sha: string | undefined;
    try {
      const existing = await fetch(`https://api.github.com/repos/${repo}/contents/${skillPath}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json" },
      });
      if (existing.ok) sha = (await existing.json()).sha;
    } catch (e) { console.error("[push-skill] get existing sha", e); }

    const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${skillPath}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Update ${skill.slug} v${skill.currentVersion} from Praxl`,
        content: Buffer.from(skill.content).toString("base64"),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });

    if (pushRes.ok) {
      results.push(`SKILL.md pushed`);
    } else {
      const err = await pushRes.json();
      return NextResponse.json({ error: `GitHub push failed: ${err.message}` }, { status: 500 });
    }

    // Push reference files
    const files = await db.query.skillFiles.findMany({ where: eq(skillFiles.skillId, skill.id) });
    for (const file of files) {
      const filePath = `skills/${skill.slug}/${file.folder}/${file.filename}`;
      let fileSha: string | undefined;
      try {
        const ex = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
          headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json" },
        });
        if (ex.ok) fileSha = (await ex.json()).sha;
      } catch (e) { console.error("[push-skill] get file sha", e); }

      const isText = file.mimeType.startsWith("text/") || file.mimeType === "application/json";
      await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Update ${file.folder}/${file.filename} from Praxl`,
          content: isText ? Buffer.from(file.content).toString("base64") : file.content,
          branch,
          ...(fileSha ? { sha: fileSha } : {}),
        }),
      });
      results.push(`${file.folder}/${file.filename} pushed`);
    }

    return NextResponse.json({
      success: true,
      repo,
      skill: skill.slug,
      version: skill.currentVersion,
      files: results.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
