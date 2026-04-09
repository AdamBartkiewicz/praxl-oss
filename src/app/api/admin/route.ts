import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users, skills, skillChangeRequests, appSettings, syncTargets, localSkillState, marketplaceSkills, dataRequests } from "@/db/schema";
import { sql, eq, desc, and, count } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);
const SYSTEM_USER = "__system__";
const SEO_PREFIX = "seo_";

function isAdmin(userId: string | null): boolean {
  return !!userId && ADMIN_USER_IDS.includes(userId);
}

async function logAdminAction(adminUserId: string, action: string, details: Record<string, unknown>) {
  try {
    await db.insert(dataRequests).values({
      userId: adminUserId,
      email: "admin",
      type: "other",
      source: "in_app",
      status: "completed",
      notes: `Admin action: ${action} | ${JSON.stringify(details)}`,
      respondedAt: new Date(),
      metadata: { adminAction: true, action, ...details },
    });
  } catch (e) {
    console.error("[admin] Failed to log audit action:", e);
  }
}

const SEO_FIELDS = [
  { key: "og_title", label: "OG Title" },
  { key: "og_description", label: "OG Description" },
  { key: "og_image_url", label: "OG Image URL" },
  { key: "meta_description", label: "Meta Description" },
  { key: "meta_keywords", label: "Meta Keywords (comma-separated)" },
  { key: "twitter_title", label: "Twitter Title" },
  { key: "twitter_description", label: "Twitter Description" },
  { key: "site_title", label: "Site Title" },
  { key: "site_tagline", label: "Site Tagline" },
];

async function getSeoSettings(): Promise<Record<string, string>> {
  const rows = await db.query.appSettings.findMany({
    where: eq(appSettings.userId, SYSTEM_USER),
  });
  const seo: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith(SEO_PREFIX)) {
      seo[row.key.slice(SEO_PREFIX.length)] = row.value;
    }
  }
  return seo;
}

async function setSeoSetting(key: string, value: string) {
  const fullKey = `${SEO_PREFIX}${key}`;
  const existing = await db.query.appSettings.findFirst({
    where: and(eq(appSettings.key, fullKey), eq(appSettings.userId, SYSTEM_USER)),
  });
  if (existing) {
    await db.update(appSettings).set({ value }).where(and(eq(appSettings.key, fullKey), eq(appSettings.userId, SYSTEM_USER)));
  } else {
    await db.insert(appSettings).values({ key: fullKey, value, userId: SYSTEM_USER });
  }
}

export async function GET() {
  const session = await getSession();
  if (!isAdmin(session?.userId ?? null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  const [userCount] = await db.select({ count: count() }).from(users);
  const [skillCount] = await db.select({ count: count() }).from(skills);
  const [crCount] = await db.select({ count: count() }).from(skillChangeRequests);
  const [targetCount] = await db.select({ count: count() }).from(syncTargets);
  const [marketplaceCount] = await db.select({ count: count() }).from(marketplaceSkills).catch(() => [{ count: 0 }]);

  // Pending change requests
  const [pendingCR] = await db
    .select({ count: count() })
    .from(skillChangeRequests)
    .where(eq(skillChangeRequests.status, "pending"));

  // ─── Users list ───────────────────────────────────────────────────────────

  const allUsers = await db.query.users.findMany({
    orderBy: [desc(users.createdAt)],
  });

  // Skills per user
  const skillsPerUser = await db
    .select({ userId: skills.userId, count: count() })
    .from(skills)
    .groupBy(skills.userId);
  const skillMap = Object.fromEntries(skillsPerUser.map((r) => [r.userId, r.count]));

  // CLI connections (heartbeat)
  const heartbeats = await db.query.appSettings.findMany({
    where: eq(appSettings.key, "cli_heartbeat"),
  });
  const cliMap: Record<string, { online: boolean; lastSeen: string; platforms: string[]; mode: string; skillCount: number }> = {};
  for (const hb of heartbeats) {
    try {
      const data = JSON.parse(hb.value);
      const secondsAgo = (Date.now() - new Date(data.lastSeen).getTime()) / 1000;
      cliMap[hb.userId] = {
        online: secondsAgo < 90,
        lastSeen: data.lastSeen,
        platforms: data.platforms || [],
        mode: data.mode || "unknown",
        skillCount: data.skillCount || 0,
      };
    } catch {}
  }

  const usersList = allUsers.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    imageUrl: u.imageUrl,
    createdAt: u.createdAt,
    skillCount: skillMap[u.id] || 0,
    cli: cliMap[u.id] || null,
    plan: "pro", // Open-source: all pro
    planSource: "oss",
  }));

  // ─── Recent change requests ───────────────────────────────────────────────

  const recentCRs = await db.query.skillChangeRequests.findMany({
    orderBy: [desc(skillChangeRequests.createdAt)],
    limit: 20,
  });

  // ─── Error log ────────────────────────────────────────────────────────────

  const errorLog = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, "error_log"),
  });
  const errors = errorLog?.value ? JSON.parse(errorLog.value) : [];

  // ─── Health ───────────────────────────────────────────────────────────────

  let dbStatus = "ok";
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = "error";
  }

  return NextResponse.json({
    stats: {
      users: userCount.count,
      skills: skillCount.count,
      changeRequests: crCount.count,
      pendingChangeRequests: pendingCR.count,
      syncTargets: targetCount.count,
      marketplaceIndexed: marketplaceCount.count,
    },
    users: usersList,
    recentChangeRequests: recentCRs,
    errors: errors.slice(-20).reverse(),
    health: {
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
    seo: await getSeoSettings(),
  });
}

// POST /api/admin - admin actions (set plan, etc.)
export async function POST(request: Request) {
  const session = await getSession();
  if (!isAdmin(session?.userId ?? null)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = session!.userId;

  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (action === "setSeo") {
    const { settings } = body as { settings?: Record<string, string> };
    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
    }
    const validKeys = SEO_FIELDS.map((f) => f.key);
    for (const [key, value] of Object.entries(settings)) {
      if (validKeys.includes(key) && typeof value === "string") {
        await setSeoSetting(key, value);
      }
    }
    await logAdminAction(userId, "setSeo", { keys: Object.keys(settings) });
    return NextResponse.json({ ok: true, saved: Object.keys(settings).length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
