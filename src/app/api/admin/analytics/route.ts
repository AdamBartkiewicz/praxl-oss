import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users, skills, syncTargets, syncLog, appSettings, aiSuggestions, skillFiles, orgMembers } from "@/db/schema";
import { eq, count, gte, sql, inArray } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);

function dayKey(d: Date): string { return d.toISOString().slice(0, 10); }
function weekKey(d: Date): string {
  const tmp = new Date(d);
  tmp.setDate(tmp.getDate() - tmp.getDay() + 1); // Monday
  return tmp.toISOString().slice(0, 10);
}
function daysAgo(n: number): Date { return new Date(Date.now() - n * 86400000); }

export async function GET() {
  const session = await getSession();
  if (!session || !ADMIN_USER_IDS.includes(session.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // ─── Totals ──────────────────────────────────────────────────────────
    const [[uc], [sc], [slc]] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(skills),
      db.select({ c: count() }).from(syncLog),
    ]);
    const totalUsers = uc.c;
    const totalSkills = sc.c;
    const totalSyncs = slc.c;

    // ─── 1. DAU/WAU - from skills.updatedAt ───────────────────────────
    const activityRows = await db
      .select({ userId: skills.userId, updatedAt: skills.updatedAt })
      .from(skills)
      .where(gte(skills.updatedAt, daysAgo(56))); // 8 weeks

    // DAU: last 14 days
    const dauMap: Record<string, Set<string>> = {};
    for (let i = 0; i < 14; i++) dauMap[dayKey(daysAgo(13 - i))] = new Set();
    for (const r of activityRows) {
      const k = dayKey(r.updatedAt);
      if (dauMap[k]) dauMap[k].add(r.userId);
    }
    const dauLabels = Object.keys(dauMap);
    const dau = dauLabels.map((k) => dauMap[k].size);

    // WAU: last 8 weeks
    const wauMap: Record<string, Set<string>> = {};
    for (let i = 0; i < 8; i++) wauMap[weekKey(daysAgo(i * 7))] = new Set();
    for (const r of activityRows) {
      const k = weekKey(r.updatedAt);
      if (wauMap[k]) wauMap[k].add(r.userId);
    }
    const wauLabels = Object.keys(wauMap).sort();
    const wau = wauLabels.map((k) => wauMap[k].size);

    // ─── 2. Activation funnel (last 30 days) ─────────────────────────
    const recentUsers = await db.select({ id: users.id, createdAt: users.createdAt }).from(users).where(gte(users.createdAt, daysAgo(30)));
    const recentIds = recentUsers.map((u) => u.id);
    const signedUp = recentIds.length;

    let createdSkill = 0, addedSyncTarget = 0, firstSync = 0;
    if (recentIds.length > 0) {
      const recentSkills = await db.select({ userId: skills.userId }).from(skills).where(inArray(skills.userId, recentIds));
      const recentTargets = await db.select({ userId: syncTargets.userId }).from(syncTargets).where(inArray(syncTargets.userId, recentIds));
      createdSkill = new Set(recentSkills.map((r) => r.userId)).size;
      addedSyncTarget = new Set(recentTargets.map((r) => r.userId)).size;
      const recentSyncSkills = await db.select({ userId: skills.userId }).from(skills)
        .innerJoin(syncLog, eq(syncLog.skillId, skills.id))
        .where(inArray(skills.userId, recentIds));
      firstSync = new Set(recentSyncSkills.map((r) => r.userId)).size;
    }

    // ─── 3. Cohort retention (6 weeks) ────────────────────────────────
    const allUsers = await db.select({ id: users.id, createdAt: users.createdAt }).from(users);
    const allActivity = activityRows;

    const cohortWeeks: string[] = [];
    for (let i = 5; i >= 0; i--) cohortWeeks.push(weekKey(daysAgo(i * 7)));

    const cohorts = cohortWeeks.map((cw) => {
      const cohortUsers = allUsers.filter((u) => weekKey(u.createdAt) === cw);
      const size = cohortUsers.length;
      if (size === 0) return { week: cw, size: 0, retention: [100] };
      const ids = new Set(cohortUsers.map((u) => u.id));
      const maxWeeks = Math.min(6, Math.floor((Date.now() - new Date(cw).getTime()) / (7 * 86400000)) + 1);
      const retention = [100];
      for (let w = 1; w < maxWeeks; w++) {
        const targetWeek = weekKey(new Date(new Date(cw).getTime() + w * 7 * 86400000));
        const active = allActivity.filter((a) => ids.has(a.userId) && weekKey(a.updatedAt) === targetWeek);
        const uniqueActive = new Set(active.map((a) => a.userId)).size;
        retention.push(Math.round((uniqueActive / size) * 100));
      }
      return { week: cw, size, retention };
    }).filter((c) => c.size > 0);

    // ─── 4. Segments ─────────────────────────────────────────────────
    const skillCounts = await db.select({ userId: skills.userId, c: count() }).from(skills).groupBy(skills.userId);
    const targetCounts = await db.select({ userId: syncTargets.userId, c: count() }).from(syncTargets).groupBy(syncTargets.userId);
    const skillMap = Object.fromEntries(skillCounts.map((r) => [r.userId, Number(r.c)]));
    const targetMap = Object.fromEntries(targetCounts.map((r) => [r.userId, Number(r.c)]));

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const segments = {
      free: { count: 0, avgSkills: 0, avgTargets: 0 },
      pro: { count: allUsers.length, avgSkills: avg(allUsers.map((u) => skillMap[u.id] || 0)), avgTargets: avg(allUsers.map((u) => targetMap[u.id] || 0)) },
    };

    // ─── 5. Skill distribution ────────────────────────────────────────
    const buckets = [
      { label: "0", min: 0, max: 0 },
      { label: "1-3", min: 1, max: 3 },
      { label: "4-7", min: 4, max: 7 },
      { label: "8-10", min: 8, max: 10 },
      { label: "11+", min: 11, max: Infinity },
    ];
    const skillDistribution = buckets.map((b) => {
      const cnt = allUsers.filter((u) => {
        const s = skillMap[u.id] || 0;
        return s >= b.min && s <= b.max;
      }).length;
      return { bucket: b.label, count: cnt };
    });

    // ─── 6. Platform adoption ─────────────────────────────────────────
    const platformRows = await db.select({ platform: syncTargets.platform, c: count() }).from(syncTargets).groupBy(syncTargets.platform);
    const platforms = platformRows.map((r) => ({ platform: r.platform, count: Number(r.c) })).sort((a, b) => b.count - a.count);

    // ─── 7. CLI stats ─────────────────────────────────────────────────
    const heartbeats = await db.query.appSettings.findMany({ where: eq(appSettings.key, "cli_heartbeat") });
    const sevenDaysAgo = daysAgo(7);
    let cliConnected7d = 0, cliConnectedEver = heartbeats.length;
    for (const hb of heartbeats) {
      try {
        const d = JSON.parse(hb.value);
        if (new Date(d.lastSeen) >= sevenDaysAgo) cliConnected7d++;
      } catch {}
    }

    // ─── 8. TTFV ──────────────────────────────────────────────────────
    const userCreatedMap = Object.fromEntries(allUsers.map((u) => [u.id, u.createdAt]));
    const firstSyncsRaw = await db.execute(sql`
      SELECT s.user_id, MIN(sl.synced_at) AS first_sync
      FROM sync_log sl JOIN skills s ON sl.skill_id = s.id
      GROUP BY s.user_id
    `);
    const minutes: number[] = [];
    for (const row of (Array.isArray(firstSyncsRaw) ? firstSyncsRaw : []) as any[]) {
      const created = userCreatedMap[row.user_id];
      if (created && row.first_sync) {
        const diff = (new Date(row.first_sync).getTime() - new Date(created).getTime()) / 60000;
        if (diff > 0 && diff < 525600) minutes.push(diff);
      }
    }
    minutes.sort((a, b) => a - b);
    const median = minutes.length > 0 ? minutes[Math.floor(minutes.length / 2)] : null;
    const p25 = minutes.length > 3 ? minutes[Math.floor(minutes.length * 0.25)] : null;
    const p75 = minutes.length > 3 ? minutes[Math.floor(minutes.length * 0.75)] : null;

    // ─── 9. Feature adoption ──────────────────────────────────────────
    const aiRaw = await db.execute(sql`SELECT COUNT(DISTINCT s.user_id) AS c FROM ai_suggestions ag JOIN skills s ON ag.skill_id = s.id`);
    const ghRaw = await db.execute(sql`SELECT COUNT(DISTINCT user_id) AS c FROM app_settings WHERE key = 'github_repo' AND value IS NOT NULL AND value != ''`);
    const fileRaw = await db.execute(sql`SELECT COUNT(DISTINCT s.user_id) AS c FROM skill_files sf JOIN skills s ON sf.skill_id = s.id`);
    const orgRaw = await db.execute(sql`SELECT COUNT(DISTINCT user_id) AS c FROM org_members`);
    const utRaw = await db.execute(sql`SELECT COUNT(DISTINCT user_id) AS c FROM app_settings WHERE key = 'usage_tracking' AND value = 'on'`);
    const getC = (r: any) => { const arr = Array.isArray(r) ? r : []; return Number(arr[0]?.c || 0); };

    const features = [
      { feature: "AI review", users: getC(aiRaw) },
      { feature: "GitHub sync", users: getC(ghRaw) },
      { feature: "File editor", users: getC(fileRaw) },
      { feature: "Organizations", users: getC(orgRaw) },
      { feature: "Usage tracking", users: getC(utRaw) },
    ];
    const featureAdoption = features.map((f) => ({ ...f, pct: totalUsers > 0 ? Math.round((f.users / totalUsers) * 100) : 0 }));

    // ─── 10. Signups per day ──────────────────────────────────────────
    const signupBuckets: Record<string, number> = {};
    for (let i = 0; i < 30; i++) signupBuckets[dayKey(daysAgo(29 - i))] = 0;
    for (const u of allUsers) {
      const k = dayKey(u.createdAt);
      if (k in signupBuckets) signupBuckets[k]++;
    }
    const signupsPerDay = Object.entries(signupBuckets).map(([day, c]) => ({ day, count: c }));

    return NextResponse.json({
      dau, dauLabels, wau, wauLabels,
      funnel: { signedUp, createdSkill, addedSyncTarget, firstSync },
      cohorts, segments, skillDistribution, platforms,
      cliStats: { totalUsers, cliConnected7d, cliConnectedEver },
      ttfv: { median, p25, p75, sampleSize: minutes.length },
      featureAdoption, signupsPerDay,
      totalUsers, totalSkills, totalSyncs,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Analytics query failed",
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined,
    }, { status: 500 });
  }
}
