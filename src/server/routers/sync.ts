import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure, mutationProcedure } from "../trpc";
import { db } from "@/db";
import { syncTargets, syncLog, skills, skillFiles, skillVersions, skillTargetAssignments, localSkillState, skillChangeRequests, appSettings } from "@/db/schema";
import { eq, desc, and, or, isNull, inArray, count } from "drizzle-orm";
import { assertCanCreate } from "@/lib/plans";
import { v4 as uuid } from "uuid";

import {
  writeSkillToPath,
  removeSkillFromPath,
  skillExistsAtPath,
  isPathWritable,
  PLATFORM_PATHS,
  type SyncResult,
} from "@/lib/sync-engine";

/** Safely attempt a filesystem write; on serverless this may fail. */
function safeWriteSkillToPath(
  basePath: string,
  slug: string,
  content: string,
  files: { folder: string; filename: string; content: string; mimeType: string }[]
): { success: boolean; fullPath?: string; error?: string } {
  try {
    return writeSkillToPath(basePath, slug, content, files);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Filesystem write failed in serverless
    return { success: false, error: `Filesystem unavailable: ${message}` };
  }
}

export const syncRouter = router({
  targets: authedProcedure.query(async ({ ctx }) => {
    return db.query.syncTargets.findMany({
      where: eq(syncTargets.userId, ctx.userId),
      orderBy: [desc(syncTargets.lastSyncedAt)],
    });
  }),

  getTarget: authedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    return db.query.syncTargets.findFirst({
      where: and(eq(syncTargets.id, input), eq(syncTargets.userId, ctx.userId)),
    });
  }),

  createTarget: mutationProcedure
    .input(
      z.object({
        platform: z.string(),
        label: z.string().min(1),
        basePath: z.string().default(""),
        syncMode: z.enum(["auto", "manual"]).default("manual"),
        includeTags: z.array(z.string()).default([]),
        excludeTags: z.array(z.string()).default([]),
        includeProjects: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanCreate(
        ctx.isPro,
        async () => {
          const r = await db.select({ c: count() }).from(syncTargets).where(eq(syncTargets.userId, ctx.userId));
          return Number(r[0]?.c || 0);
        },
        "maxSyncTargets",
        "Sync target",
      );
      const id = uuid();
      const basePath = input.basePath || PLATFORM_PATHS[input.platform] || "";
      await db.insert(syncTargets).values({
        id,
        userId: ctx.userId,
        ...input,
        basePath,
      });
      return db.query.syncTargets.findFirst({ where: eq(syncTargets.id, id) });
    }),

  updateTarget: mutationProcedure
    .input(
      z.object({
        id: z.string(),
        platform: z.string().optional(),
        label: z.string().optional(),
        basePath: z.string().optional(),
        isActive: z.boolean().optional(),
        syncMode: z.enum(["auto", "manual"]).optional(),
        includeTags: z.array(z.string()).optional(),
        excludeTags: z.array(z.string()).optional(),
        includeProjects: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await db
        .update(syncTargets)
        .set(updates)
        .where(and(eq(syncTargets.id, id), eq(syncTargets.userId, ctx.userId)));
      return db.query.syncTargets.findFirst({ where: eq(syncTargets.id, id) });
    }),

  deleteTarget: mutationProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    await db.delete(syncLog).where(eq(syncLog.targetId, input));
    await db
      .delete(syncTargets)
      .where(and(eq(syncTargets.id, input), eq(syncTargets.userId, ctx.userId)));
    return { success: true };
  }),

  logs: authedProcedure
    .input(
      z.object({
        targetId: z.string().optional(),
        skillId: z.string().optional(),
        limit: z.number().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Only show logs for user's targets
      const userTargets = await db.query.syncTargets.findMany({
        where: eq(syncTargets.userId, ctx.userId),
        columns: { id: true },
      });
      const targetIds = new Set(userTargets.map((t) => t.id));

      let result = await db.query.syncLog.findMany({
        with: { skill: true, target: true },
        orderBy: [desc(syncLog.syncedAt)],
        limit: input?.limit ?? 50,
      });

      // Filter to user's targets
      result = result.filter((l) => targetIds.has(l.targetId));

      if (input?.targetId) {
        result = result.filter((l) => l.targetId === input.targetId);
      }
      if (input?.skillId) {
        result = result.filter((l) => l.skillId === input.skillId);
      }

      return result;
    }),

  skillDeployStatus: authedProcedure
    .input(z.string())
    .query(async ({ ctx, input: skillId }) => {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) return [];

      const targets = await db.query.syncTargets.findMany({
        where: eq(syncTargets.userId, ctx.userId),
      });
      const allLogs = await db.query.syncLog.findMany({
        where: eq(syncLog.skillId, skillId),
        orderBy: [desc(syncLog.syncedAt)],
      });

      return targets.map((target) => {
        const lastDeploy = allLogs.find((l) => l.targetId === target.id && l.status === "success");
        return {
          targetId: target.id,
          targetLabel: target.label,
          platform: target.platform,
          basePath: target.basePath,
          isActive: target.isActive,
          deployedVersion: lastDeploy?.versionSynced ?? null,
          currentVersion: skill.currentVersion,
          isOutdated: lastDeploy ? lastDeploy.versionSynced < skill.currentVersion : true,
          neverDeployed: !lastDeploy,
          lastDeployedAt: lastDeploy?.syncedAt ?? null,
        };
      });
    }),

  deployOverview: authedProcedure.query(async ({ ctx }) => {
    const whereClause = ctx.orgId
      ? or(
          and(eq(skills.userId, ctx.userId), isNull(skills.orgId)),
          eq(skills.orgId, ctx.orgId)
        )
      : and(eq(skills.userId, ctx.userId), isNull(skills.orgId));

    const allSkills = await db.query.skills.findMany({ where: whereClause });
    const targets = await db.query.syncTargets.findMany({
      where: eq(syncTargets.userId, ctx.userId),
    });
    const targetIds = targets.map((t) => t.id);
    const allLogs = targetIds.length > 0
      ? await db.query.syncLog.findMany({
          where: inArray(syncLog.targetId, targetIds),
          orderBy: [desc(syncLog.syncedAt)],
        })
      : [];

    return allSkills.map((skill) => {
      const deployments = targets.map((target) => {
        const lastDeploy = allLogs.find(
          (l) => l.skillId === skill.id && l.targetId === target.id && l.status === "success"
        );
        return {
          targetId: target.id,
          platform: target.platform,
          label: target.label,
          deployedVersion: lastDeploy?.versionSynced ?? null,
          lastDeployedAt: lastDeploy?.syncedAt ?? null,
        };
      });

      const hasAnyDeploy = deployments.some((d) => d.deployedVersion !== null);
      const hasOutdated = deployments.some(
        (d) => d.deployedVersion !== null && d.deployedVersion < skill.currentVersion
      );

      return {
        skillId: skill.id,
        skillName: skill.name,
        slug: skill.slug,
        currentVersion: skill.currentVersion,
        hasAnyDeploy,
        hasOutdated,
        deployments,
      };
    });
  }),

  checkPath: authedProcedure.input(z.string()).query(async ({ input }) => {
    try {
      return { writable: isPathWritable(input) };
    } catch {
      return { writable: false };
    }
  }),

  syncSkillToTarget: mutationProcedure
    .input(z.object({ skillId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const skill = await db.query.skills.findFirst({ where: eq(skills.id, input.skillId) });
      const target = await db.query.syncTargets.findFirst({
        where: and(eq(syncTargets.id, input.targetId), eq(syncTargets.userId, ctx.userId)),
      });
      if (!skill || !target) throw new Error("Skill or target not found");
      if (!target.basePath) throw new Error("Target has no base path configured");

      const files = await db.query.skillFiles.findMany({ where: eq(skillFiles.skillId, skill.id) });
      const fileData = files.map((f) => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));

      const result = safeWriteSkillToPath(target.basePath, skill.slug, skill.content, fileData);
      const now = new Date().toISOString();

      await db.insert(syncLog).values({
        
        skillId: skill.id,
        targetId: target.id,
        versionSynced: skill.currentVersion,
        status: result.success ? "success" : "failed",
        error: result.error || null,
        
      });

      if (result.success) {
        await db.update(syncTargets).set({ lastSyncedAt: new Date() }).where(eq(syncTargets.id, target.id));
      }

      return { success: result.success, path: result.fullPath, error: result.error };
    }),

  syncTarget: mutationProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: targetId }) => {
      const target = await db.query.syncTargets.findFirst({
        where: and(eq(syncTargets.id, targetId), eq(syncTargets.userId, ctx.userId)),
      });
      if (!target) throw new Error("Target not found");
      if (!target.basePath) throw new Error("Target has no base path");

      const whereClause = ctx.orgId
        ? or(
            and(eq(skills.userId, ctx.userId), isNull(skills.orgId)),
            eq(skills.orgId, ctx.orgId)
          )
        : and(eq(skills.userId, ctx.userId), isNull(skills.orgId));

      const allSkills = await db.query.skills.findMany({ where: whereClause });
      const now = new Date().toISOString();
      const results: SyncResult[] = [];

      for (const skill of allSkills) {
        if (!skill.isActive) {
          results.push({ skillId: skill.id, skillName: skill.name, targetId, status: "skipped" });
          continue;
        }

        const includeTags = (target.includeTags as string[]) || [];
        const excludeTags = (target.excludeTags as string[]) || [];
        const includeProjects = (target.includeProjects as string[]) || [];

        if (includeTags.length > 0 && !skill.tags.some((t) => includeTags.includes(t))) {
          results.push({ skillId: skill.id, skillName: skill.name, targetId, status: "skipped" });
          continue;
        }
        if (excludeTags.length > 0 && skill.tags.some((t) => excludeTags.includes(t))) {
          results.push({ skillId: skill.id, skillName: skill.name, targetId, status: "skipped" });
          continue;
        }
        if (includeProjects.length > 0 && (!skill.projectId || !includeProjects.includes(skill.projectId))) {
          results.push({ skillId: skill.id, skillName: skill.name, targetId, status: "skipped" });
          continue;
        }

        const files = await db.query.skillFiles.findMany({ where: eq(skillFiles.skillId, skill.id) });
        const fileData = files.map((f) => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));

        const result = safeWriteSkillToPath(target.basePath, skill.slug, skill.content, fileData);

        await db.insert(syncLog).values({
          
          skillId: skill.id,
          targetId,
          versionSynced: skill.currentVersion,
          status: result.success ? "success" : "failed",
          error: result.error || null,
          
        });

        results.push({
          skillId: skill.id,
          skillName: skill.name,
          targetId,
          status: result.success ? "success" : "failed",
          error: result.error,
          path: result.fullPath,
        });
      }

      await db.update(syncTargets).set({ lastSyncedAt: new Date() }).where(eq(syncTargets.id, targetId));

      return {
        total: results.length,
        synced: results.filter((r) => r.status === "success").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      };
    }),

  syncAll: mutationProcedure.mutation(async ({ ctx }) => {
    const targets = await db.query.syncTargets.findMany({
      where: eq(syncTargets.userId, ctx.userId),
    });
    const activeTargets = targets.filter((t) => t.isActive);
    const allResults: { targetLabel: string; synced: number; failed: number; skipped: number }[] = [];

    const whereClause = ctx.orgId
      ? or(
          and(eq(skills.userId, ctx.userId), isNull(skills.orgId)),
          eq(skills.orgId, ctx.orgId)
        )
      : and(eq(skills.userId, ctx.userId), isNull(skills.orgId));

    for (const target of activeTargets) {
      if (!target.basePath) continue;
      const allSkills = await db.query.skills.findMany({ where: whereClause });
      const now = new Date().toISOString();
      let synced = 0, failed = 0, skipped = 0;

      for (const skill of allSkills) {
        if (!skill.isActive) { skipped++; continue; }

        const includeTags = (target.includeTags as string[]) || [];
        const excludeTags = (target.excludeTags as string[]) || [];
        if (includeTags.length > 0 && !skill.tags.some((t) => includeTags.includes(t))) { skipped++; continue; }
        if (excludeTags.length > 0 && skill.tags.some((t) => excludeTags.includes(t))) { skipped++; continue; }

        const files = await db.query.skillFiles.findMany({ where: eq(skillFiles.skillId, skill.id) });
        const fileData = files.map((f) => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));
        const result = safeWriteSkillToPath(target.basePath, skill.slug, skill.content, fileData);

        await db.insert(syncLog).values({
           skillId: skill.id, targetId: target.id,
          versionSynced: skill.currentVersion,
          status: result.success ? "success" : "failed",
          error: result.error || null, 
        });

        if (result.success) synced++; else failed++;
      }

      await db.update(syncTargets).set({ lastSyncedAt: new Date() }).where(eq(syncTargets.id, target.id));
      allResults.push({ targetLabel: target.label, synced, failed, skipped });
    }

    return { targets: allResults };
  }),

  deploySkill: mutationProcedure
    .input(z.object({
      skillId: z.string(),
      platform: z.string(),
      basePath: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const skill = await db.query.skills.findFirst({ where: eq(skills.id, input.skillId) });
      if (!skill) throw new Error("Skill not found");

      const basePath = input.basePath || PLATFORM_PATHS[input.platform];
      if (!basePath) throw new Error("No path for platform: " + input.platform);

      const files = await db.query.skillFiles.findMany({ where: eq(skillFiles.skillId, skill.id) });
      const fileData = files.map((f) => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));

      const result = safeWriteSkillToPath(basePath, skill.slug, skill.content, fileData);
      const now = new Date().toISOString();

      // Find or create matching sync target for logging
      let target = await db.query.syncTargets.findFirst({
        where: and(eq(syncTargets.platform, input.platform), eq(syncTargets.userId, ctx.userId)),
      });
      if (!target) {
        const targetId = uuid();
        await db.insert(syncTargets).values({
          id: targetId,
          userId: ctx.userId,
          platform: input.platform,
          label: input.platform.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          basePath,
          isActive: true,
          syncMode: "manual",
          lastSyncedAt: new Date(),
        });
        target = await db.query.syncTargets.findFirst({ where: eq(syncTargets.id, targetId) });
      }

      if (target) {
        await db.insert(syncLog).values({
          
          skillId: skill.id,
          targetId: target.id,
          versionSynced: skill.currentVersion,
          status: result.success ? "success" : "failed",
          error: result.error || null,
          
        });
        await db.update(syncTargets).set({ lastSyncedAt: new Date() }).where(eq(syncTargets.id, target.id));
      }

      return { success: result.success, path: result.fullPath, error: result.error };
    }),

  // ── Skill-Target Assignments ──────────────────────────────────────────────

  // Get all assignments for current user
  getAssignments: authedProcedure.query(async ({ ctx }) => {
    const userTargets = await db.query.syncTargets.findMany({
      where: eq(syncTargets.userId, ctx.userId),
      columns: { id: true },
    });
    const targetIds = new Set(userTargets.map((t) => t.id));
    if (targetIds.size === 0) return [];

    const allAssignments = await db.query.skillTargetAssignments.findMany({
      with: { skill: { columns: { id: true, slug: true, name: true } }, target: { columns: { id: true, platform: true, label: true } } },
    });
    return allAssignments.filter((a) => targetIds.has(a.targetId));
  }),

  // Assign/deploy skill to target at specific version
  assignSkill: mutationProcedure
    .input(z.object({ skillId: z.string(), targetId: z.string(), version: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership of both skill and target
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      const target = await db.query.syncTargets.findFirst({
        where: and(eq(syncTargets.id, input.targetId), eq(syncTargets.userId, ctx.userId)),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Target not found" });

      // Get skill current version if not specified
      let version = input.version;
      if (!version) {
        version = skill.currentVersion ?? 1;
      }

      const existing = await db.query.skillTargetAssignments.findFirst({
        where: and(
          eq(skillTargetAssignments.skillId, input.skillId),
          eq(skillTargetAssignments.targetId, input.targetId)
        ),
      });

      if (existing) {
        // Update deployed version
        await db.update(skillTargetAssignments)
          .set({ deployedVersion: version, deployedAt: new Date() })
          .where(eq(skillTargetAssignments.id, existing.id));
        return { id: existing.id, deployedVersion: version };
      }

      const [inserted] = await db.insert(skillTargetAssignments).values({
        skillId: input.skillId,
        targetId: input.targetId,
        deployedVersion: version,
      }).returning({ id: skillTargetAssignments.id });
      return { ...inserted, deployedVersion: version };
    }),

  // Deploy specific version to target (update existing assignment)
  deployVersion: mutationProcedure
    .input(z.object({ skillId: z.string(), targetId: z.string(), version: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership of both skill and target
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      const target = await db.query.syncTargets.findFirst({
        where: and(eq(syncTargets.id, input.targetId), eq(syncTargets.userId, ctx.userId)),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Target not found" });

      const existing = await db.query.skillTargetAssignments.findFirst({
        where: and(
          eq(skillTargetAssignments.skillId, input.skillId),
          eq(skillTargetAssignments.targetId, input.targetId)
        ),
      });

      if (!existing) {
        throw new Error("Skill not assigned to this target. Deploy first.");
      }

      await db.update(skillTargetAssignments)
        .set({ deployedVersion: input.version, deployedAt: new Date() })
        .where(eq(skillTargetAssignments.id, existing.id));

      return { success: true, deployedVersion: input.version };
    }),

  // Unassign skill from target
  unassignSkill: mutationProcedure
    .input(z.object({ skillId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership of both skill and target
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      const target = await db.query.syncTargets.findFirst({
        where: and(eq(syncTargets.id, input.targetId), eq(syncTargets.userId, ctx.userId)),
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Target not found" });

      await db.delete(skillTargetAssignments).where(
        and(
          eq(skillTargetAssignments.skillId, input.skillId),
          eq(skillTargetAssignments.targetId, input.targetId)
        )
      );
      return { success: true };
    }),

  // Bulk assign: set all targets for a skill at once
  setSkillTargets: mutationProcedure
    .input(z.object({ skillId: z.string(), targetIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // Verify skill ownership
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      // Verify all target IDs belong to user
      if (input.targetIds.length > 0) {
        const userTargets = await db.query.syncTargets.findMany({
          where: and(eq(syncTargets.userId, ctx.userId)),
          columns: { id: true },
        });
        const userTargetIds = new Set(userTargets.map((t) => t.id));
        for (const tid of input.targetIds) {
          if (!userTargetIds.has(tid)) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Target not found" });
          }
        }
      }

      // Remove all existing
      await db.delete(skillTargetAssignments).where(eq(skillTargetAssignments.skillId, input.skillId));
      // Add new
      if (input.targetIds.length > 0) {
        await db.insert(skillTargetAssignments).values(
          input.targetIds.map((tid) => ({ skillId: input.skillId, targetId: tid }))
        );
      }
      return { success: true };
    }),

  // ── Local Skill State (reported by CLI) ───────────────────────────────────

  getLocalState: authedProcedure.query(async ({ ctx }) => {
    return db.query.localSkillState.findMany({
      where: eq(localSkillState.userId, ctx.userId),
    });
  }),

  // Send a command to CLI via heartbeat (e.g. "import" to trigger batch import)
  sendCliCommand: mutationProcedure
    .input(z.object({ action: z.string(), slugs: z.array(z.string()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const key = "cli_pending_sync";
      const value = JSON.stringify({ action: input.action, slugs: input.slugs });
      const existing = await db.query.appSettings.findFirst({
        where: and(eq(appSettings.key, key), eq(appSettings.userId, ctx.userId)),
      });
      if (existing) {
        await db.update(appSettings).set({ value }).where(and(eq(appSettings.key, key), eq(appSettings.userId, ctx.userId)));
      } else {
        await db.insert(appSettings).values({ userId: ctx.userId, key, value });
      }
      return { sent: true };
    }),

  // ── Change Requests (like pull requests) ──────────────────────────────────

  pendingChanges: authedProcedure.query(async ({ ctx }) => {
    return db.query.skillChangeRequests.findMany({
      where: and(
        eq(skillChangeRequests.userId, ctx.userId),
        eq(skillChangeRequests.status, "pending")
      ),
      orderBy: [desc(skillChangeRequests.createdAt)],
    });
  }),

  acceptChange: mutationProcedure
    .input(z.object({ changeId: z.string(), targetIds: z.array(z.string()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const change = await db.query.skillChangeRequests.findFirst({
        where: and(eq(skillChangeRequests.id, input.changeId), eq(skillChangeRequests.userId, ctx.userId)),
      });
      if (!change) throw new Error("Change request not found");

      if (change.skillId) {
        // Existing skill - update content + create new version
        const skill = await db.query.skills.findFirst({ where: eq(skills.id, change.skillId) });
        if (skill) {
          const newVersion = skill.currentVersion + 1;
          await db.insert(skillVersions).values({
            skillId: skill.id,
            version: newVersion,
            content: change.newContent,
            description: skill.description,
            author: `local-${change.platform}`,
            changelog: `Accepted local change from ${change.platform}`,
          });
          await db.update(skills)
            .set({ content: change.newContent, currentVersion: newVersion, updatedAt: new Date() })
            .where(eq(skills.id, skill.id));
        }
      } else {
        // New skill - create it
        const displayName = change.slug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        const descMatch = change.newContent.match(/^description:\s*(.+)$/m);
        const description = descMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "";

        const [inserted] = await db.insert(skills).values({
          userId: ctx.userId,
          slug: change.slug,
          name: displayName,
          description: description.slice(0, 500),
          content: change.newContent,
          currentVersion: 1,
        }).returning({ id: skills.id });

        await db.insert(skillVersions).values({
          skillId: inserted.id,
          version: 1,
          content: change.newContent,
          description: description.slice(0, 500),
          author: `local-${change.platform}`,
          changelog: `Imported from local ${change.platform}`,
        });
      }

      // Mark as accepted
      await db.update(skillChangeRequests)
        .set({ status: "accepted", resolvedAt: new Date() })
        .where(eq(skillChangeRequests.id, input.changeId));

      // Auto-update deployedVersion on all assignments for this skill,
      // since the content came from local - no need to "deploy" it back.
      const targetSkillId = change.skillId || (await db.query.skills.findFirst({
        where: and(eq(skills.slug, change.slug), eq(skills.userId, ctx.userId)),
        columns: { id: true, currentVersion: true },
      }))?.id;

      if (targetSkillId) {
        const skill = await db.query.skills.findFirst({
          where: eq(skills.id, targetSkillId),
          columns: { currentVersion: true },
        });
        if (skill) {
          // Only update specified targets (or all if not specified, for backward compat)
          if (input.targetIds && input.targetIds.length > 0) {
            for (const tid of input.targetIds) {
              await db.update(skillTargetAssignments)
                .set({ deployedVersion: skill.currentVersion, deployedAt: new Date() })
                .where(and(
                  eq(skillTargetAssignments.skillId, targetSkillId),
                  eq(skillTargetAssignments.targetId, tid)
                ));
            }
          } else {
            // Default: update all (backward compat for CLI accept)
            await db.update(skillTargetAssignments)
              .set({ deployedVersion: skill.currentVersion, deployedAt: new Date() })
              .where(eq(skillTargetAssignments.skillId, targetSkillId));
          }
        }
      }

      return { success: true };
    }),

  rejectChange: mutationProcedure
    .input(z.object({ changeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(skillChangeRequests)
        .set({ status: "rejected", resolvedAt: new Date() })
        .where(and(eq(skillChangeRequests.id, input.changeId), eq(skillChangeRequests.userId, ctx.userId)));
      return { success: true };
    }),

  acceptAllChanges: mutationProcedure
    .input(z.object({ targetIds: z.array(z.string()).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
    const pending = await db.query.skillChangeRequests.findMany({
      where: and(eq(skillChangeRequests.userId, ctx.userId), eq(skillChangeRequests.status, "pending")),
    });
    // Accept each one (reuse logic)
    let accepted = 0;
    for (const change of pending) {
      if (change.skillId) {
        const skill = await db.query.skills.findFirst({ where: eq(skills.id, change.skillId) });
        if (skill) {
          const newVersion = skill.currentVersion + 1;
          await db.insert(skillVersions).values({
            skillId: skill.id, version: newVersion, content: change.newContent,
            description: skill.description, author: `local-${change.platform}`,
            changelog: `Accepted local change from ${change.platform}`,
          });
          await db.update(skills).set({ content: change.newContent, currentVersion: newVersion, updatedAt: new Date() }).where(eq(skills.id, skill.id));
        }
      }
      await db.update(skillChangeRequests).set({ status: "accepted", resolvedAt: new Date() }).where(eq(skillChangeRequests.id, change.id));

      // Auto-update deployedVersion - content came from local
      if (change.skillId) {
        const updatedSkill = await db.query.skills.findFirst({
          where: eq(skills.id, change.skillId),
          columns: { currentVersion: true },
        });
        if (updatedSkill) {
          // Only update specified targets (or all if not specified, for backward compat)
          if (input?.targetIds && input.targetIds.length > 0) {
            for (const tid of input.targetIds) {
              await db.update(skillTargetAssignments)
                .set({ deployedVersion: updatedSkill.currentVersion, deployedAt: new Date() })
                .where(and(
                  eq(skillTargetAssignments.skillId, change.skillId),
                  eq(skillTargetAssignments.targetId, tid)
                ));
            }
          } else {
            // Default: update all (backward compat for CLI accept)
            await db.update(skillTargetAssignments)
              .set({ deployedVersion: updatedSkill.currentVersion, deployedAt: new Date() })
              .where(eq(skillTargetAssignments.skillId, change.skillId));
          }
        }
      }

      accepted++;
    }
    return { accepted };
  }),
});
