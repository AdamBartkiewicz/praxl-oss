import { z } from "zod";
import { router, authedProcedure } from "../trpc";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPlanLimits } from "@/lib/plans";

async function decryptSetting(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  try {
    const { decrypt, isEncrypted } = await import("@/lib/encryption");
    return isEncrypted(value) ? decrypt(value) : value;
  } catch {
    return value; // Fallback if ENCRYPTION_KEY not configured
  }
}

export const settingsRouter = router({
  get: authedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const row = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, input), eq(appSettings.userId, ctx.userId)),
    });
    return row?.value ?? null;
  }),

  set: authedProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Encrypt sensitive keys before storing
      if (input.key === "anthropic_api_key" || input.key === "github_pat") {
        try {
          const { encrypt } = await import("@/lib/encryption");
          input.value = encrypt(input.value);
        } catch {} // If ENCRYPTION_KEY not set, store plaintext (dev mode)
      }
      const existing = await db.query.appSettings.findFirst({
        where: and(eq(appSettings.key, input.key), eq(appSettings.userId, ctx.userId)),
      });
      if (existing) {
        await db
          .update(appSettings)
          .set({ value: input.value })
          .where(and(eq(appSettings.key, input.key), eq(appSettings.userId, ctx.userId)));
      } else {
        await db.insert(appSettings).values({
          key: input.key,
          value: input.value,
          userId: ctx.userId,
        });
      }
      return { success: true };
    }),

  delete: authedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    await db
      .delete(appSettings)
      .where(and(eq(appSettings.key, input), eq(appSettings.userId, ctx.userId)));
    return { success: true };
  }),

  // Get raw API key for direct browser calls to Anthropic (streaming)
  // Only the user's own key - never exposed to others
  getApiKey: authedProcedure.query(async ({ ctx }) => {
    const row = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "anthropic_api_key"), eq(appSettings.userId, ctx.userId)),
    });
    const decrypted = await decryptSetting(row?.value);
    return { key: decrypted || null };
  }),

  // Convenience: get API key (returns masked version for display)
  getApiKeyStatus: authedProcedure.query(async ({ ctx }) => {
    const row = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "anthropic_api_key"), eq(appSettings.userId, ctx.userId)),
    });
    if (!row?.value) return { isSet: false, masked: null };
    const key = await decryptSetting(row.value) || row.value;
    const masked = key.slice(0, 10) + "..." + key.slice(-4);
    return { isSet: true, masked };
  }),

  getClawHubStatus: authedProcedure.query(async ({ ctx }) => {
    const row = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "clawhub_token"), eq(appSettings.userId, ctx.userId)),
    });
    if (!row?.value) return { isSet: false, masked: null };
    const masked = row.value.slice(0, 6) + "..." + row.value.slice(-4);
    return { isSet: true, masked };
  }),

  // CLI connection status
  // Get current user's plan + limits (Clerk Billing source of truth)
  getMyPlan: authedProcedure.query(async ({ ctx }) => {
    const plan = ctx.isPro ? "pro" : "free";
    return {
      plan,
      limits: getPlanLimits(plan),
    };
  }),

  getAiUsage: authedProcedure.query(async ({ ctx }) => {
    const { getAiUsage, getLimits } = await import("@/lib/ai-usage");
    const usage = await getAiUsage(ctx.userId);
    const limits = getLimits(ctx.isPro);
    return { usage, limits, isPro: ctx.isPro };
  }),

  cliStatus: authedProcedure.query(async ({ ctx }) => {
    const heartbeat = await db.query.appSettings.findFirst({
      where: and(eq(appSettings.key, "cli_heartbeat"), eq(appSettings.userId, ctx.userId)),
    });

    if (!heartbeat?.value) return { online: false, lastSeen: null, platforms: [], hostname: null, skillCount: 0 };

    try {
      const data = JSON.parse(heartbeat.value);
      const lastSeen = new Date(data.lastSeen);
      const secondsAgo = (Date.now() - lastSeen.getTime()) / 1000;
      return {
        online: secondsAgo < 90,
        lastSeen: data.lastSeen,
        secondsAgo: Math.round(secondsAgo),
        platforms: data.platforms || [],
        hostname: data.hostname || null,
        skillCount: data.skillCount || 0,
      };
    } catch {
      return { online: false, lastSeen: null, platforms: [], hostname: null, skillCount: 0 };
    }
  }),
});
