#!/usr/bin/env node
/**
 * Praxl CLI - Import local skills to your Praxl account
 *
 * Usage:
 *   npx praxl-import                          # interactive: opens browser for auth
 *   npx praxl-import --token YOUR_TOKEN       # use saved token
 *   npx praxl-import --path ~/.cursor/skills  # custom skills directory
 *
 * Get your token at: https://your-praxl-instance.com/settings (CLI Token section)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import readline from "readline";

const PRAXL_URL = process.env.PRAXL_URL || "http://localhost:3000";
const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const TOKEN_FILE = path.join(HOME, ".praxl-token");

// Parse args
const args = process.argv.slice(2);
let token = "";
let skillsDir = path.join(HOME, ".claude/skills");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--token" && args[i + 1]) token = args[++i];
  if (args[i] === "--path" && args[i + 1]) skillsDir = args[++i];
  if (args[i] === "--url" && args[i + 1]) { /* handled by env */ }
  if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
  Praxl - Import Local Skills

  Usage:
    npx praxl-import                       Import from ~/.claude/skills/
    npx praxl-import --path <dir>          Import from custom directory
    npx praxl-import --token <token>       Use specific auth token

  First run:
    1. Open Praxl in your browser and go to Settings
    2. Copy your CLI Token
    3. Run: npx praxl-import --token <your-token>

  The token is saved locally for future use.
`);
    process.exit(0);
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

async function main() {
  console.log("\n  ╔═══════════════════════════════════════╗");
  console.log("  ║     Praxl - Import Local Skills       ║");
  console.log("  ╚═══════════════════════════════════════╝\n");

  // Get token
  if (!token) {
    // Try saved token
    if (fs.existsSync(TOKEN_FILE)) {
      token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      console.log("  Using saved token from ~/.praxl-token");
    }
  }

  if (!token) {
    console.log("  No token found. Get your CLI token from Praxl Settings.\n");
    token = await prompt("  Paste your token: ");
    if (!token) {
      console.error("  ✗ Token required.\n");
      process.exit(1);
    }
  }

  // Verify token
  console.log("  Verifying token...");
  try {
    const res = await fetch(`${PRAXL_URL}/api/cli/import`, {
      method: "GET",
      headers: { "x-praxl-token": token },
    });
    if (!res.ok) {
      console.error("  ✗ Invalid token. Get a new one from Praxl Settings.\n");
      process.exit(1);
    }
    const data = await res.json();
    console.log(`  ✓ Authenticated as ${data.user?.name || data.user?.email}\n`);

    // Save token
    fs.writeFileSync(TOKEN_FILE, token, "utf-8");
  } catch (err) {
    console.error(`  ✗ Cannot connect to ${PRAXL_URL}. Is Praxl running?\n`);
    process.exit(1);
  }

  // Scan directory
  if (!fs.existsSync(skillsDir)) {
    console.error(`  ✗ Directory not found: ${skillsDir}`);
    console.error("  Use --path to specify a different location.\n");
    process.exit(1);
  }

  const dirs = fs.readdirSync(skillsDir).filter((d) => {
    return fs.existsSync(path.join(skillsDir, d, "SKILL.md"));
  });

  console.log(`  📁 Path: ${skillsDir}`);
  console.log(`  📦 Found: ${dirs.length} skill(s)\n`);

  if (dirs.length === 0) {
    console.log("  No skills to import.\n");
    process.exit(0);
  }

  // Prepare skills data
  const skills = dirs.map((slug) => {
    const dir = path.join(skillsDir, slug);
    const content = fs.readFileSync(path.join(dir, "SKILL.md"), "utf-8");

    // Parse name and description
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const descMatch = fmMatch?.[1]?.match(/^description:\s*(.+)$/m);
    const description = descMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
    const displayName = slug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    // Collect files
    const files: { folder: string; filename: string; content: string; mimeType: string; size: number }[] = [];
    for (const folder of ["references", "scripts", "assets"]) {
      const subDir = path.join(dir, folder);
      if (!fs.existsSync(subDir)) continue;
      for (const filename of fs.readdirSync(subDir)) {
        const filePath = path.join(subDir, filename);
        if (!fs.statSync(filePath).isFile()) continue;
        const fileContent = fs.readFileSync(filePath, "utf-8");
        files.push({ folder, filename, content: fileContent, mimeType: "text/plain", size: fileContent.length });
      }
    }

    console.log(`  • ${slug} (${Math.round(content.length / 1024)}KB${files.length > 0 ? `, ${files.length} files` : ""})`);

    return { slug, name: displayName, description: description.slice(0, 500), content, files };
  });

  // Upload to Praxl
  console.log("\n  Uploading to Praxl...");
  try {
    const res = await fetch(`${PRAXL_URL}/api/cli/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-praxl-token": token,
      },
      body: JSON.stringify({ skills }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error(`  ✗ ${result.error || "Import failed"}\n`);
      process.exit(1);
    }

    console.log(`\n  ═══════════════════════════════════════`);
    console.log(`  ✓ Imported: ${result.imported}`);
    console.log(`  ⏭ Skipped:  ${result.skipped} (already exist)`);
    console.log(`  ═══════════════════════════════════════`);
    console.log(`\n  Open Praxl in your browser to see your skills! 🚀\n`);
  } catch (err) {
    console.error(`  ✗ Upload failed: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`  ✗ ${e.message}\n`);
  process.exit(1);
});
