"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Sparkles, Zap } from "lucide-react";

/**
 * Compact badge showing AI usage for current month.
 * Shows nothing if user has BYO key (unlimited).
 */
export function AiUsageBadge({ feature }: { feature: "review" | "generate" | "chat" }) {
  const apiKeyStatus = trpc.settings.getApiKeyStatus.useQuery();
  const aiUsage = trpc.settings.getAiUsage.useQuery();

  // Don't show if user has their own key (unlimited)
  if (apiKeyStatus.data?.isSet) return null;
  if (!aiUsage.data) return null;

  const { usage, limits, isPro } = aiUsage.data;
  const countKey = `${feature}Count` as keyof typeof usage;
  const used = Number((usage as unknown as Record<string, number>)[countKey] || 0);
  const limit = Number((limits as unknown as Record<string, number>)[feature] || 0);
  const atLimit = used >= limit;
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 100;

  return (
    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: atLimit ? "var(--destructive, #e85d5d)" : "var(--muted-foreground)" }}>
      <Sparkles className="size-2.5" />
      <span className="tabular-nums">{used}/{limit}</span>
      {atLimit && !isPro && (
        <Link href="/settings#billing" className="font-medium underline underline-offset-2 hover:opacity-80" style={{ color: "var(--primary)" }}>
          Upgrade
        </Link>
      )}
      {atLimit && isPro && (
        <span className="text-[9px]">Add API key for unlimited</span>
      )}
    </div>
  );
}

/**
 * Full usage panel showing all 3 features.
 * For settings page or dashboard.
 */
export function AiUsagePanel() {
  const apiKeyStatus = trpc.settings.getApiKeyStatus.useQuery();
  const aiUsage = trpc.settings.getAiUsage.useQuery();

  if (!aiUsage.data) return null;

  const hasByoKey = apiKeyStatus.data?.isSet;
  const { usage, limits, isPro } = aiUsage.data;

  const features: { key: string; label: string; used: number; limit: number }[] = [
    { key: "review", label: "AI Reviews", used: usage.reviewCount || 0, limit: (limits as unknown as Record<string, number>).review || 0 },
    { key: "generate", label: "AI Generations", used: usage.generateCount || 0, limit: (limits as unknown as Record<string, number>).generate || 0 },
    { key: "chat", label: "AI Chat Messages", used: usage.chatCount || 0, limit: (limits as unknown as Record<string, number>).chat || 0 },
  ];

  if (hasByoKey) {
    return (
      <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap className="size-3.5 text-emerald-500" />
          <div>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Unlimited AI</p>
            <p className="text-[10px] text-muted-foreground">Using your own API key - no limits applied</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">AI Usage This Month</p>
        <span className="text-[10px] text-muted-foreground">{isPro ? "Pro" : "Free"} tier</span>
      </div>
      {features.map((f) => {
        const pct = f.limit > 0 ? Math.min((f.used / f.limit) * 100, 100) : 100;
        const atLimit = f.used >= f.limit;
        return (
          <div key={f.key} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{f.label}</span>
              <span className={atLimit ? "text-destructive font-medium" : ""}>{f.used} / {f.limit}</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${atLimit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      {!isPro && (
        <Link href="/settings#billing" className="block text-center text-[10px] text-primary font-medium hover:underline mt-1">
          Upgrade to Pro for 50 reviews + 20 generations + 100 chat/month
        </Link>
      )}
    </div>
  );
}
