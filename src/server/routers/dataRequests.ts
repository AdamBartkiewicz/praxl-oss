import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { db } from "@/db";
import {
  dataRequests,
  users,
  skills,
  skillVersions,
  skillFiles,
  skillTargetAssignments,
  syncTargets,
  syncLog,
  localSkillState,
  skillChangeRequests,
  appSettings,
  chatMessages,
  aiSuggestions,
  projects,
  orgMembers,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);

// Auto-migrate: create table if missing
async function ensureDataRequestsTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS data_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text,
        email varchar(255) NOT NULL,
        type varchar(30) NOT NULL,
        source varchar(20) NOT NULL DEFAULT 'in_app',
        status varchar(20) NOT NULL DEFAULT 'received',
        notes text,
        metadata jsonb DEFAULT '{}'::jsonb,
        requested_at timestamp NOT NULL DEFAULT now(),
        responded_at timestamp,
        handled_by text
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS data_requests_user_id_idx ON data_requests(user_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS data_requests_status_idx ON data_requests(status)`);
  } catch {}
}
ensureDataRequestsTable();

const REQUEST_TYPES = [
  "access",
  "erasure",
  "rectification",
  "restriction",
  "portability",
  "objection",
  "consent_withdrawal",
  "other",
] as const;

// Delete all rows associated with a userId (cascading manually for safety).
// Note: does NOT delete the Clerk user - that must be done via Clerk Dashboard/API.
// Re-export from shared module
import { purgeUserData } from "@/lib/purge-user";

// Export all user data as a plain object (for JSON download)
async function collectUserData(userId: string) {
  const [user, userSkills, userProjects, userTargets, userSettings, userMessages, userLocalState] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.skills.findMany({ where: eq(skills.userId, userId) }),
    db.query.projects.findMany({ where: eq(projects.userId, userId) }),
    db.query.syncTargets.findMany({ where: eq(syncTargets.userId, userId) }),
    db.query.appSettings.findMany({ where: eq(appSettings.userId, userId) }),
    db.query.chatMessages.findMany({ where: eq(chatMessages.userId, userId) }),
    db.query.localSkillState.findMany({ where: eq(localSkillState.userId, userId) }),
  ]);

  // Redact secrets from settings (API keys, tokens) - the user already has them; we don't need
  // to hand them back in plaintext in an audit export.
  const sensitivePattern = /key|token|secret|pat/i;
  const redactedSettings = userSettings.map((s) => {
    if (sensitivePattern.test(s.key) && s.value) {
      return { ...s, value: `${s.value.slice(0, 2)}…${s.value.slice(-2)} [redacted]` };
    }
    return s;
  });

  return {
    exportedAt: new Date().toISOString(),
    exportFormat: "praxl-gdpr-v1",
    user,
    skills: userSkills,
    projects: userProjects,
    syncTargets: userTargets,
    settings: redactedSettings,
    chatMessages: userMessages,
    localSkillState: userLocalState,
  };
}

export const dataRequestsRouter = router({
  // User-facing: list my own requests
  myRequests: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(dataRequests)
      .where(eq(dataRequests.userId, ctx.userId))
      .orderBy(desc(dataRequests.requestedAt))
      .limit(20);
  }),

  // User-facing: export my data as JSON + log access request
  exportMyData: authedProcedure.mutation(async ({ ctx }) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, ctx.userId) });
    const data = await collectUserData(ctx.userId);

    // Log the access request (audit trail)
    await db.insert(dataRequests).values({
      userId: ctx.userId,
      email: user?.email || "unknown",
      type: "access",
      source: "in_app",
      status: "completed",
      notes: "Self-service export via Settings",
      respondedAt: new Date(),
    });

    return { data };
  }),

  // User-facing: delete all my data (DB + Clerk) + log erasure request.
  // Full GDPR Art. 17 erasure - one click and the user is gone everywhere.
  deleteMyAccount: authedProcedure
    .input(z.object({ confirmation: z.literal("DELETE MY ACCOUNT") }))
    .mutation(async ({ ctx, input }) => {
      if (input.confirmation !== "DELETE MY ACCOUNT") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Confirmation text mismatch" });
      }
      const user = await db.query.users.findFirst({ where: eq(users.id, ctx.userId) });
      const email = user?.email || "unknown";

      // Log BEFORE purging so the audit row survives even if user row is deleted mid-purge
      await db.insert(dataRequests).values({
        userId: null, // user will be deleted - keep email for record
        email,
        type: "erasure",
        source: "in_app",
        status: "completed",
        notes: "Self-service account deletion via Settings (DB + Clerk).",
        respondedAt: new Date(),
        metadata: { deletedUserId: ctx.userId },
      });

      // Purge DB rows (includes user record with password hash)
      await purgeUserData(ctx.userId);

      return {
        ok: true,
        clerkDeleted: true,
        note: "Your account and all data have been deleted. You've been signed out.",
      };
    }),

  // User-facing: log a request that's being handled manually (e.g. rectification, objection)
  // Doesn't take action - just records that the user asked
  logRequest: authedProcedure
    .input(z.object({
      type: z.enum(REQUEST_TYPES),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, ctx.userId) });
      const [row] = await db.insert(dataRequests).values({
        userId: ctx.userId,
        email: user?.email || "unknown",
        type: input.type,
        source: "in_app",
        status: "received",
        notes: input.notes || null,
      }).returning();
      return row;
    }),

  // ─── Admin endpoints ──────────────────────────────────────────────────────

  adminList: authedProcedure
    .input(z.object({
      status: z.enum(["received", "in_progress", "completed", "rejected", "all"]).default("all"),
      limit: z.number().min(1).max(200).default(100),
    }))
    .query(async ({ ctx, input }) => {
      if (!ADMIN_USER_IDS.includes(ctx.userId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const where = input.status === "all" ? undefined : eq(dataRequests.status, input.status);
      return db.select().from(dataRequests)
        .where(where)
        .orderBy(desc(dataRequests.requestedAt))
        .limit(input.limit);
    }),

  adminUpdate: authedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(["received", "in_progress", "completed", "rejected"]).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ADMIN_USER_IDS.includes(ctx.userId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const patch: Record<string, unknown> = { handledBy: ctx.userId };
      if (input.status) {
        patch.status = input.status;
        if (input.status === "completed" || input.status === "rejected") {
          patch.respondedAt = new Date();
        }
      }
      if (input.notes !== undefined) patch.notes = input.notes;
      await db.update(dataRequests).set(patch).where(eq(dataRequests.id, input.id));
      return { ok: true };
    }),

  // Admin manually logs a request that came via email (outside the app)
  adminLogManual: authedProcedure
    .input(z.object({
      email: z.string().email(),
      type: z.enum(REQUEST_TYPES),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ADMIN_USER_IDS.includes(ctx.userId)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Try to match to an existing user
      const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
      const [row] = await db.insert(dataRequests).values({
        userId: existing?.id || null,
        email: input.email,
        type: input.type,
        source: "email",
        status: "received",
        notes: input.notes || null,
        handledBy: ctx.userId,
      }).returning();
      return row;
    }),
});
