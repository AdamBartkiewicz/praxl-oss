import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type AiFeature = "review" | "generate" | "chat";

const LIMITS = {
  free: { review: 3, generate: 0, chat: 5 },
  pro: { review: 50, generate: 20, chat: 100 },
} as const;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "2026-04"
}

export async function getAiUsage(userId: string) {
  const month = currentMonth();
  const row = await db.query.aiUsage.findFirst({
    where: and(eq(aiUsage.userId, userId), eq(aiUsage.month, month)),
  });
  return {
    reviewCount: row?.reviewCount || 0,
    generateCount: row?.generateCount || 0,
    chatCount: row?.chatCount || 0,
    month,
  };
}

export function getLimits(isPro: boolean) {
  return isPro ? LIMITS.pro : LIMITS.free;
}

export async function canUseAi(userId: string, isPro: boolean, feature: AiFeature): Promise<{ allowed: boolean; used: number; limit: number }> {
  const usage = await getAiUsage(userId);
  const limits = getLimits(isPro);
  const countKey = `${feature}Count` as const;
  const used = usage[countKey];
  const limit = limits[feature];
  return { allowed: used < limit, used, limit };
}

export async function incrementAiUsage(userId: string, feature: AiFeature): Promise<void> {
  const month = currentMonth();
  const existing = await db.query.aiUsage.findFirst({
    where: and(eq(aiUsage.userId, userId), eq(aiUsage.month, month)),
  });
  const countKey = feature === "review" ? "reviewCount" : feature === "generate" ? "generateCount" : "chatCount";
  if (existing) {
    await db.update(aiUsage).set({ [countKey]: (existing[countKey] || 0) + 1 }).where(eq(aiUsage.id, existing.id));
  } else {
    await db.insert(aiUsage).values({ userId, month, [countKey]: 1 });
  }
}

// Auto-migrate at import time
async function ensureTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        month varchar(7) NOT NULL,
        review_count integer NOT NULL DEFAULT 0,
        generate_count integer NOT NULL DEFAULT 0,
        chat_count integer NOT NULL DEFAULT 0,
        UNIQUE(user_id, month)
      )
    `);
  } catch {}
}
ensureTable();
