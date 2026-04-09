import { z } from "zod";
import { router, authedProcedure, mutationProcedure } from "../trpc";
import { db } from "@/db";
import { skills, skillVersions, syncLog, syncTargets, skillUsageEvents, appSettings, orgMembers, organizations } from "@/db/schema";
import { eq, count, desc, gte, inArray, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const analyticsRouter = router({
  dashboard: authedProcedure.query(async ({ ctx }) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Totals
    const [totalSkills] = await db.select({ c: count() }).from(skills).where(eq(skills.userId, ctx.userId));
    const [totalTargets] = await db.select({ c: count() }).from(syncTargets).where(eq(syncTargets.userId, ctx.userId));

    const userSkillIds = await db.select({ id: skills.id }).from(skills).where(eq(skills.userId, ctx.userId));
    const skillIds = userSkillIds.map((s) => s.id);

    let totalVersions = 0;
    let totalSyncs = 0;
    let syncsByPlatform: { platform: string; count: number }[] = [];
    let topEditedSkills: { slug: string; name: string | null; versions: number }[] = [];
    let skillsCreatedByDay: { day: string; count: number }[] = [];

    if (skillIds.length > 0) {
      // Versions per skill (top edited) - use inArray instead of raw SQL ANY()
      const versionsPerSkill = await db
        .select({ skillId: skillVersions.skillId, c: count() })
        .from(skillVersions)
        .where(inArray(skillVersions.skillId, skillIds))
        .groupBy(skillVersions.skillId)
        .orderBy(desc(count()))
        .limit(5);

      // Total versions across all user's skills
      const [totalVersionsRow] = await db
        .select({ c: count() })
        .from(skillVersions)
        .where(inArray(skillVersions.skillId, skillIds));
      totalVersions = Number(totalVersionsRow?.c || 0);

      // Top 5 by versions - hydrate with name/slug
      if (versionsPerSkill.length > 0) {
        const topIds = versionsPerSkill.map((r) => r.skillId);
        const skillMeta = await db
          .select({ id: skills.id, slug: skills.slug, name: skills.name })
          .from(skills)
          .where(inArray(skills.id, topIds));
        const metaMap = Object.fromEntries(skillMeta.map((m) => [m.id, m]));
        topEditedSkills = versionsPerSkill.map((r) => ({
          slug: metaMap[r.skillId]?.slug || "unknown",
          name: metaMap[r.skillId]?.name || null,
          versions: Number(r.c),
        }));
      }

      // Syncs last 90 days
      const syncRows = await db
        .select({ targetId: syncLog.targetId })
        .from(syncLog)
        .where(and(
          inArray(syncLog.skillId, skillIds),
          gte(syncLog.syncedAt, ninetyDaysAgo),
        ));
      totalSyncs = syncRows.length;

      if (syncRows.length > 0) {
        const targetIds = [...new Set(syncRows.map((r) => r.targetId))];
        const targetMeta = await db
          .select({ id: syncTargets.id, platform: syncTargets.platform })
          .from(syncTargets)
          .where(inArray(syncTargets.id, targetIds));
        const platformByTarget = Object.fromEntries(targetMeta.map((t) => [t.id, t.platform]));
        const byPlatform: Record<string, number> = {};
        for (const r of syncRows) {
          const p = platformByTarget[r.targetId] || "unknown";
          byPlatform[p] = (byPlatform[p] || 0) + 1;
        }
        syncsByPlatform = Object.entries(byPlatform)
          .map(([platform, c]) => ({ platform, count: c }))
          .sort((a, b) => b.count - a.count);
      }
    }

    // Skills activity per day (created OR updated) - last 30 days
    const activeSkills = await db
      .select({ createdAt: skills.createdAt, updatedAt: skills.updatedAt })
      .from(skills)
      .where(eq(skills.userId, ctx.userId));

    const dayBuckets: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayBuckets[key] = 0;
    }
    for (const row of activeSkills) {
      // Count both creation and updates
      const created = (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string)).toISOString().slice(0, 10);
      const updated = (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt as unknown as string)).toISOString().slice(0, 10);
      if (created in dayBuckets) dayBuckets[created]++;
      if (updated !== created && updated in dayBuckets) dayBuckets[updated]++;
    }
    skillsCreatedByDay = Object.entries(dayBuckets)
      .map(([day, c]) => ({ day, count: c }))
      .sort((a, b) => a.day.localeCompare(b.day));

    // Usage tracking data (if enabled)
    let usageEnabled = false;
    let usageBySkill: { slug: string; count: number }[] = [];
    let usageByPlatform: { platform: string; count: number }[] = [];
    let usageByDay: { day: string; count: number }[] = [];

    const trackingSetting = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "usage_tracking"), eq(appSettings.userId, ctx.userId)),
    });
    usageEnabled = trackingSetting?.value === "on";

    if (usageEnabled) {
      // Only Claude Code session log events (filter out web app tracking: view, edit, ai-review, ai-chat, sync)
      const WEB_SOURCES = new Set(["view", "edit", "ai-review", "ai-chat", "sync"]);
      const usageRows = await db
        .select({ skillSlug: skillUsageEvents.skillSlug, platform: skillUsageEvents.platform, usedAt: skillUsageEvents.usedAt })
        .from(skillUsageEvents)
        .where(and(eq(skillUsageEvents.userId, ctx.userId), gte(skillUsageEvents.usedAt, thirtyDaysAgo)));

      const cliRows = usageRows.filter(r => !WEB_SOURCES.has(r.platform));

      // By skill
      const bySlug: Record<string, number> = {};
      const byPlat: Record<string, number> = {};
      const byDay: Record<string, number> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        byDay[d.toISOString().slice(0, 10)] = 0;
      }
      for (const r of cliRows) {
        bySlug[r.skillSlug] = (bySlug[r.skillSlug] || 0) + 1;
        byPlat[r.platform] = (byPlat[r.platform] || 0) + 1;
        const day = (r.usedAt instanceof Date ? r.usedAt : new Date(r.usedAt as unknown as string)).toISOString().slice(0, 10);
        if (day in byDay) byDay[day]++;
      }
      usageBySkill = Object.entries(bySlug).map(([slug, c]) => ({ slug, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);
      usageByPlatform = Object.entries(byPlat).map(([platform, c]) => ({ platform, count: c })).sort((a, b) => b.count - a.count);
      usageByDay = Object.entries(byDay).map(([day, c]) => ({ day, count: c })).sort((a, b) => a.day.localeCompare(b.day));
    }

    return {
      totals: {
        skills: Number(totalSkills.c),
        versions: totalVersions,
        syncs: totalSyncs,
        targets: Number(totalTargets.c),
      },
      syncsByPlatform,
      topEditedSkills,
      skillsCreatedByDay,
      rangeStart: thirtyDaysAgo.toISOString(),
      usage: {
        enabled: usageEnabled,
        bySkill: usageBySkill,
        byPlatform: usageByPlatform,
        byDay: usageByDay,
        totalUses: usageBySkill.reduce((sum, s) => sum + s.count, 0),
      },
    };
  }),

  orgDashboard: authedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
  

      // Verify membership
      const membership = await db.query.orgMembers.findFirst({
        where: and(eq(orgMembers.userId, ctx.userId), eq(orgMembers.orgId, input.orgId)),
      });
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      // Get org info
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      // Get all org members
      const members = await db.query.orgMembers.findMany({
        where: eq(orgMembers.orgId, input.orgId),
        with: { user: true },
      });

      // Get org skills (skills with this orgId)
      const orgSkills = await db.select({
        id: skills.id,
        name: skills.name,
        slug: skills.slug,
        userId: skills.userId,
        currentVersion: skills.currentVersion,
        updatedAt: skills.updatedAt,
        createdAt: skills.createdAt,
      }).from(skills).where(eq(skills.orgId, input.orgId));

      // Skills per member
      const skillsByMember = members.map((m) => ({
        userId: m.userId,
        name: m.user.name || m.user.email,
        role: m.role,
        skillCount: orgSkills.filter((s) => s.userId === m.userId).length,
      }));

      // Total versions for org skills
      const skillIds = orgSkills.map((s) => s.id);
      let totalVersions = 0;
      if (skillIds.length > 0) {
        const [vr] = await db.select({ c: count() }).from(skillVersions).where(inArray(skillVersions.skillId, skillIds));
        totalVersions = Number(vr?.c || 0);
      }

      // Activity last 14 days
      const activityByDay: Record<string, number> = {};
      for (let i = 0; i < 14; i++) {
        const d = new Date(Date.now() - i * 86400000);
        activityByDay[d.toISOString().slice(0, 10)] = 0;
      }
      for (const s of orgSkills) {
        const key = (s.updatedAt instanceof Date ? s.updatedAt : new Date(s.updatedAt as unknown as string)).toISOString().slice(0, 10);
        if (key in activityByDay) activityByDay[key]++;
      }

      // Top edited skills (by version count)
      const topSkills = orgSkills
        .sort((a, b) => (b.currentVersion || 1) - (a.currentVersion || 1))
        .slice(0, 5)
        .map((s) => ({ name: s.name, slug: s.slug, versions: s.currentVersion || 1 }));

      return {
        org: { name: org?.name || "Unknown", memberCount: members.length },
        totals: { skills: orgSkills.length, versions: totalVersions, members: members.length },
        skillsByMember,
        activityByDay: Object.entries(activityByDay).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)),
        topSkills,
      };
    }),

  // Toggle usage tracking on/off
  toggleUsageTracking: mutationProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
  
      const key = "usage_tracking";
      const existing = await db.query.appSettings.findFirst({
        where: and(eq(appSettings.key, key), eq(appSettings.userId, ctx.userId)),
      });
      const value = input.enabled ? "on" : "off";
      if (existing) {
        await db.update(appSettings).set({ value }).where(and(eq(appSettings.key, key), eq(appSettings.userId, ctx.userId)));
      } else {
        await db.insert(appSettings).values({ key, value, userId: ctx.userId });
      }
      return { enabled: input.enabled };
    }),

  clearUsageData: mutationProcedure
    .mutation(async ({ ctx }) => {
      await db.delete(skillUsageEvents).where(eq(skillUsageEvents.userId, ctx.userId));
      return { cleared: true };
    }),
});
