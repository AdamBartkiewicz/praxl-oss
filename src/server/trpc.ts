import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { db } from "@/db";
import { users, orgMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { rateLimiter } from "@/lib/rate-limit";

export interface Context {
  userId: string | null;
  orgId: string | null;
  isPro: boolean;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Ensure user exists in our DB (auto-create on first request)
async function ensureUserInDb(userId: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!existing) {
    await db.insert(users).values({
      id: userId,
      email: `${userId}@local`,
      name: null,
    }).onConflictDoNothing();
  }
}

// Authenticated procedure - requires logged-in user
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action",
    });
  }

  // Auto-create user in DB if not exists
  await ensureUserInDb(ctx.userId);

  // Validate orgId against our DB membership
  let validatedOrgId = ctx.orgId;
  if (validatedOrgId) {
    const membership = await db.query.orgMembers.findFirst({
      where: and(eq(orgMembers.orgId, validatedOrgId), eq(orgMembers.userId, ctx.userId)),
    });
    if (!membership) {
      validatedOrgId = null; // Not a member - strip orgId
    }
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      orgId: validatedOrgId,
      isPro: ctx.isPro,
    },
  });
});

// Rate-limited procedure for standard mutations (60 per minute per user)
export const mutationProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const limit = rateLimiter.check(`trpc-mutation:${ctx.userId}`, 60, 60 * 1000);
  if (!limit.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limited. Wait a moment and try again.",
    });
  }
  return next();
});

// Rate-limited procedure for expensive operations (AI calls)
export const rateLimitedProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const limit = rateLimiter.check(`trpc:${ctx.userId}`, 30, 60 * 1000); // 30 per minute
  if (!limit.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limited. Wait a moment and try again.",
    });
  }
  return next();
});
