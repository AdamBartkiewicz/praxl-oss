export type Plan = "free" | "pro";

export interface PlanLimits {
  maxSkills: number | "unlimited";
  maxProjects: number | "unlimited";
  maxSyncTargets: number | "unlimited";
  maxOrgMembers: number | "unlimited";
  versionHistoryDays: number | "unlimited";
  githubSync: boolean;
  teams: boolean;
  prioritySupport: boolean;
  bulkOperations: boolean;
  advancedAnalytics: boolean;
  earlyAccess: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxSkills: 10,
    maxProjects: 1,
    maxSyncTargets: 1,
    maxOrgMembers: 1,
    versionHistoryDays: 30,
    githubSync: false,
    teams: false,
    prioritySupport: false,
    bulkOperations: false,
    advancedAnalytics: false,
    earlyAccess: false,
  },
  pro: {
    maxSkills: "unlimited",
    maxProjects: "unlimited",
    maxSyncTargets: "unlimited",
    maxOrgMembers: 10,
    versionHistoryDays: "unlimited",
    githubSync: true,
    teams: true,
    prioritySupport: true,
    bulkOperations: true,
    advancedAnalytics: true,
    earlyAccess: true,
  },
};

export const PLAN_PRICING = {
  free: { monthly: 0, label: "Free", tagline: "Get started" },
  pro: { monthly: 5, label: "Pro", tagline: "AI included - for power users" },
};

// AI usage limits per plan per month
export const AI_LIMITS = {
  free: { review: 3, generate: 0, chat: 5 },
  pro: { review: 50, generate: 20, chat: 100 },
} as const;

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function canCreateMore(current: number, limit: number | "unlimited"): boolean {
  if (limit === "unlimited") return true;
  return current < limit;
}

// Server-side helper: open-source version always allows creation.
export async function assertCanCreate(
  _isPro: boolean,
  _fetchCountFn: () => Promise<number>,
  _limitKey: keyof PlanLimits,
  _resourceName: string,
): Promise<void> {
  // Open-source: no limits
  return;
}
