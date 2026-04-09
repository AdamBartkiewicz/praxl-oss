"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Sparkles } from "lucide-react";

/**
 * Shows a banner when the user has hit their Free plan skill limit.
 * Renders nothing if under limit or on Pro.
 */
export function SkillLimitBanner() {
  const planQuery = trpc.settings.getMyPlan.useQuery();
  const statsQuery = trpc.skills.stats.useQuery({ countAll: true });

  const plan = planQuery.data?.plan;
  const limits = planQuery.data?.limits;
  const total = statsQuery.data?.total ?? 0;

  if (!limits || plan === "pro") return null;

  const maxSkills = limits.maxSkills;
  if (maxSkills === "unlimited" || typeof maxSkills !== "number") return null;
  if (total < maxSkills) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
      <AlertTriangle className="size-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Skill limit reached ({total}/{maxSkills})</p>
        <p className="text-xs text-muted-foreground">
          Upgrade to Pro for unlimited skills, sync targets, teams, and more.
        </p>
      </div>
      <Link
        href="/settings#billing"
        className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1"
      >
        <Sparkles className="size-3" />
        Upgrade
      </Link>
    </div>
  );
}

/**
 * Returns true if the user is at or over their skill limit.
 * Use in components that need to disable create buttons.
 */
export function useSkillLimitReached(): boolean {
  const planQuery = trpc.settings.getMyPlan.useQuery();
  const statsQuery = trpc.skills.stats.useQuery({ countAll: true });

  const plan = planQuery.data?.plan;
  const limits = planQuery.data?.limits;
  const total = statsQuery.data?.total ?? 0;

  if (!limits || plan === "pro") return false;
  const maxSkills = limits.maxSkills;
  if (maxSkills === "unlimited" || typeof maxSkills !== "number") return false;
  return total >= maxSkills;
}
