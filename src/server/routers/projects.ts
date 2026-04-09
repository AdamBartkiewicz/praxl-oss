import { z } from "zod";
import { router, authedProcedure, mutationProcedure } from "../trpc";
import { db } from "@/db";
import { projects, skills, skillTargetAssignments, syncTargets } from "@/db/schema";
import { eq, desc, and, isNull, count } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { TRPCError } from "@trpc/server";
import { assertCanCreate } from "@/lib/plans";
import { buildPersonalFilter } from "@/lib/workspace-filter";

export const projectsRouter = router({
  list: authedProcedure
    .input(z.object({ orgId: z.string().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
    // Org workspace: no project sharing yet - return empty
    if (input?.orgId) return [];

    return db.query.projects.findMany({
      where: buildPersonalFilter(projects, ctx.userId),
      with: { skills: true },
      orderBy: [desc(projects.createdAt)],
    });
  }),

  get: authedProcedure.input(z.object({ id: z.string(), orgId: z.string().nullable().optional() })).query(async ({ ctx, input }) => {
    const whereClause = buildPersonalFilter(projects, ctx.userId);

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, input.id), whereClause),
      with: { skills: true },
    });
    if (!project) throw new TRPCError({ code: "NOT_FOUND" });

    // Get deploy status for each skill
    const skillStats = await Promise.all(
      (project.skills || []).map(async (skill) => {
        const assignments = await db.query.skillTargetAssignments.findMany({
          where: eq(skillTargetAssignments.skillId, skill.id),
          with: { target: { columns: { platform: true, label: true } } },
        });
        const outdated = assignments.filter(a => a.deployedVersion < skill.currentVersion);
        return {
          ...skill,
          deployedTargets: assignments.length,
          outdatedTargets: outdated.length,
          platforms: assignments.map(a => a.target.platform),
        };
      })
    );

    return { ...project, skills: skillStats };
  }),

  create: mutationProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      description: z.string().nullable().default(null),
      context: z.string().default(""),
      template: z.string().nullable().default(null),
      icon: z.string().nullable().default(null),
      color: z.string().nullable().default(null),
      orgId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanCreate(
        ctx.isPro,
        async () => {
          const r = await db.select({ c: count() }).from(projects).where(eq(projects.userId, ctx.userId));
          return Number(r[0]?.c || 0);
        },
        "maxProjects",
        "Project",
      );
      const id = uuid();
      await db.insert(projects).values({
        id,
        userId: ctx.userId,
        orgId: null, // Projects are always personal
        ...input,
      });
      return db.query.projects.findFirst({
        where: eq(projects.id, id),
        with: { skills: true },
      });
    }),

  update: mutationProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      context: z.string().optional(),
      icon: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const existing = await db.query.projects.findFirst({ where: eq(projects.id, id) });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.userId !== ctx.userId && !(ctx.orgId && existing.orgId === ctx.orgId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.update(projects).set(updates).where(eq(projects.id, id));
      return db.query.projects.findFirst({ where: eq(projects.id, id), with: { skills: true } });
    }),

  delete: mutationProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const existing = await db.query.projects.findFirst({ where: eq(projects.id, input) });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
    if (existing.userId !== ctx.userId && !(ctx.orgId && existing.orgId === ctx.orgId)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    await db.update(skills).set({ projectId: null }).where(eq(skills.projectId, input));
    await db.delete(projects).where(eq(projects.id, input));
    return { success: true };
  }),

  // Get project context (for AI to use when editing skills in this project)
  getContext: authedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, input), eq(projects.userId, ctx.userId)),
      columns: { context: true, name: true, description: true },
    });
    return project;
  }),

  // Batch: get summary stats for all projects
  summary: authedProcedure
    .input(z.object({ orgId: z.string().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
    if (input?.orgId) return [];

    const allProjects = await db.query.projects.findMany({
      where: buildPersonalFilter(projects, ctx.userId),
      with: { skills: true },
    });

    return allProjects.map(p => {
      const skillCount = p.skills?.length || 0;
      const activeCount = p.skills?.filter(s => s.isActive).length || 0;
      const avgVersion = skillCount > 0
        ? Math.round(p.skills!.reduce((sum, s) => sum + s.currentVersion, 0) / skillCount * 10) / 10
        : 0;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
        color: p.color,
        context: p.context,
        skillCount,
        activeCount,
        avgVersion,
      };
    });
  }),
});
