import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { skills, skillFiles, appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const CLAWHUB_API = "https://clawhub.ai/api/v1";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.userId;

  const body = await request.json();
  const { skillId, version } = body as { skillId: string; version: string };

  if (!skillId || !version) {
    return NextResponse.json({ error: "skillId and version required" }, { status: 400 });
  }

  // Get ClawHub token from user settings
  const tokenSetting = await db.query.appSettings.findFirst({
    where: and(eq(appSettings.userId, userId), eq(appSettings.key, "clawhub_token")),
  });
  if (!tokenSetting?.value) {
    return NextResponse.json({ error: "ClawHub token not configured. Add it in Settings." }, { status: 400 });
  }

  // Get skill
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
  });
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  // Get reference files
  const files = await db.query.skillFiles.findMany({
    where: eq(skillFiles.skillId, skillId),
  });

  // Build SKILL.md content with proper frontmatter
  let content = skill.content;
  if (!content.startsWith("---")) {
    // Add frontmatter if missing
    content = `---
name: ${skill.slug}
description: ${skill.description}
version: ${version}
---

${content}`;
  } else {
    // Update version in existing frontmatter
    content = content.replace(/^(---\n[\s\S]*?)(\n---)/m, (match, fm, end) => {
      if (fm.includes("version:")) {
        return fm.replace(/version:\s*.+/m, `version: ${version}`) + end;
      }
      return fm + `\nversion: ${version}` + end;
    });
  }

  // Build multipart form data
  const formData = new FormData();
  formData.append("slug", skill.slug);
  formData.append("name", skill.name);
  formData.append("version", version);
  formData.append("description", skill.description);

  // Create a Blob for SKILL.md
  const skillBlob = new Blob([content], { type: "text/markdown" });
  formData.append("skillMd", skillBlob, "SKILL.md");

  // Add reference files
  for (const file of files) {
    const fileBlob = new Blob([file.content], { type: file.mimeType });
    formData.append("files", fileBlob, `${file.folder}/${file.filename}`);
  }

  try {
    const res = await fetch(`${CLAWHUB_API}/skills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenSetting.value}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `ClawHub API error: ${res.status} - ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, url: `https://clawhub.ai/${skill.slug}`, data });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to publish: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
