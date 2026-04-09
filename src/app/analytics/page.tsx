"use client";

import React, { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { BarChart3, BookOpen, History, RefreshCw, Target, Sparkles, Lock, TrendingUp, Activity, Loader2, Eye, Terminal } from "lucide-react";
import { toast } from "sonner";

export default function AnalyticsPage() {
  const [chartRange, setChartRange] = useState<7 | 14 | 30>(14);
  const planQuery = trpc.settings.getMyPlan.useQuery();
  const isPro = planQuery.data?.plan === "pro";
  const dashboardQuery = trpc.analytics.dashboard.useQuery(undefined, {
    enabled: isPro,
    retry: false,
  });

  // Free users: upsell page
  if (planQuery.data && !isPro) {
    return (
      <div className="mx-auto max-w-4xl p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <Badge variant="outline" className="ml-2 border-primary/50 text-primary text-[10px]">Pro</Badge>
        </div>
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-8 text-center space-y-4">
            <div className="inline-flex size-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="size-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Analytics is a Pro feature</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Track skill growth, sync activity by platform, version history trends, and your most-edited skills.
              Understand which skills earn their keep.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-lg mx-auto pt-4">
              {[
                { icon: BookOpen, label: "Skill growth" },
                { icon: RefreshCw, label: "Sync activity" },
                { icon: History, label: "Version trends" },
                { icon: TrendingUp, label: "Top skills" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 rounded-lg border border-border/50 p-3">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <Link href="/settings#billing">
              <Button className="mt-2">
                <Sparkles className="size-3.5" />
                Upgrade to Pro - $5/month
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!planQuery.data || dashboardQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (dashboardQuery.error) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Failed to load analytics</p>
          <p className="text-xs text-muted-foreground mt-1">{dashboardQuery.error.message}</p>
          <button onClick={() => dashboardQuery.refetch()} className="text-xs text-primary underline mt-2">
            Try again
          </button>
        </div>
      </div>
    );
  }

  const data = dashboardQuery.data;
  if (!data) return null;

  const maxPlatformCount = Math.max(...data.syncsByPlatform.map((p) => p.count), 1);

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-8">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <Badge variant="outline" className="ml-2 border-primary/50 text-primary text-[10px]">Pro</Badge>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={BookOpen} label="Skills" value={data.totals.skills} />
        <StatCard icon={History} label="Versions" value={data.totals.versions} />
        <StatCard icon={RefreshCw} label="Syncs (90d)" value={data.totals.syncs} />
        <StatCard icon={Target} label="Sync targets" value={data.totals.targets} />
      </div>

      {/* Skills created over time */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Skill activity - last {chartRange} days</CardTitle>
          <RangeSelector value={chartRange} onChange={setChartRange} />
        </CardHeader>
        <CardContent>
          {data.totals.skills === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No skills yet.</p>
          ) : <BarChart data={data.skillsCreatedByDay} range={chartRange} />}
        </CardContent>
      </Card>

      {/* Sync activity by platform */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sync activity by platform - last 90 days</CardTitle>
          </CardHeader>
          <CardContent>
            {data.syncsByPlatform.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No syncs yet.</p>
            ) : (
              <div className="space-y-2">
                {data.syncsByPlatform.map((p) => (
                  <div key={p.platform} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{p.platform}</span>
                      <span className="text-muted-foreground">{p.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(p.count / maxPlatformCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top edited skills */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Top edited skills</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topEditedSkills.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">No edits yet.</p>
            ) : (
              <ol className="space-y-1.5">
                {data.topEditedSkills.map((s, i) => (
                  <li key={s.slug} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-4 text-muted-foreground">{i + 1}.</span>
                      <Link href={`/skills/${s.slug}`} className="truncate hover:underline">
                        {s.name || s.slug}
                      </Link>
                    </span>
                    <span className="text-muted-foreground shrink-0">{s.versions} versions</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      {/* ─── Usage Tracking ────────────────────────────────────── */}
      <UsageTrackingSection usage={data.usage} chartRange={chartRange} onRangeChange={setChartRange} />
      <OrgAnalyticsSection />
      </div>
    </div>
  );
}

function UsageTrackingSection({ usage, chartRange, onRangeChange }: {
  usage: { enabled: boolean; bySkill: { slug: string; count: number }[]; byPlatform: { platform: string; count: number }[]; byDay: { day: string; count: number }[]; totalUses: number };
  chartRange: 7 | 14 | 30;
  onRangeChange: (v: 7 | 14 | 30) => void;
}) {
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const toggleMutation = trpc.analytics.toggleUsageTracking.useMutation({
    onSuccess: (data) => {
      toast.success(data.enabled ? "Usage tracking enabled" : "Usage tracking disabled");
      utils.analytics.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const clearMutation = trpc.analytics.clearUsageData.useMutation({
    onSuccess: () => {
      toast.success("Usage data cleared");
      utils.analytics.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const maxPlatUse = Math.max(...(usage.byPlatform || []).map((p) => p.count), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Claude Code Usage</CardTitle>
            <Badge variant="outline" className="text-[9px]">Beta</Badge>
          </div>
          <div className="flex items-center gap-2">
            {usage.enabled && usage.totalUses > 0 && (
              <button
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                onClick={async () => { const ok = await confirm({ title: "Clear usage data", description: "Clear all usage data? This cannot be undone.", confirmLabel: "Clear", variant: "destructive" }); if (ok) clearMutation.mutate(); }}
                disabled={clearMutation.isPending}
              >
                {clearMutation.isPending ? "Clearing..." : "Clear data"}
              </button>
            )}
            <span className="text-xs text-muted-foreground">{usage.enabled ? "On" : "Off"}</span>
            <Switch
              checked={usage.enabled}
              onCheckedChange={(checked) => toggleMutation.mutate({ enabled: checked })}
              disabled={toggleMutation.isPending}
            />
          </div>
        </div>
        <CardDescription>
          {usage.enabled
            ? "Tracks which skills Claude Code loads in your sessions. Detected from session logs."
            : "See which skills Claude Code actually uses. Requires CLI connected."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!usage.enabled ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-4">
            <div className="inline-flex size-12 items-center justify-center rounded-full bg-muted">
              <Eye className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">How it works</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                When your CLI is running (<code className="bg-muted px-1 rounded font-mono text-[11px]">praxl connect</code>),
                it reads Claude Code session logs to detect which skills are loaded in each session.
                See which skills are actually being used and which are collecting dust.
              </p>
            </div>
            <div className="flex items-center justify-center gap-6 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Terminal className="size-3" /> Requires CLI running</span>
              <span className="flex items-center gap-1.5"><Eye className="size-3" /> Passive - no performance impact</span>
              <span className="flex items-center gap-1.5"><Lock className="size-3" /> Data stays in your account</span>
            </div>
            <Button
              size="sm"
              onClick={() => toggleMutation.mutate({ enabled: true })}
              disabled={toggleMutation.isPending}
            >
              {toggleMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Activity className="size-3.5" />}
              Enable usage tracking
            </Button>
          </div>
        ) : usage.totalUses === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2">
            <Activity className="size-5 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No usage data yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Make sure your CLI is running (<code className="bg-muted px-1 rounded font-mono text-[11px]">praxl connect</code>).
              Usage events will appear here the next time Claude Code loads one of your skills in a session.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Usage over time */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium">Skill loads in Claude Code - last {chartRange} days ({usage.totalUses} total)</p>
                <RangeSelector value={chartRange} onChange={onRangeChange} />
              </div>
              <BarChart data={usage.byDay} range={chartRange} accentColor="#10b981" />
            </div>

            <Separator />

            <div className="grid gap-6 md:grid-cols-2">
              {/* Most used skills */}
              <div>
                <p className="text-xs font-medium mb-2">Most loaded skills</p>
                {usage.bySkill.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No data yet.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {usage.bySkill.map((s, i) => (
                      <li key={s.slug} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-4 text-muted-foreground">{i + 1}.</span>
                          <Link href={`/skills/${s.slug}`} className="truncate hover:underline">{s.slug}</Link>
                        </span>
                        <span className="text-muted-foreground shrink-0">{s.count} loads</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Usage by platform */}
              <div>
                <p className="text-xs font-medium mb-2">Loads by source</p>
                {usage.byPlatform.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {usage.byPlatform.map((p) => (
                      <div key={p.platform} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{p.platform}</span>
                          <span className="text-muted-foreground">{p.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(p.count / maxPlatUse) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OrgAnalyticsSection() {
  const orgsQuery = trpc.org.list.useQuery();
  const orgs = orgsQuery.data || [];
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(orgs[0]?.id || null);

  // Auto-select first org
  React.useEffect(() => {
    if (orgs.length > 0 && !selectedOrgId) setSelectedOrgId(orgs[0].id);
  }, [orgs]);

  const orgQuery = trpc.analytics.orgDashboard.useQuery(
    { orgId: selectedOrgId! },
    { enabled: !!selectedOrgId }
  );

  if (orgs.length === 0) return null; // No orgs - don't show section

  const data = orgQuery.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Team Analytics</CardTitle>
          {orgs.length > 1 && (
            <select
              value={selectedOrgId || ""}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="text-xs rounded border bg-background px-2 py-1"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {orgQuery.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : !data ? (
          <p className="text-xs text-muted-foreground text-center py-8">No data</p>
        ) : (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-[10px] text-muted-foreground">Skills</p>
                <p className="text-xl font-bold">{data.totals.skills}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[10px] text-muted-foreground">Versions</p>
                <p className="text-xl font-bold">{data.totals.versions}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[10px] text-muted-foreground">Members</p>
                <p className="text-xl font-bold">{data.totals.members}</p>
              </div>
            </div>

            {/* Skills by member */}
            <div>
              <p className="text-xs font-medium mb-2">Skills by member</p>
              <div className="space-y-1.5">
                {data.skillsByMember.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{m.name}</span>
                      <span className="text-[9px] text-muted-foreground px-1 py-0.5 rounded bg-muted">{m.role}</span>
                    </div>
                    <span className="text-muted-foreground">{m.skillCount} skills</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top skills */}
            {data.topSkills.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2">Most edited team skills</p>
                <ol className="space-y-1">
                  {data.topSkills.map((s, i) => (
                    <li key={s.slug} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground w-4">{i + 1}.</span>
                        <Link href={`/skills/${s.slug}`} className="hover:underline truncate">{s.name}</Link>
                      </span>
                      <span className="text-muted-foreground">{s.versions} versions</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RangeSelector({ value, onChange }: { value: 7 | 14 | 30; onChange: (v: 7 | 14 | 30) => void }) {
  return (
    <div className="flex items-center gap-1">
      {([7, 14, 30] as const).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            value === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function BarChart({ data, range, accentColor = "#c96442" }: {
  data: { day: string; count: number }[];
  range: number;
  accentColor?: string;
}) {
  const sliced = data.slice(-range);
  const maxVal = Math.max(...sliced.map((d) => d.count), 1);
  const BAR_MAX_H = 96; // px - max bar height
  return (
    <>
      <div className="flex items-end gap-1" style={{ height: `${BAR_MAX_H}px` }}>
        {sliced.map((d) => {
          const hasData = d.count > 0;
          const barH = hasData ? Math.max(Math.round((d.count / maxVal) * BAR_MAX_H), 8) : 2;
          return (
            <div key={d.day} className="flex-1 group relative flex items-end">
              <div
                className="w-full rounded-sm transition-all group-hover:brightness-125"
                style={{
                  background: hasData ? accentColor : "var(--border)",
                  height: `${barH}px`,
                }}
              />
              {hasData && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {d.count}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{new Date(Date.now() - (range - 1) * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>today</span>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof BookOpen; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="size-3.5" />
          <span className="text-[11px]">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
