import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { skills, skillFiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ skillId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.userId;

  const { skillId } = await params;

  const skill = await db.query.skills.findFirst({
    where: eq(skills.id, skillId),
  });

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  if (skill.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const files = await db.query.skillFiles.findMany({
    where: eq(skillFiles.skillId, skillId),
  });

  const zip = new JSZip();
  const folderName = `${skill.slug}-v${skill.currentVersion}`;
  const folder = zip.folder(folderName)!;

  // Add SKILL.md
  folder.file("SKILL.md", skill.content);

  // Add reference/script/asset files
  for (const file of files) {
    const subFolder = folder.folder(file.folder)!;
    // Check if content is base64 (binary files)
    if (file.mimeType.startsWith("text/") || file.mimeType === "application/json") {
      subFolder.file(file.filename, file.content);
    } else {
      // Binary - decode base64
      const binary = Buffer.from(file.content, "base64");
      subFolder.file(file.filename, binary);
    }
  }

  const zipArrayBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folderName}.zip"`,
    },
  });
}
