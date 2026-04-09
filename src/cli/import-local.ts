#!/usr/bin/env node
/**
 * Import local skills into Praxl database.
 *
 * Usage:
 *   npx tsx src/cli/import-local.ts [--path ~/.claude/skills] [--user USER_ID]
 *
 * Scans the given directory for folders containing SKILL.md files,
 * imports them with their references/scripts/assets, and creates
 * version 1 for each skill. Skips already-imported skills.
 */

import fs from "fs";
import path from "path";
import postgres from "postgres";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// Parse args
const args = process.argv.slice(2);
let skillsDir = path.join(process.env.HOME || "~", ".claude/skills");
let userId = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--path" && args[i + 1]) { skillsDir = args[++i]; }
  if (args[i] === "--user" && args[i + 1]) { userId = args[++i]; }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("\n  ✗ DATABASE_URL environment variable is required.");
  console.error("    Set it in .env.local or pass it directly:\n");
  console.error("    DATABASE_URL=postgresql://... npx tsx src/cli/import-local.ts\n");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  console.log("\n  Praxl - Import Local Skills");
  console.log("  ═══════════════════════════════\n");

  // Auto-detect user if not provided
  if (!userId) {
    const users = await sql`SELECT id, email, name FROM users ORDER BY created_at DESC LIMIT 1`;
    if (users.length === 0) {
      console.error("  ✗ No users in database. Sign up at the web app first, then re-run.\n");
      await sql.end();
      process.exit(1);
    }
    userId = users[0].id;
    console.log(`  User: ${users[0].name || users[0].email} (${userId})`);
  }

  // Check directory
  if (!fs.existsSync(skillsDir)) {
    console.error(`  ✗ Directory not found: ${skillsDir}`);
    console.error(`    Use --path to specify a different location.\n`);
    await sql.end();
    process.exit(1);
  }

  const dirs = fs.readdirSync(skillsDir).filter((d) => {
    return fs.existsSync(path.join(skillsDir, d, "SKILL.md"));
  });

  console.log(`  Path: ${skillsDir}`);
  console.log(`  Found: ${dirs.length} skill(s)\n`);

  if (dirs.length === 0) {
    console.log("  No skills to import.\n");
    await sql.end();
    return;
  }

  let imported = 0;
  let skipped = 0;

  for (const slug of dirs) {
    const skillDir = path.join(skillsDir, slug);
    const content = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");

    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let description = "";
    if (fmMatch) {
      // Multi-line description support
      const descMatch = fmMatch[1].match(/^description:\s*>?\s*\n?([\s\S]*?)(?=\n\w|\n---)/m);
      const singleDesc = fmMatch[1].match(/^description:\s*(.+)$/m);
      if (descMatch) {
        description = descMatch[1].split("\n").map((l: string) => l.trim()).filter(Boolean).join(" ");
      } else if (singleDesc) {
        description = singleDesc[1].trim().replace(/^["']|["']$/g, "");
      }
    }

    const displayName = slug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    // Check if already exists
    const existing = await sql`SELECT id FROM skills WHERE slug = ${slug} AND user_id = ${userId}`;
    if (existing.length > 0) {
      console.log(`  ⏭  ${slug} - already imported`);
      skipped++;
      continue;
    }

    // Insert skill
    const [inserted] = await sql`
      INSERT INTO skills (user_id, slug, name, description, content, current_version)
      VALUES (${userId}, ${slug}, ${displayName}, ${description.slice(0, 500)}, ${content}, 1)
      RETURNING id
    `;

    // Insert version 1
    await sql`
      INSERT INTO skill_versions (skill_id, version, content, description, author, changelog)
      VALUES (${inserted.id}, 1, ${content}, ${description.slice(0, 500)}, 'import', 'Imported from ${skillsDir}')
    `;

    // Import files from references/, scripts/, assets/
    let fileCount = 0;
    for (const folder of ["references", "scripts", "assets"]) {
      const subDir = path.join(skillDir, folder);
      if (!fs.existsSync(subDir)) continue;
      const files = fs.readdirSync(subDir).filter((f) => fs.statSync(path.join(subDir, f)).isFile());
      for (const filename of files) {
        const filePath = path.join(subDir, filename);
        const isText = /\.(md|txt|json|yaml|yml|py|sh|js|ts|html|css|csv|toml)$/i.test(filename);
        const fileContent = isText
          ? fs.readFileSync(filePath, "utf-8")
          : fs.readFileSync(filePath).toString("base64");
        const mimeType = isText ? "text/plain" : "application/octet-stream";
        const size = fs.statSync(filePath).size;

        await sql`
          INSERT INTO skill_files (skill_id, folder, filename, content, mime_type, size)
          VALUES (${inserted.id}, ${folder}, ${filename}, ${fileContent}, ${mimeType}, ${size})
        `;
        fileCount++;
      }
    }

    const sizeKB = Math.round(content.length / 1024);
    const filesInfo = fileCount > 0 ? `, ${fileCount} file${fileCount !== 1 ? "s" : ""}` : "";
    console.log(`  ✓  ${slug} (${sizeKB}KB${filesInfo})`);
    imported++;
  }

  console.log(`\n  ─────────────────────────────────`);
  console.log(`  Imported: ${imported}  Skipped: ${skipped}  Total: ${dirs.length}`);
  console.log(`\n  Open Praxl in your browser to see your skills! 🚀\n`);

  await sql.end();
}

main().catch((e) => {
  console.error("\n  ✗ Error:", e.message, "\n");
  process.exit(1);
});
