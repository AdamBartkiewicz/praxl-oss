"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  FileText,
  Activity,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Database,
  Package,
  GitPullRequest,
  Terminal,
  Shield,
  ChevronDown,
} from "lucide-react";

interface AdminData {
  stats: {
    users: number;
    skills: number;
    changeRequests: number;
    pendingChangeRequests: number;
    syncTargets: number;
    marketplaceIndexed: number;
  };
  users: {
    id: string;
    email: string;
    name: string | null;
    imageUrl: string | null;
    createdAt: string;
    skillCount: number;
    cli: { online: boolean; lastSeen: string; platforms: string[]; mode: string; skillCount: number } | null;
    plan: string;
    planSource: string;
  }[];
  recentChangeRequests: {
    id: string;
    userId: string;
    slug: string;
    source: string;
    platform: string;
    status: string;
    createdAt: string;
  }[];
  errors: {
    message: string;
    stack: string;
    url: string;
    userAgent: string;
    timestamp: string;
  }[];
  health: {
    database: string;
    timestamp: string;
  };
  seo: Record<string, string>;
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "errors" | "changes" | "dsr" | "seo" | "product">("overview");
  const [indexing, setIndexing] = useState(false);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin");
      if (res.status === 403) { setError("Access denied. Admin only."); return; }
      if (!res.ok) { setError("Failed to load admin data"); return; }
      setData(await res.json());
    } catch { setError("Network error"); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const indexMutation = trpc.ai.indexMarketplace.useMutation();

  async function triggerIndex() {
    setIndexing(true);
    try {
      const result = await indexMutation.mutateAsync();
      toast.success(`Indexed ${result.indexed} skills from ${result.creators.length} creators`);
      await fetchData();
    } catch (err) {
      toast.error(`Indexing failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setIndexing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Loading admin panel...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Shield className="size-10 text-destructive/30" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) return null;
  const { stats, users, recentChangeRequests, errors, health } = data;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">System overview and management</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={health.database === "ok" ? "outline" : "destructive"} className={health.database === "ok" ? "border-emerald-500/50 text-emerald-500" : ""}>
            <Database className="size-3 mr-1" />
            DB {health.database}
          </Badge>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="size-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={Users} label="Users" value={stats.users} />
        <StatCard icon={FileText} label="Skills" value={stats.skills} />
        <StatCard icon={GitPullRequest} label="Change Requests" value={stats.changeRequests} accent={stats.pendingChangeRequests > 0 ? `${stats.pendingChangeRequests} pending` : undefined} />
        <StatCard icon={Terminal} label="Sync Targets" value={stats.syncTargets} />
        <StatCard icon={Package} label="Marketplace" value={stats.marketplaceIndexed} />
        <StatCard icon={AlertTriangle} label="Errors" value={errors.length} accent={errors.length > 0 ? "recent" : undefined} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b pb-1">
        {(["overview", "users", "errors", "changes", "dsr", "seo", "product"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab ? "bg-card border border-b-0 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "users" ? `Users (${stats.users})` : tab === "errors" ? `Errors (${errors.length})` : tab === "changes" ? `Changes (${stats.changeRequests})` : tab === "dsr" ? "DSR" : tab === "seo" ? "SEO" : "Product"}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Recent users */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {users.slice(0, 5).map((u) => (
                <div key={u.id} className="flex items-center gap-3 text-sm">
                  {u.imageUrl ? (
                    <img src={u.imageUrl} alt="" className="size-6 rounded-full" />
                  ) : (
                    <div className="size-6 rounded-full bg-muted flex items-center justify-center text-xs">{(u.name || u.email)[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.name || u.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email} · {u.skillCount} skills</p>
                  </div>
                  {u.cli?.online && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-500">online</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* System actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" onClick={triggerIndex} disabled={indexing}>
                {indexing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Package className="size-4 mr-2" />}
                {indexing ? "Indexing marketplace..." : `Reindex Marketplace (${stats.marketplaceIndexed} indexed)`}
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setActiveTab("errors")}>
                <AlertTriangle className="size-4 mr-2" />
                View Error Log ({errors.length})
              </Button>
              <a href="/api/health" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full justify-start">
                  <Activity className="size-4 mr-2" /> Health Check Endpoint
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* Recent errors */}
          {errors.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Recent Errors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {errors.slice(0, 5).map((err, i) => (
                  <div key={i} className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-destructive">{err.message.slice(0, 100)}</p>
                      <span className="text-muted-foreground shrink-0">{new Date(err.timestamp).toLocaleString()}</span>
                    </div>
                    {err.url && <p className="text-muted-foreground truncate">{err.url}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Users Tab ────────────────────────────────────────────── */}
      {activeTab === "users" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Skills</th>
                    <th className="px-4 py-3 font-medium">CLI</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {u.imageUrl ? (
                            <img src={u.imageUrl} alt="" className="size-6 rounded-full" />
                          ) : (
                            <div className="size-6 rounded-full bg-muted flex items-center justify-center text-xs">{(u.name || u.email)[0]}</div>
                          )}
                          <span className="font-medium">{u.name || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.plan}
                          onChange={async (e) => {
                            const newPlan = e.target.value;
                            await fetch("/api/admin", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "setPlan", targetUserId: u.id, plan: newPlan, expiresAt: null }),
                            });
                            fetchData();
                          }}
                          className="text-xs rounded border bg-background px-1.5 py-0.5"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                        </select>
                        {u.plan === "pro" && u.planSource.includes("admin") && (
                          <span className="ml-1.5 text-[9px] text-muted-foreground">(admin)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{u.skillCount}</td>
                      <td className="px-4 py-3">
                        {u.cli ? (
                          <div className="flex items-center gap-1.5">
                            <div className={`size-2 rounded-full ${u.cli.online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                            <span className="text-xs text-muted-foreground">
                              {u.cli.online ? u.cli.platforms.join(", ") : "offline"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">never connected</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Errors Tab ───────────────────────────────────────────── */}
      {activeTab === "errors" && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {errors.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No errors recorded</p>
            ) : (
              errors.map((err, i) => (
                <ErrorRow key={i} error={err} />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Changes Tab ──────────────────────────────────────────── */}
      {activeTab === "changes" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Skill</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Platform</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentChangeRequests.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No change requests</td></tr>
                  ) : (
                    recentChangeRequests.map((cr) => (
                      <tr key={cr.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{cr.slug}</td>
                        <td className="px-4 py-3 text-muted-foreground">{cr.source}</td>
                        <td className="px-4 py-3"><Badge variant="secondary" className="text-[10px]">{cr.platform}</Badge></td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={cr.status === "accepted" ? "outline" : cr.status === "rejected" ? "destructive" : "secondary"}
                            className={`text-[10px] ${cr.status === "accepted" ? "border-emerald-500/50 text-emerald-500" : cr.status === "security_review" ? "border-red-500/50 text-red-500" : ""}`}
                          >
                            {cr.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(cr.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Data Subject Requests Tab ─────────────────────────────── */}
      {activeTab === "dsr" && <DSRTab />}

      {/* ─── SEO Tab ───────────────────────────────────────────── */}
      {activeTab === "seo" && data && <SEOTab initialData={data.seo} onSaved={fetchData} />}
      {activeTab === "product" && <ProductAnalyticsTab />}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function DSRTab() {
  const [statusFilter, setStatusFilter] = useState<"all" | "received" | "in_progress" | "completed" | "rejected">("all");
  const [showManualForm, setShowManualForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formType, setFormType] = useState("access");
  const [formNotes, setFormNotes] = useState("");
  const listQuery = trpc.dataRequests.adminList.useQuery({ status: statusFilter, limit: 100 });
  const updateMutation = trpc.dataRequests.adminUpdate.useMutation({
    onSuccess: () => { toast.success("Updated"); listQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const manualMutation = trpc.dataRequests.adminLogManual.useMutation({
    onSuccess: () => {
      toast.success("Request logged");
      setShowManualForm(false);
      setFormEmail(""); setFormType("access"); setFormNotes("");
      listQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusColors: Record<string, string> = {
    received: "bg-muted text-muted-foreground",
    in_progress: "bg-amber-500/15 text-amber-600",
    completed: "bg-emerald-500/15 text-emerald-600",
    rejected: "bg-destructive/15 text-destructive",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Data Subject Requests (GDPR)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Audit trail of access, erasure, and other data requests.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowManualForm(!showManualForm)}>
            {showManualForm ? "Cancel" : "+ Log email request"}
          </Button>
        </div>
        <div className="flex gap-1 mt-3">
          {(["all", "received", "in_progress", "completed", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2 py-1 text-[10px] rounded-full ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {showManualForm && (
          <div className="mx-4 mb-4 rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-medium">Log a request received via email</p>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="user@example.com"
                className="rounded border bg-background px-2 py-1.5 text-xs"
              />
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="rounded border bg-background px-2 py-1.5 text-xs"
              >
                <option value="access">Access</option>
                <option value="erasure">Erasure</option>
                <option value="rectification">Rectification</option>
                <option value="restriction">Restriction</option>
                <option value="portability">Portability</option>
                <option value="objection">Objection</option>
                <option value="consent_withdrawal">Consent withdrawal</option>
                <option value="other">Other</option>
              </select>
            </div>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Notes / context..."
              rows={2}
              className="w-full rounded border bg-background px-2 py-1.5 text-xs resize-none"
            />
            <Button
              size="sm"
              disabled={!formEmail || manualMutation.isPending}
              onClick={() => manualMutation.mutate({ email: formEmail, type: formType as "access", notes: formNotes || undefined })}
            >
              {manualMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
              Log request
            </Button>
          </div>
        )}
        {listQuery.isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-xs"><Loader2 className="size-4 animate-spin inline" /> Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Responded</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {!listQuery.data || listQuery.data.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">No requests</td></tr>
                ) : (
                  listQuery.data.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.requestedAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs">{r.email}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{r.type.replace("_", " ")}</Badge></td>
                      <td className="px-4 py-3 text-[10px] text-muted-foreground">{r.source}</td>
                      <td className="px-4 py-3">
                        <select
                          value={r.status}
                          onChange={(e) => updateMutation.mutate({ id: r.id, status: e.target.value as "received" })}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium border-0 ${statusColors[r.status] || statusColors.received}`}
                        >
                          <option value="received">received</option>
                          <option value="in_progress">in progress</option>
                          <option value="completed">completed</option>
                          <option value="rejected">rejected</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-muted-foreground">{r.respondedAt ? new Date(r.respondedAt).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        {r.notes && (
                          <span className="text-[10px] text-muted-foreground" title={r.notes}>
                            📝
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Product Analytics Tab ─────────────────────────────────────────────────

interface AnalyticsData {
  dau: number[]; dauLabels: string[];
  wau: number[]; wauLabels: string[];
  funnel: { signedUp: number; createdSkill: number; addedSyncTarget: number; firstSync: number };
  cohorts: { week: string; size: number; retention: number[] }[];
  segments: { free: { count: number; avgSkills: number; avgTargets: number }; pro: { count: number; avgSkills: number; avgTargets: number } };
  skillDistribution: { bucket: string; count: number }[];
  platforms: { platform: string; count: number }[];
  cliStats: { totalUsers: number; cliConnected7d: number; cliConnectedEver: number };
  ttfv: { median: number | null; p25: number | null; p75: number | null; sampleSize: number };
  featureAdoption: { feature: string; users: number; pct: number }[];
  signupsPerDay: { day: string; count: number }[];
  totalUsers: number; totalSkills: number; totalSyncs: number;
}

function ProductAnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.error || json?.message || `HTTP ${r.status}`);
        return json;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (error || !data) return (
    <div className="text-center py-16 space-y-2">
      <p className="text-sm text-destructive font-medium">Failed to load analytics</p>
      <p className="text-xs text-muted-foreground max-w-md mx-auto break-all">{error || "No data returned"}</p>
      <button onClick={() => { setLoading(true); setError(null); fetch("/api/admin/analytics").then(async r => { const j = await r.json().catch(() => null); if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`); return j; }).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); }} className="text-xs text-primary underline mt-2">Retry</button>
    </div>
  );

  const funnelSteps = [
    { label: "Signed up", value: data.funnel.signedUp },
    { label: "Created skill", value: data.funnel.createdSkill },
    { label: "Added sync target", value: data.funnel.addedSyncTarget },
    { label: "First sync", value: data.funnel.firstSync },
  ];
  const maxFunnel = Math.max(data.funnel.signedUp, 1);
  const maxDau = Math.max(...data.dau, 1);
  const maxSignup = Math.max(...data.signupsPerDay.map((d) => d.count), 1);
  const maxSkillDist = Math.max(...data.skillDistribution.map((d) => d.count), 1);
  const maxPlatform = Math.max(...data.platforms.map((p) => p.count), 1);

  return (
    <div className="space-y-6">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Users</p><p className="text-2xl font-bold">{data.totalUsers}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Skills</p><p className="text-2xl font-bold">{data.totalSkills}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Syncs</p><p className="text-2xl font-bold">{data.totalSyncs}</p></CardContent></Card>
      </div>

      {/* Row 1: DAU + Signups */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Daily Active Users - last 14 days</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-20">
              {data.dau.map((v, i) => (
                <div key={i} className="flex-1 group relative">
                  <div className="w-full rounded-sm bg-primary/40 hover:bg-primary transition-colors" style={{ height: `${Math.max((v / maxDau) * 100, v > 0 ? 12 : 0)}%`, minHeight: v > 0 ? "3px" : "1px", opacity: v > 0 ? 1 : 0.15 }} />
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-semibold opacity-0 group-hover:opacity-100">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{data.dauLabels[0]}</span><span>{data.dauLabels[data.dauLabels.length - 1]}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">New Signups / Day - last 30 days</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-[2px] h-20">
              {data.signupsPerDay.map((d) => (
                <div key={d.day} className="flex-1 group relative">
                  <div className="w-full rounded-sm bg-emerald-500/40 hover:bg-emerald-500 transition-colors" style={{ height: `${Math.max((d.count / maxSignup) * 100, d.count > 0 ? 12 : 0)}%`, minHeight: d.count > 0 ? "3px" : "1px", opacity: d.count > 0 ? 1 : 0.15 }} />
                  {d.count > 0 && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-semibold opacity-0 group-hover:opacity-100">{d.count}</span>}
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{data.signupsPerDay[0]?.day?.slice(5)}</span><span>today</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Activation Funnel + TTFV + CLI */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Activation Funnel - last 30 days</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {funnelSteps.map((step, i) => {
              const pct = maxFunnel > 0 ? (step.value / maxFunnel) * 100 : 0;
              const dropoff = i > 0 && funnelSteps[i-1].value > 0
                ? Math.round((1 - step.value / funnelSteps[i-1].value) * 100)
                : null;
              return (
                <div key={step.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{step.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">{step.value}</span>
                      {dropoff !== null && dropoff > 0 && (
                        <span className="text-[10px] text-destructive">-{dropoff}%</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Key Metrics</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Time to First Sync</p>
              <p className="text-lg font-bold">{data.ttfv.median !== null ? `${Math.round(data.ttfv.median)}min` : "-"}</p>
              <p className="text-[10px] text-muted-foreground">median ({data.ttfv.sampleSize} users)</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CLI Connected (7d)</p>
              <p className="text-lg font-bold">{data.cliStats.cliConnected7d} <span className="text-sm font-normal text-muted-foreground">/ {data.cliStats.totalUsers}</span></p>
              <p className="text-[10px] text-muted-foreground">{data.cliStats.totalUsers > 0 ? Math.round((data.cliStats.cliConnected7d / data.cliStats.totalUsers) * 100) : 0}% of users</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Free vs Pro + Skill Distribution + Platform Adoption */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Free vs Pro</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(["free", "pro"] as const).map((plan) => {
                const s = data.segments[plan];
                return (
                  <div key={plan} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium capitalize">{plan}</span>
                      <span className="font-semibold">{s.count} users</span>
                    </div>
                    <div className="flex gap-4 text-[10px] text-muted-foreground">
                      <span>avg {s.avgSkills.toFixed(1)} skills</span>
                      <span>avg {s.avgTargets.toFixed(1)} targets</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Skills per User</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.skillDistribution.map((d) => (
                <div key={d.bucket} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-muted-foreground text-right font-mono">{d.bucket}</span>
                  <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                    <div className="h-full rounded bg-primary/50" style={{ width: `${(d.count / maxSkillDist) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right font-medium">{d.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Platform Adoption</CardTitle></CardHeader>
          <CardContent>
            {data.platforms.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No targets yet</p>
            ) : (
              <div className="space-y-2">
                {data.platforms.map((p) => (
                  <div key={p.platform} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{p.platform}</span>
                      <span className="text-muted-foreground">{p.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(p.count / maxPlatform) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Cohort Retention */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly Cohort Retention</CardTitle></CardHeader>
        <CardContent>
          {data.cohorts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Not enough data yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1.5 pr-3 font-medium">Cohort</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Size</th>
                    {Array.from({ length: Math.max(...data.cohorts.map((c) => c.retention.length)) }).map((_, i) => (
                      <th key={i} className="text-center py-1.5 px-2 font-medium">W{i}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.week} className="border-t border-border/50">
                      <td className="py-1.5 pr-3 font-mono">{c.week}</td>
                      <td className="py-1.5 pr-3 text-right">{c.size}</td>
                      {c.retention.map((pct, i) => {
                        const bg = pct >= 50 ? "bg-emerald-500/20 text-emerald-600" :
                                   pct >= 20 ? "bg-amber-500/15 text-amber-600" :
                                   pct > 0 ? "bg-red-500/10 text-red-500" : "text-muted-foreground/30";
                        return (
                          <td key={i} className={`py-1.5 px-2 text-center font-medium rounded ${bg}`}>
                            {pct}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 5: Feature Adoption */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Feature Adoption</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {data.featureAdoption.map((f) => (
              <div key={f.feature} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-xs font-medium">{f.feature}</p>
                  <p className="text-[10px] text-muted-foreground">{f.users} users · {f.pct}%</p>
                </div>
                <div className="w-12 h-12 relative">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/50" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" strokeDasharray={`${f.pct * 0.88} 88`} strokeLinecap="round" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{f.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const SEO_FIELDS = [
  { key: "site_title", label: "Site Title", placeholder: "Praxl - AI Skill Manager for Developers", multiline: false },
  { key: "site_tagline", label: "Site Tagline", placeholder: "One source of truth for all your AI skills.", multiline: false },
  { key: "meta_description", label: "Meta Description", placeholder: "Manage, version, and deploy SKILL.md files across...", multiline: true },
  { key: "meta_keywords", label: "Keywords (comma-separated)", placeholder: "AI skills, SKILL.md, Claude Code, Cursor...", multiline: false },
  { key: "og_title", label: "OG Title (social sharing)", placeholder: "Praxl - AI Skill Manager", multiline: false },
  { key: "og_description", label: "OG Description", placeholder: "Manage AI skills across 8 tools. Edit once, synced everywhere.", multiline: true },
  { key: "og_image_url", label: "OG Image URL (1200×630 recommended)", placeholder: "https://praxl.app/og-image.png", multiline: false },
  { key: "twitter_title", label: "Twitter Title", placeholder: "Praxl - AI Skill Manager", multiline: false },
  { key: "twitter_description", label: "Twitter Description", placeholder: "Stop copy-pasting skills across 5 AI tools.", multiline: false },
];

function SEOTab({ initialData, onSaved }: { initialData: Record<string, string>; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(initialData);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setSeo", settings: values }),
      });
      if (res.ok) {
        toast.success("SEO settings saved");
        setDirty(false);
        onSaved();
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Network error");
    }
    setSaving(false);
  };

  const previewOgImage = values.og_image_url?.trim();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">SEO & Social Settings</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Control how Praxl appears in search results and social media previews. Changes go live on the landing page within ~1 hour (ISR cache).
            </p>
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
            {saving ? "Saving..." : "Save all"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {SEO_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <label className="text-xs font-medium">{field.label}</label>
            {field.multiline ? (
              <textarea
                value={values[field.key] || ""}
                onChange={(e) => update(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full rounded border bg-background px-3 py-2 text-sm resize-none"
              />
            ) : (
              <input
                type="text"
                value={values[field.key] || ""}
                onChange={(e) => update(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded border bg-background px-3 py-2 text-sm"
              />
            )}
            {field.key === "meta_description" && (
              <p className="text-[10px] text-muted-foreground">
                {(values[field.key] || "").length}/160 chars (recommended max)
              </p>
            )}
          </div>
        ))}

        {/* OG Image preview */}
        {previewOgImage && (
          <div className="space-y-2">
            <p className="text-xs font-medium">OG Image Preview</p>
            <div className="rounded-lg border overflow-hidden" style={{ maxWidth: "400px", aspectRatio: "1200/630" }}>
              <img
                src={previewOgImage}
                alt="OG preview"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          </div>
        )}

        {/* Social preview */}
        <div className="space-y-2">
          <p className="text-xs font-medium">Social Share Preview</p>
          <div className="rounded-lg border bg-muted/20 p-4 max-w-md">
            <p className="text-sm font-semibold truncate">{values.og_title || values.site_title || "Praxl - AI Skill Manager"}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{values.og_description || values.meta_description || "Manage, version, and deploy AI skills across all your tools."}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">praxl.app</p>
          </div>
        </div>

        {/* API endpoint info */}
        <div className="rounded-lg bg-muted/30 border p-3">
          <p className="text-xs font-medium mb-1">Public API</p>
          <p className="text-[10px] text-muted-foreground">
            These settings are served at <code className="font-mono bg-muted px-1 rounded">your-instance/api/public/seo</code> and
            consumed by the landing page via ISR. Changes propagate within ~1 hour of saving.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        {accent && <p className="text-[10px] text-amber-500">{accent}</p>}
      </CardContent>
    </Card>
  );
}

function ErrorRow({ error }: { error: { message: string; stack: string; url: string; userAgent: string; timestamp: string } }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/5 text-xs">
      <button onClick={() => setExpanded(!expanded)} className="w-full px-3 py-2 flex items-start gap-2 text-left">
        <AlertTriangle className="size-3 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-destructive">{error.message.slice(0, 120)}</p>
          <p className="text-muted-foreground">{new Date(error.timestamp).toLocaleString()}{error.url ? ` - ${error.url}` : ""}</p>
        </div>
        <ChevronDown className={`size-3 text-muted-foreground transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && error.stack && (
        <pre className="px-3 pb-2 text-[10px] text-muted-foreground whitespace-pre-wrap font-mono max-h-40 overflow-auto">{error.stack}</pre>
      )}
    </div>
  );
}
