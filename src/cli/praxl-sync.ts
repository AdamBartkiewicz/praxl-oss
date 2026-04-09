#!/usr/bin/env node
/**
 * Praxl Sync - Keep local skills in sync with Praxl cloud
 *
 * Modes:
 *   npx praxl-sync                    One-time sync (download all skills)
 *   npx praxl-sync --watch            Watch mode (poll every 30s, live terminal)
 *   npx praxl-sync --daemon           Background daemon (runs silently, logs to file)
 *
 * Options:
 *   --token TOKEN                     Auth token (or saved in ~/.praxl-token)
 *   --path DIR                        Local skills directory (default: ~/.claude/skills)
 *   --interval SECONDS                Poll interval for watch/daemon (default: 30)
 *   --url URL                         Praxl instance URL (default: http://localhost:3000)
 *   --platforms claude-code,cursor    Sync to multiple platform dirs at once
 */

import fs from "fs";
import path from "path";
import os from "os";

// ─── Load .env.local ────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0 && !process.env[t.slice(0, eq).trim()]) {
      process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────
const HOME = os.homedir();
const TOKEN_FILE = path.join(HOME, ".praxl-token");
const STATE_FILE = path.join(HOME, ".praxl-sync-state");
const LOG_FILE = path.join(HOME, ".praxl-sync.log");

const PLATFORM_PATHS: Record<string, string> = {
  "claude-code": path.join(HOME, ".claude/skills"),
  "cursor": path.join(HOME, ".cursor/skills"),
  "codex": path.join(HOME, ".agents/skills"),
  "windsurf": path.join(HOME, ".windsurf/skills"),
  "opencode": path.join(HOME, ".opencode/skills"),
};

// ─── Parse args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let token = "";
let targetPath = PLATFORM_PATHS["claude-code"];
let praxlUrl = process.env.PRAXL_URL || "http://localhost:3000";
let interval = 30;
let mode: "once" | "watch" | "daemon" = "once";
let platforms: string[] = ["claude-code"];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--token" && args[i + 1]) token = args[++i];
  else if (a === "--path" && args[i + 1]) targetPath = args[++i];
  else if (a === "--url" && args[i + 1]) praxlUrl = args[++i];
  else if (a === "--interval" && args[i + 1]) interval = parseInt(args[++i]) || 30;
  else if (a === "--watch") mode = "watch";
  else if (a === "--daemon") mode = "daemon";
  else if (a === "--platforms" && args[i + 1]) platforms = args[++i].split(",");
  else if (a === "--help" || a === "-h") {
    console.log(`
  Praxl Sync - Keep local skills in sync

  Usage:
    npx praxl-sync                     One-time download
    npx praxl-sync --watch             Live watch mode (polls every 30s)
    npx praxl-sync --daemon            Background daemon

  Options:
    --token TOKEN         Auth token (or saved in ~/.praxl-token)
    --path DIR            Target directory (default: ~/.claude/skills)
    --platforms a,b       Sync to multiple: claude-code,cursor,codex
    --interval SECONDS    Poll interval (default: 30)
    --url URL             Praxl URL (default: http://localhost:3000)
`);
    process.exit(0);
  }
}

// ─── Auth ───────────────────────────────────────────────────────────────────
if (!token && fs.existsSync(TOKEN_FILE)) {
  token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
}
if (!token) {
  console.error("\n  ✗ No token. Run: npx praxl-import --token YOUR_TOKEN first\n");
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function log(msg: string, isDaemon = false) {
  const ts = new Date().toISOString().slice(11, 19);
  const line = `[${ts}] ${msg}`;
  if (isDaemon) {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } else {
    console.log(`  ${line}`);
  }
}

function writeSkill(
  baseDir: string,
  slug: string,
  content: string,
  files: { folder: string; filename: string; content: string; mimeType: string }[]
): boolean {
  try {
    const dir = path.join(baseDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), content, "utf-8");

    for (const f of files) {
      const subDir = path.join(dir, f.folder);
      fs.mkdirSync(subDir, { recursive: true });
      if (f.mimeType.startsWith("text/") || f.mimeType === "application/json") {
        fs.writeFileSync(path.join(subDir, f.filename), f.content, "utf-8");
      } else {
        fs.writeFileSync(path.join(subDir, f.filename), Buffer.from(f.content, "base64"));
      }
    }
    return true;
  } catch (err) {
    log(`✗ Failed to write ${slug}: ${(err as Error).message}`, mode === "daemon");
    return false;
  }
}

function getLastSync(): string | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      return data.lastSync || null;
    }
  } catch {}
  return null;
}

function saveLastSync(ts: string) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastSync: ts }), "utf-8");
}

// ─── Sync logic ─────────────────────────────────────────────────────────────
async function doSync(incremental = false): Promise<{ synced: number; total: number }> {
  const since = incremental ? getLastSync() : null;
  const url = `${praxlUrl}/api/cli/sync${since ? `?since=${encodeURIComponent(since)}` : ""}`;

  const res = await fetch(url, {
    headers: { "x-praxl-token": token },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
  }

  const text = await res.text();
  let data: { skills: unknown[]; syncedAt: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid response: ${text.slice(0, 100)}`);
  }
  const skills = data.skills as Array<{
    slug: string;
    content: string;
    currentVersion: number;
    isActive: boolean;
    files: { folder: string; filename: string; content: string; mimeType: string }[];
  }>;

  let synced = 0;

  for (const skill of skills) {
    if (!skill.isActive) continue;

    // Write to all target platforms
    for (const platform of platforms) {
      const base = platform === "custom" ? targetPath : (PLATFORM_PATHS[platform] || targetPath);
      if (writeSkill(base, skill.slug, skill.content, skill.files)) {
        synced++;
      }
    }
  }

  saveLastSync(data.syncedAt);
  return { synced, total: skills.length };
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const isDaemon = mode === "daemon";

  if (!isDaemon) {
    console.log(`\n  ╔═══════════════════════════════════════╗`);
    console.log(`  ║         Praxl Sync${mode === "watch" ? " (watch)" : "              "}        ║`);
    console.log(`  ╚═══════════════════════════════════════╝\n`);
  }

  // Verify token
  try {
    const res = await fetch(`${praxlUrl}/api/cli/import`, {
      headers: { "x-praxl-token": token },
    });
    if (!res.ok) throw new Error("Invalid token");
    const data = await res.json();
    log(`Authenticated as ${data.user?.name || data.user?.email}`, isDaemon);
  } catch {
    log("✗ Cannot authenticate. Check token and URL.", isDaemon);
    process.exit(1);
  }

  log(`Target: ${platforms.join(", ")}`, isDaemon);
  log(`URL: ${praxlUrl}`, isDaemon);

  if (mode === "once") {
    // One-time full sync
    log("Syncing all skills...", false);
    const result = await doSync(false);
    log(`✓ Done: ${result.synced} files written (${result.total} skills)`, false);
    console.log();
    process.exit(0);
  }

  // Watch or daemon mode
  log(`${isDaemon ? "Daemon" : "Watch"} mode: polling every ${interval}s`, isDaemon);
  if (!isDaemon) {
    log("Press Ctrl+C to stop\n", false);
  }

  // Initial full sync
  try {
    const result = await doSync(false);
    log(`Initial sync: ${result.synced} files (${result.total} skills)`, isDaemon);
  } catch (err) {
    log(`✗ Initial sync failed: ${(err as Error).message}`, isDaemon);
  }

  // Poll loop
  const poll = async () => {
    try {
      const result = await doSync(true);
      if (result.total > 0) {
        log(`↻ Updated ${result.synced} files (${result.total} changed skills)`, isDaemon);
      }
    } catch (err) {
      log(`✗ Sync error: ${(err as Error).message}`, isDaemon);
    }
  };

  setInterval(poll, interval * 1000);

  // Keep alive
  if (isDaemon) {
    log(`Daemon running (PID: ${process.pid}). Logs: ${LOG_FILE}`, true);
    // Write PID file for management
    fs.writeFileSync(path.join(HOME, ".praxl-sync.pid"), String(process.pid));
  }
}

main().catch((e) => {
  log(`✗ ${e.message}`, mode === "daemon");
  process.exit(1);
});
