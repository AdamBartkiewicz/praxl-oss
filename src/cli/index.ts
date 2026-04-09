#!/usr/bin/env node

import { Command } from "commander";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc } from "drizzle-orm";
import path from "path";
import * as schema from "../db/schema.js";
import { writeSkillToPath, PLATFORM_PATHS } from "../lib/sync-engine.js";

// Connect to DB
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}
const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

const program = new Command();

program
  .name("praxl")
  .description("Praxl CLI - manage and deploy AI skills")
  .version("0.1.0");

// ─── LIST ───────────────────────────────────────────────────────────────────

program
  .command("list")
  .alias("ls")
  .description("List all skills")
  .option("-t, --tag <tag>", "Filter by tag")
  .action(async (opts) => {
    let skills = await db.select().from(schema.skills);

    if (opts.tag) {
      skills = skills.filter((s) => (s.tags as string[]).includes(opts.tag));
    }

    if (skills.length === 0) {
      console.log("No skills found.");
      process.exit(0);
    }

    console.log(`\n  ${"Skill".padEnd(30)} ${"Version".padEnd(10)} Active`);
    console.log("  " + "─".repeat(50));

    for (const skill of skills) {
      const active = skill.isActive ? "✓" : "✗";
      console.log(`  ${skill.slug.padEnd(30)} v${String(skill.currentVersion).padEnd(9)} ${active}`);
    }
    console.log(`\n  Total: ${skills.length} skills\n`);
    process.exit(0);
  });

// ─── DEPLOY ─────────────────────────────────────────────────────────────────

program
  .command("deploy <skill-slug>")
  .description("Deploy a skill to a platform")
  .option("--platform <platform>", "Target platform", "claude-code")
  .option("--path <path>", "Custom base path")
  .action(async (slug, opts) => {
    const skill = await db.query.skills.findFirst({ where: eq(schema.skills.slug, slug) });
    if (!skill) {
      console.error(`  ✗ Skill "${slug}" not found`);
      process.exit(1);
    }

    const basePath = opts.path || PLATFORM_PATHS[opts.platform];
    if (!basePath) {
      console.error(`  ✗ No path for platform: ${opts.platform}`);
      process.exit(1);
    }

    const files = await db.select().from(schema.skillFiles).where(eq(schema.skillFiles.skillId, skill.id));
    const fileData = files.map((f) => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));

    const result = writeSkillToPath(basePath, skill.slug, skill.content, fileData);

    if (result.success) {
      console.log(`  ✓ Deployed ${skill.slug} v${skill.currentVersion} → ${result.fullPath}`);
    } else {
      console.error(`  ✗ Failed: ${result.error}`);
      process.exit(1);
    }
    process.exit(0);
  });

// ─── SYNC ───────────────────────────────────────────────────────────────────

program
  .command("sync")
  .description("Sync all skills to all active targets")
  .action(async () => {
    const targets = (await db.select().from(schema.syncTargets)).filter((t) => t.isActive);
    const skills = (await db.select().from(schema.skills)).filter((s) => s.isActive);

    if (targets.length === 0) {
      console.log("  No active sync targets.");
      process.exit(0);
    }

    let synced = 0, failed = 0;

    for (const target of targets) {
      if (!target.basePath) continue;
      console.log(`\n  Syncing to ${target.label} (${target.basePath})...`);

      for (const skill of skills) {
        const files = await db.select().from(schema.skillFiles).where(eq(schema.skillFiles.skillId, skill.id));
        const fileData = files.map((f) => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));
        const result = writeSkillToPath(target.basePath, skill.slug, skill.content, fileData);
        if (result.success) { console.log(`    ✓ ${skill.slug}`); synced++; }
        else { console.log(`    ✗ ${skill.slug}: ${result.error}`); failed++; }
      }
    }

    console.log(`\n  Done: ${synced} synced, ${failed} failed\n`);
    process.exit(0);
  });

program.parse();
