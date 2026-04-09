import { z } from "zod";
import { router, authedProcedure, mutationProcedure } from "../trpc";
import { db } from "@/db";
import { skills, skillVersions, skillFiles, syncLog, aiSuggestions, orgMembers, skillUsageEvents } from "@/db/schema";
import { eq, desc, and, isNull, count, inArray, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { createDiff } from "@/lib/diff";
import { TRPCError } from "@trpc/server";
import { securityScan } from "@/lib/security-scan";
import { assertCanCreate } from "@/lib/plans";
import { validateOrgMembership, getOrgSharedSkillIds, buildPersonalFilter, ensureOrgSkillSharesTable } from "@/lib/workspace-filter";
import { orgSkillShares } from "@/db/schema";


/** Fetch skill IDs for the active workspace (personal or org shared) */
async function workspaceSkillIds(userId: string, orgId: string | null): Promise<string[]> {
  if (orgId) {
    await ensureOrgSkillSharesTable();
    return getOrgSharedSkillIds(orgId);
  }
  const rows = await db.query.skills.findMany({
    where: buildPersonalFilter(skills, userId),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

async function assertNotViewer(userId: string, orgId: string | null) {
  if (!orgId) return; // Personal skills - no org role check
  const membership = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)),
  });
  if (membership?.role === "viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot modify org skills" });
  }
}

export const skillsRouter = router({
  list: authedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        tag: z.string().optional(),
        search: z.string().optional(),
        platform: z.string().optional(),
        isActive: z.boolean().optional(),
        orgId: z.string().nullable().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const wsOrgId = input?.orgId ?? null;
      if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);

      const wsIds = await workspaceSkillIds(ctx.userId, wsOrgId);
      if (wsIds.length === 0) return [];
      let result = await db.query.skills.findMany({
        where: inArray(skills.id, wsIds),
        with: { project: true },
        orderBy: [desc(skills.updatedAt)],
      });

      if (input?.projectId) {
        result = result.filter((s) => s.projectId === input.projectId);
      }
      if (input?.tag) {
        result = result.filter((s) => s.tags.includes(input.tag!));
      }
      if (input?.search) {
        const q = input.search.toLowerCase();
        result = result.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.slug.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q)
        );
      }
      if (input?.platform) {
        result = result.filter((s) => s.platformHints.includes(input.platform!));
      }
      if (input?.isActive !== undefined) {
        result = result.filter((s) => s.isActive === input.isActive);
      }

      return result;
    }),

  get: authedProcedure
    .input(z.object({ id: z.string(), orgId: z.string().nullable().optional() }))
    .query(async ({ ctx, input }) => {
    const wsOrgId = input.orgId ?? null;
    if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);

    // For org workspace, check if skill is shared to org
    if (wsOrgId) {
      await ensureOrgSkillSharesTable();
      const shared = await db.query.orgSkillShares.findFirst({
        where: and(eq(orgSkillShares.orgId, wsOrgId), eq(orgSkillShares.skillId, input.id)),
      });
      if (!shared) return null;
    }

    const whereClause = wsOrgId
      ? eq(skills.id, input.id)
      : and(eq(skills.id, input.id), buildPersonalFilter(skills, ctx.userId));

    return db.query.skills.findFirst({
      where: whereClause,
      with: { project: true, versions: { orderBy: [desc(skillVersions.version)] } },
    });
  }),

  // Get AI persistent notes for a skill
  getNotes: authedProcedure.input(z.string()).query(async ({ ctx, input: skillId }) => {
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.id, skillId), eq(skills.userId, ctx.userId)),
      columns: { aiNotes: true },
    });
    return (skill?.aiNotes as Array<{ note: string; createdAt: string }>) || [];
  }),

  // Save AI persistent note for a skill
  saveNote: mutationProcedure
    .input(z.object({ skillId: z.string(), note: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
        columns: { aiNotes: true },
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });
      const current = (skill.aiNotes as Array<{ note: string; createdAt: string }>) || [];
      const updated = [...current.slice(-19), { note: input.note, createdAt: new Date().toISOString() }];
      await db.update(skills).set({ aiNotes: updated }).where(eq(skills.id, input.skillId));
      return { ok: true };
    }),

  getBySlug: authedProcedure
    .input(z.object({ slug: z.string(), orgId: z.string().nullable().optional() }))
    .query(async ({ ctx, input }) => {
    const wsOrgId = input.orgId ?? null;
    if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);

    if (wsOrgId) {
      // In org workspace: find skill by slug among shared skills
      await ensureOrgSkillSharesTable();
      const sharedIds = await getOrgSharedSkillIds(wsOrgId);
      if (sharedIds.length === 0) return null;
      return db.query.skills.findFirst({
        where: and(eq(skills.slug, input.slug), inArray(skills.id, sharedIds)),
        with: { project: true, versions: { orderBy: [desc(skillVersions.version)] } },
      });
    }

    return db.query.skills.findFirst({
      where: and(eq(skills.slug, input.slug), buildPersonalFilter(skills, ctx.userId)),
      with: { project: true, versions: { orderBy: [desc(skillVersions.version)] } },
    });
  }),

  create: mutationProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        slug: z.string().min(1).max(100),
        description: z.string().max(2000).default(""),
        content: z.string().max(500000).default(""), // 500KB max
        projectId: z.string().nullable().default(null),
        tags: z.array(z.string()).default([]),
        platformHints: z.array(z.string()).default([]),
        license: z.string().nullable().default(null),
        compatibility: z.string().nullable().default(null),
        allowedTools: z.string().nullable().default(null),
        skillMetadata: z.record(z.string(), z.string()).default({}),
        skillCategory: z.string().nullable().default(null),
        pattern: z.string().nullable().default(null),
        orgId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertNotViewer(ctx.userId, input.orgId ?? null);

      // Enforce plan limit
      await assertCanCreate(
        ctx.isPro,
        async () => {
          const result = await db.select({ c: count() }).from(skills).where(eq(skills.userId, ctx.userId));
          return Number(result[0]?.c || 0);
        },
        "maxSkills",
        "Skill",
      );

      // Check for duplicate slug
      const existing = await db.query.skills.findFirst({
        where: and(eq(skills.slug, input.slug), eq(skills.userId, ctx.userId)),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "A skill with this slug already exists" });
      }

      const scanResult = input.content ? securityScan(input.content) : null;

      const shareToOrgId = input.orgId ?? null;
      if (shareToOrgId) await validateOrgMembership(ctx.userId, shareToOrgId);

      const [inserted] = await db.insert(skills).values({
        userId: ctx.userId,
        orgId: null, // Skills are always personal; shared to org via orgSkillShares
        slug: input.slug,
        name: input.name,
        description: input.description,
        content: input.content,
        projectId: input.projectId,
        tags: input.tags,
        platformHints: input.platformHints,
        license: input.license,
        compatibility: input.compatibility,
        allowedTools: input.allowedTools,
        skillMetadata: input.skillMetadata,
        skillCategory: input.skillCategory,
        pattern: input.pattern,
        currentVersion: 1,
      }).returning({ id: skills.id });
      const id = inserted.id;

      // Snapshot files for this version
      const currentFiles = await db.query.skillFiles.findMany({ where: eq(skillFiles.skillId, id) });
      const fileSnapshot = currentFiles.map(f => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));

      await db.insert(skillVersions).values({
        skillId: id,
        version: 1,
        content: input.content,
        description: input.description,
        author: "user",
        changelog: "Initial version",
        diffFromPrevious: "",
        files: fileSnapshot,
      });

      // Auto-share to org if created in org workspace context
      if (shareToOrgId) {
        await ensureOrgSkillSharesTable();
        await db.insert(orgSkillShares).values({
          orgId: shareToOrgId,
          skillId: id,
          sharedBy: ctx.userId,
        });
      }

      // Track for email automation
      // Event tracking removed (open-source)

      const created = await db.query.skills.findFirst({
        where: eq(skills.id, id),
        with: { project: true },
      });

      if (scanResult && scanResult.flags.length > 0) {
        return { ...created, securityFlags: scanResult.flags };
      }
      return created;
    }),

  update: mutationProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().max(200).optional(),
        slug: z.string().max(100).optional(),
        description: z.string().max(2000).optional(),
        content: z.string().max(500000).optional(), // 500KB max
        projectId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        platformHints: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
        changelog: z.string().optional(),
        license: z.string().nullable().optional(),
        compatibility: z.string().nullable().optional(),
        allowedTools: z.string().nullable().optional(),
        skillMetadata: z.record(z.string(), z.string()).optional(),
        skillCategory: z.string().nullable().optional(),
        pattern: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertNotViewer(ctx.userId, ctx.orgId);

      const { id, changelog, ...updates } = input;
      const now = new Date();

      const existing = await db.query.skills.findFirst({
        where: eq(skills.id, id),
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      // Verify ownership: user owns it OR it belongs to user's org
      const isOwner = existing.userId === ctx.userId;
      const isOrgMember = ctx.orgId && existing.orgId === ctx.orgId;
      if (!isOwner && !isOrgMember) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to update this skill" });
      }

      const scanResult = updates.content ? securityScan(updates.content) : null;

      const contentChanged = updates.content !== undefined && updates.content !== existing.content;

      if (contentChanged) {
        const newVersion = existing.currentVersion + 1;
        const diff = createDiff(existing.content, updates.content!);

        // Snapshot files for this version
        const versionFiles = await db.query.skillFiles.findMany({ where: eq(skillFiles.skillId, id) });
        const vFileSnapshot = versionFiles.map(f => ({ folder: f.folder, filename: f.filename, content: f.content, mimeType: f.mimeType }));

        await db.insert(skillVersions).values({
          skillId: id,
          version: newVersion,
          content: updates.content!,
          description: updates.description ?? existing.description,
          author: "user",
          changelog: changelog ?? null,
          diffFromPrevious: diff,
          files: vFileSnapshot,
        });

        await db
          .update(skills)
          .set({ ...updates, currentVersion: newVersion, updatedAt: now })
          .where(eq(skills.id, id));
      } else {
        await db
          .update(skills)
          .set({ ...updates, updatedAt: now })
          .where(eq(skills.id, id));
      }

      const updated = await db.query.skills.findFirst({
        where: eq(skills.id, id),
        with: { project: true },
      });

      if (scanResult && scanResult.flags.length > 0) {
        return { ...updated, securityFlags: scanResult.flags };
      }
      return updated;
    }),

  // ─── Bulk operations (Pro only) ──────────────────────────────────────────
  bulkDelete: mutationProcedure
    .input(z.object({ skillIds: z.array(z.string().uuid()).min(1).max(500), orgId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const wsOrgId = input.orgId ?? null;
      await assertNotViewer(ctx.userId, wsOrgId);

      if (!ctx.isPro) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bulk operations require Pro." });
      }
      if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);
      const wsIdList = await workspaceSkillIds(ctx.userId, wsOrgId);
      const wsIds = new Set(wsIdList);
      const allowedIds = input.skillIds.filter((id) => wsIds.has(id));
      if (allowedIds.length === 0) return { deleted: 0 };
      await db.delete(skills).where(inArray(skills.id, allowedIds));
      return { deleted: allowedIds.length };
    }),

  bulkAddTag: mutationProcedure
    .input(z.object({ skillIds: z.array(z.string().uuid()).min(1).max(500), tag: z.string().min(1).max(50), orgId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const wsOrgId = input.orgId ?? null;
      await assertNotViewer(ctx.userId, wsOrgId);

      if (!ctx.isPro) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bulk operations require Pro." });
      }
      if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);
      const wsIdList = await workspaceSkillIds(ctx.userId, wsOrgId);
      const wsIdSet = new Set(wsIdList);
      const filteredIds = input.skillIds.filter((id) => wsIdSet.has(id));
      if (filteredIds.length === 0) return { updated: 0 };
      const targets = await db.query.skills.findMany({
        where: inArray(skills.id, filteredIds),
        columns: { id: true, tags: true },
      });
      let updated = 0;
      for (const s of targets) {
        const current = s.tags || [];
        if (current.includes(input.tag)) continue;
        await db.update(skills).set({ tags: [...current, input.tag] }).where(eq(skills.id, s.id));
        updated++;
      }
      return { updated };
    }),

  bulkRemoveTag: mutationProcedure
    .input(z.object({ skillIds: z.array(z.string().uuid()).min(1).max(500), tag: z.string().min(1).max(50), orgId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const wsOrgId = input.orgId ?? null;
      await assertNotViewer(ctx.userId, wsOrgId);

      if (!ctx.isPro) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bulk operations require Pro." });
      }
      if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);
      const wsIdList = await workspaceSkillIds(ctx.userId, wsOrgId);
      const wsIdSet = new Set(wsIdList);
      const filteredIds = input.skillIds.filter((id) => wsIdSet.has(id));
      if (filteredIds.length === 0) return { updated: 0 };
      const targets = await db.query.skills.findMany({
        where: inArray(skills.id, filteredIds),
        columns: { id: true, tags: true },
      });
      let updated = 0;
      for (const s of targets) {
        const current = s.tags || [];
        if (!current.includes(input.tag)) continue;
        await db.update(skills).set({ tags: current.filter((t) => t !== input.tag) }).where(eq(skills.id, s.id));
        updated++;
      }
      return { updated };
    }),

  delete: mutationProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    await assertNotViewer(ctx.userId, ctx.orgId);

    const existing = await db.query.skills.findFirst({
      where: eq(skills.id, input),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

    const isOwner = existing.userId === ctx.userId;
    const isOrgMember = ctx.orgId && existing.orgId === ctx.orgId;
    if (!isOwner && !isOrgMember) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to delete this skill" });
    }

    await db.delete(skills).where(eq(skills.id, input));
    return { success: true };
  }),

  allTags: authedProcedure
    .input(z.object({ orgId: z.string().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const wsOrgId = input?.orgId ?? null;
    if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);

    const wsIds = await workspaceSkillIds(ctx.userId, wsOrgId);
    if (wsIds.length === 0) return [];
    const allSkills = await db.query.skills.findMany({
      where: inArray(skills.id, wsIds),
      columns: { tags: true },
    });
    const tagSet = new Set<string>();
    allSkills.forEach((s) => s.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }),

  stats: authedProcedure
    .input(z.object({ orgId: z.string().nullable().optional(), countAll: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const wsOrgId = input?.orgId ?? null;
    if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);

    let rows: { isActive: boolean; tags: string[] }[];
    if (input?.countAll) {
      // Count all user's skills (for limit checks)
      rows = await db.select({ isActive: skills.isActive, tags: skills.tags }).from(skills).where(eq(skills.userId, ctx.userId));
    } else {
      const wsIds = await workspaceSkillIds(ctx.userId, wsOrgId);
      if (wsIds.length === 0) {
        rows = [];
      } else {
        rows = await db.select({ isActive: skills.isActive, tags: skills.tags }).from(skills).where(inArray(skills.id, wsIds));
      }
    }
    const total = rows.length;
    const active = rows.filter((s) => s.isActive).length;
    const tagSet = new Set<string>();
    rows.forEach((s) => (s.tags as string[] | null)?.forEach((t) => tagSet.add(t)));
    return { total, active, inactive: total - active, uniqueTags: tagSet.size };
  }),

  rollbackToVersion: mutationProcedure
    .input(z.object({ skillId: z.string(), version: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND" });

      // Get the target version content
      const targetVersion = await db.query.skillVersions.findFirst({
        where: and(eq(skillVersions.skillId, input.skillId), eq(skillVersions.version, input.version)),
      });
      if (!targetVersion) throw new TRPCError({ code: "NOT_FOUND", message: `Version ${input.version} not found` });

      // Set currentVersion BACK to the old version (not creating new one)
      await db.update(skills)
        .set({
          content: targetVersion.content,
          description: targetVersion.description,
          currentVersion: input.version,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, input.skillId));

      // Restore files from version snapshot (if available)
      const versionFiles = targetVersion.files as Array<{ folder: string; filename: string; content: string; mimeType: string }> | null;
      if (versionFiles && versionFiles.length > 0) {
        // Delete current files and replace with version snapshot
        await db.delete(skillFiles).where(eq(skillFiles.skillId, input.skillId));
        await db.insert(skillFiles).values(
          versionFiles.map(f => ({
            skillId: input.skillId,
            folder: f.folder,
            filename: f.filename,
            content: f.content,
            mimeType: f.mimeType,
            size: f.content.length,
          }))
        );
      }

      return { success: true, version: input.version };
    }),

  getVersionDiff: authedProcedure
    .input(z.object({ skillId: z.string(), version: z.number() }))
    .query(async ({ ctx, input }) => {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND" });

      // Get the requested version
      const current = await db.query.skillVersions.findFirst({
        where: and(eq(skillVersions.skillId, input.skillId), eq(skillVersions.version, input.version)),
      });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });

      // Get the previous version (if exists)
      const previous = input.version > 1
        ? await db.query.skillVersions.findFirst({
            where: and(eq(skillVersions.skillId, input.skillId), eq(skillVersions.version, input.version - 1)),
          })
        : null;

      return {
        version: input.version,
        content: current.content,
        previousContent: previous?.content || "",
        changelog: current.changelog,
        author: current.author,
        createdAt: current.createdAt,
      };
    }),

  analytics: authedProcedure
    .input(z.object({ orgId: z.string().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const wsOrgId = input?.orgId ?? null;
    if (wsOrgId) await validateOrgMembership(ctx.userId, wsOrgId);

    // Get workspace skill IDs to scope the analytics
    const skillIds = await workspaceSkillIds(ctx.userId, wsOrgId);

    if (skillIds.length === 0) {
      return { totalVersions: 0, totalDeploys: 0, totalAiReviews: 0 };
    }

    // Run 3 aggregated counts in parallel instead of 3 per skill (N+1 → 3 queries)
    const [versionsRow, deploysRow, reviewsRow] = await Promise.all([
      db.select({ c: count() }).from(skillVersions).where(inArray(skillVersions.skillId, skillIds)),
      db.select({ c: count() }).from(syncLog).where(and(inArray(syncLog.skillId, skillIds), eq(syncLog.status, "success"))),
      db.select({ c: count() }).from(aiSuggestions).where(inArray(aiSuggestions.skillId, skillIds)),
    ]);

    return {
      totalVersions: Number(versionsRow[0]?.c || 0),
      totalDeploys: Number(deploysRow[0]?.c || 0),
      totalAiReviews: Number(reviewsRow[0]?.c || 0),
    };
  }),

  // ─── Org sharing ──────────────────────────────────────────────────────────

  /** Share a personal skill to an org workspace */
  shareToOrg: mutationProcedure
    .input(z.object({ skillId: z.string(), orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureOrgSkillSharesTable();
      await validateOrgMembership(ctx.userId, input.orgId);
      await assertNotViewer(ctx.userId, input.orgId);

      // Verify skill belongs to user
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.id, input.skillId), eq(skills.userId, ctx.userId)),
      });
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found" });

      // Check if already shared
      const existing = await db.query.orgSkillShares.findFirst({
        where: and(eq(orgSkillShares.orgId, input.orgId), eq(orgSkillShares.skillId, input.skillId)),
      });
      if (existing) return { ok: true, alreadyShared: true };

      await db.insert(orgSkillShares).values({
        orgId: input.orgId,
        skillId: input.skillId,
        sharedBy: ctx.userId,
      });
      return { ok: true, alreadyShared: false };
    }),

  /** Unshare a skill from an org workspace */
  unshareFromOrg: mutationProcedure
    .input(z.object({ skillId: z.string(), orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureOrgSkillSharesTable();
      await validateOrgMembership(ctx.userId, input.orgId);
      await assertNotViewer(ctx.userId, input.orgId);

      await db.delete(orgSkillShares).where(
        and(eq(orgSkillShares.orgId, input.orgId), eq(orgSkillShares.skillId, input.skillId))
      );
      return { ok: true };
    }),

  /** Copy a shared org skill to user's personal workspace */
  copyToPersonal: mutationProcedure
    .input(z.object({ skillId: z.string(), orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureOrgSkillSharesTable();
      await validateOrgMembership(ctx.userId, input.orgId);

      // Get the shared skill
      const shared = await db.query.orgSkillShares.findFirst({
        where: and(eq(orgSkillShares.orgId, input.orgId), eq(orgSkillShares.skillId, input.skillId)),
      });
      if (!shared) throw new TRPCError({ code: "NOT_FOUND", message: "Skill not shared in this org" });

      const original = await db.query.skills.findFirst({
        where: eq(skills.id, input.skillId),
        with: { files: true },
      });
      if (!original) throw new TRPCError({ code: "NOT_FOUND" });

      // Check if user already owns this skill (by slug)
      const existing = await db.query.skills.findFirst({
        where: and(eq(skills.slug, original.slug), eq(skills.userId, ctx.userId)),
      });
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "You already have a skill with this slug" });

      // Enforce plan limit
      await assertCanCreate(
        ctx.isPro,
        async () => {
          const result = await db.select({ c: count() }).from(skills).where(eq(skills.userId, ctx.userId));
          return Number(result[0]?.c || 0);
        },
        "maxSkills",
        "Skill",
      );

      const id = uuid();
      await db.insert(skills).values({
        id,
        userId: ctx.userId,
        orgId: null,
        slug: original.slug,
        name: original.name,
        description: original.description,
        content: original.content,
        tags: original.tags,
        platformHints: original.platformHints,
        isActive: original.isActive,
        license: original.license,
        compatibility: original.compatibility,
        allowedTools: original.allowedTools,
        skillMetadata: original.skillMetadata,
        skillCategory: original.skillCategory,
        pattern: original.pattern,
        currentVersion: 1,
      });

      // Copy files
      if (original.files && original.files.length > 0) {
        await db.insert(skillFiles).values(
          original.files.map((f) => ({
            skillId: id,
            folder: f.folder,
            filename: f.filename,
            content: f.content,
            mimeType: f.mimeType,
            size: f.size,
          }))
        );
      }

      // Create version 1
      await db.insert(skillVersions).values({
        skillId: id,
        version: 1,
        content: original.content,
        description: original.description,
        author: "copy",
        changelog: `Copied from org workspace`,
      });

      return db.query.skills.findFirst({ where: eq(skills.id, id), with: { project: true } });
    }),

  /** Get list of skill IDs shared to an org (for UI indicators) */
  orgSharedIds: authedProcedure
    .input(z.object({ orgId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureOrgSkillSharesTable();
      await validateOrgMembership(ctx.userId, input.orgId);
      const shares = await db.query.orgSkillShares.findMany({
        where: eq(orgSkillShares.orgId, input.orgId),
        columns: { skillId: true, sharedBy: true },
      });
      return shares;
    }),

  /** Get all shares for user's own skills (to show "Shared" badge in personal view) */
  mySharedSkills: authedProcedure.query(async ({ ctx }) => {
    await ensureOrgSkillSharesTable();
    const shares = await db.query.orgSkillShares.findMany({
      where: eq(orgSkillShares.sharedBy, ctx.userId),
      columns: { skillId: true, orgId: true },
    });
    // Group by skillId → list of orgIds
    const map: Record<string, string[]> = {};
    for (const s of shares) {
      if (!map[s.skillId]) map[s.skillId] = [];
      map[s.skillId].push(s.orgId);
    }
    return map;
  }),

  /** Track skill activity from web app (view, AI review, AI chat, sync) */
  trackUsage: authedProcedure
    .input(z.object({ skillSlug: z.string(), source: z.enum(["view", "ai-review", "ai-chat", "sync", "edit"]) }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(skillUsageEvents).values({
        userId: ctx.userId,
        skillSlug: input.skillSlug,
        platform: input.source,
        usedAt: new Date(),
      });
      return { ok: true };
    }),

  /** Import a skill from ClawHub into user's Praxl account */
  importFromClawHub: mutationProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { getClawHubSkill } = await import("@/lib/clawhub");
      const clawSkill = await getClawHubSkill(input.slug);
      if (!clawSkill) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Skill not found on ClawHub" });
      }

      // Use readme if available, otherwise generate minimal SKILL.md from metadata
      if (!clawSkill.readme) {
        clawSkill.readme = `---\nname: ${clawSkill.slug}\ndescription: ${clawSkill.description}\nversion: ${clawSkill.version}\n---\n\n# ${clawSkill.name}\n\n${clawSkill.description}\n`;
      }

      // Check duplicate
      const existing = await db.query.skills.findFirst({
        where: and(eq(skills.slug, clawSkill.slug), eq(skills.userId, ctx.userId)),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "You already have a skill with this slug" });
      }

      // Enforce plan limit
      await assertCanCreate(
        ctx.isPro,
        async () => {
          const result = await db.select({ c: count() }).from(skills).where(eq(skills.userId, ctx.userId));
          return Number(result[0]?.c || 0);
        },
        "maxSkills",
        "Skill",
      );

      // Parse frontmatter
      const fmMatch = clawSkill.readme.match(/^---\n([\s\S]*?)\n---/);
      let description = clawSkill.description;
      if (fmMatch) {
        const descMatch = fmMatch[1].match(/description:\s*["']?(.+?)["']?\s*$/m);
        if (descMatch) description = descMatch[1];
      }

      const id = uuid();
      await db.insert(skills).values({
        id,
        userId: ctx.userId,
        orgId: null,
        slug: clawSkill.slug,
        name: clawSkill.name,
        description,
        content: clawSkill.readme,
        tags: ["clawhub", ...(clawSkill.tags || [])],
        currentVersion: 1,
      });

      await db.insert(skillVersions).values({
        skillId: id,
        version: 1,
        content: clawSkill.readme,
        description,
        author: `clawhub:${clawSkill.author || clawSkill.slug}`,
        changelog: `Imported from ClawHub (v${clawSkill.version})`,
      });

      // Event tracking removed (open-source)

      return db.query.skills.findFirst({ where: eq(skills.id, id), with: { project: true } });
    }),
});
