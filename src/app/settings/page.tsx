"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
// Auth managed locally - no external provider
import { AiUsagePanel } from "@/components/ai-usage-badge";
import {
  Info,
  Brain,
  Download,
  Upload,
  AlertTriangle,
  Trash2,
  Key,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Copy,
  GitBranch,
  Sparkles,
  Shield,
  FileDown,
  UserX,
} from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AI_MODELS, DEFAULT_MODEL } from "@/lib/ai-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function GitHubStatusBadge() {
  const [status, setStatus] = useState<{ connected: boolean; username?: string; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/github/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, error: "Failed to check" }));
  }, []);

  if (!status) return <div className="h-6 w-32 animate-pulse rounded bg-muted" />;

  if (status.connected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        <ShieldCheck className="size-4 text-emerald-500" />
        <div>
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">GitHub connected</p>
          <p className="text-[11px] text-muted-foreground">@{status.username}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <ShieldAlert className="size-4 text-amber-500" />
      <div>
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">GitHub not connected</p>
        <p className="text-[11px] text-muted-foreground">{status.error || "Connect GitHub in your profile"}</p>
      </div>
    </div>
  );
}

function GitHubPatInput() {
  const [pat, setPat] = useState("");
  const [validating, setValidating] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{ valid: boolean; username?: string; scopes?: string } | null>(null);
  const setSetting = trpc.settings.set.useMutation({
    onError: (err) => toast.error(err.message),
  });
  const deleteSetting = trpc.settings.delete.useMutation({
    onSuccess: () => { setTokenStatus(null); toast.success("GitHub token removed"); },
  });
  const existing = trpc.settings.get.useQuery("github_pat");

  // Validate on load if token exists
  useEffect(() => {
    if (existing.data) validateToken(existing.data);
  }, [existing.data]);

  async function validateToken(token: string) {
    setValidating(true);
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (res.ok) {
        const user = await res.json();
        const scopes = res.headers.get("x-oauth-scopes") || "";
        setTokenStatus({ valid: true, username: user.login, scopes });
      } else {
        setTokenStatus({ valid: false });
      }
    } catch {
      setTokenStatus({ valid: false });
    }
    setValidating(false);
  }

  async function handleSave() {
    const token = pat.trim();
    if (!token) return;

    setValidating(true);
    // Validate before saving
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (!res.ok) {
        toast.error("Invalid token - GitHub rejected it");
        setValidating(false);
        return;
      }
      const user = await res.json();
      const scopes = res.headers.get("x-oauth-scopes") || "";
      if (!scopes.includes("repo")) {
        toast.error(`Token works (@${user.login}) but missing "repo" scope. Create a new token with repo access.`);
        setValidating(false);
        return;
      }
      // Save
      await setSetting.mutateAsync({ key: "github_pat", value: token });
      setTokenStatus({ valid: true, username: user.login, scopes });
      setPat("");
      toast.success(`GitHub token saved - connected as @${user.login}`);
    } catch {
      toast.error("Failed to validate token");
    }
    setValidating(false);
  }

  return (
    <div className="space-y-2">
      {/* Status badge */}
      {validating && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Validating...
        </div>
      )}
      {!validating && tokenStatus?.valid && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-500" />
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Token valid - @{tokenStatus.username}</p>
              <p className="text-[10px] text-muted-foreground">Scopes: {tokenStatus.scopes}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => deleteSetting.mutate("github_pat")}>
            Remove
          </Button>
        </div>
      )}
      {!validating && tokenStatus && !tokenStatus.valid && existing.data && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <ShieldAlert className="size-4 text-red-500" />
          <p className="text-xs text-red-600 dark:text-red-400">Saved token is invalid or expired</p>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={existing.data ? "Replace token..." : "ghp_xxxxxxxxxxxx or github_pat_xxxx"}
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          className="font-mono text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!pat.trim() || validating}
          onClick={handleSave}
        >
          {validating ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}

function MyDataSection() {
  const [exporting, setExporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const historyQuery = trpc.dataRequests.myRequests.useQuery();
  const exportMutation = trpc.dataRequests.exportMyData.useMutation();
  const deleteMutation = trpc.dataRequests.deleteMyAccount.useMutation();

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportMutation.mutateAsync();
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `praxl-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data was exported successfully");
      historyQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
    setExporting(false);
  }

  async function handleDelete() {
    if (deleteText !== "DELETE MY ACCOUNT") {
      toast.error('Type "DELETE MY ACCOUNT" to confirm');
      return;
    }
    setDeleting(true);
    try {
      const result = await deleteMutation.mutateAsync({ confirmation: "DELETE MY ACCOUNT" });
      toast.success(result.note);
      setTimeout(() => { window.location.href = "/sign-in"; }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  const labelForType: Record<string, string> = {
    access: "Data export",
    erasure: "Account deletion",
    rectification: "Correction request",
    restriction: "Restriction request",
    portability: "Portability request",
    objection: "Objection",
    consent_withdrawal: "Consent withdrawal",
    other: "Other",
  };

  return (
    <div className="space-y-5">
      {/* Export */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">Export my data</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Download everything we have about you as a JSON file - skills, projects, settings, chat history.
            Fulfills your right to data portability (GDPR Art. 20).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
          Export
        </Button>
      </div>

      <Separator />

      {/* Delete account */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Delete my account</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permanently removes all your skills, projects, settings, and chat history from our database.
              Cannot be undone. Fulfills your right to erasure (GDPR Art. 17).
            </p>
          </div>
          {!deleteConfirm && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(true)}>
              <UserX className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
        {deleteConfirm && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
            <p className="text-xs text-destructive">
              This cannot be undone. Type <code className="px-1 rounded bg-destructive/10 font-mono">DELETE MY ACCOUNT</code> to confirm.
            </p>
            <Input
              placeholder="DELETE MY ACCOUNT"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || deleteText !== "DELETE MY ACCOUNT"}
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Permanently delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setDeleteConfirm(false); setDeleteText(""); }}>
                Cancel
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              This removes your account and all data permanently - skills, projects, settings, chat history, and your login. You&apos;ll be signed out.
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* History */}
      <div>
        <p className="text-sm font-medium mb-2">Request history</p>
        {historyQuery.isLoading ? (
          <div className="h-8 w-full animate-pulse rounded bg-muted" />
        ) : historyQuery.data && historyQuery.data.length > 0 ? (
          <ul className="space-y-1.5">
            {historyQuery.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded border border-border/50 bg-muted/20 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{labelForType[r.type] || r.type}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(r.requestedAt).toLocaleDateString()}</span>
                </div>
                <span
                  className={
                    r.status === "completed" ? "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : r.status === "rejected" ? "text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive"
                    : r.status === "in_progress" ? "text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  }
                >
                  {r.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No data requests yet.</p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        For other requests (rectification, objection, restriction), email{" "}
        <a href="mailto:hello@praxl.app" className="text-primary underline">hello@praxl.app</a>. We respond within 30 days as required by GDPR.
      </p>
    </div>
  );
}

function BillingSection() {
  const planQuery = trpc.settings.getMyPlan.useQuery();
  const statsQuery = trpc.skills.stats.useQuery();
  const projectsQuery = trpc.projects.list.useQuery();
  const targetsQuery = trpc.sync.targets.useQuery();

  const plan = planQuery.data?.plan || "free";
  const limits = planQuery.data?.limits;
  const skillCount = statsQuery.data?.total || 0;
  const projectCount = projectsQuery.data?.length || 0;
  const targetCount = targetsQuery.data?.length || 0;

  const renderUsage = (label: string, used: number, limit: number | "unlimited" | undefined) => {
    if (limit === "unlimited" || typeof limit !== "number") {
      return (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium">{used} · unlimited</span>
        </div>
      );
    }
    const pct = Math.min((used / limit) * 100, 100);
    const atLimit = used >= limit;
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className={`font-medium ${atLimit ? "text-destructive" : ""}`}>{used} / {limit}</span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${atLimit ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Current plan</p>
          <p className="text-xs text-muted-foreground">
            {plan === "pro" ? "Pro - unlimited everything" : "Free - start small, upgrade anytime"}
          </p>
        </div>
        <Badge variant="outline" className={plan === "pro" ? "border-primary/50 text-primary" : ""}>
          {plan === "pro" ? "Pro" : "Free"}
        </Badge>
      </div>
      {limits && (
        <>
          <Separator />
          <div className="space-y-3">
            {renderUsage("Skills", skillCount, limits.maxSkills)}
            {renderUsage("Projects", projectCount, limits.maxProjects)}
            {renderUsage("Sync targets", targetCount, limits.maxSyncTargets)}
          </div>
        </>
      )}
      <Separator />
      <div className="rounded-lg border bg-muted/30 p-4">
        <AiUsagePanel />
      </div>
      <Separator />
      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-xs font-medium mb-1">Plan</p>
        <p className="text-xs text-muted-foreground">
          Open-source edition - all features unlocked.
        </p>
      </div>
    </div>
  );
}

function CliTokenSection() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleReveal() {
    setLoading(true);
    try {
      const res = await fetch("/api/cli/token");
      const data = await res.json();
      if (data.token) setToken(data.token);
    } catch (e) {
      toast.error("Failed to get CLI token");
    }
    setLoading(false);
  }

  if (!token) {
    return (
      <Button variant="outline" size="sm" onClick={handleReveal} disabled={loading}>
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Key className="size-3.5" />}
        Reveal CLI Token
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-xs select-all truncate">
        {token}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(token);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function CliCommandsSection() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cli/token", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.token) setToken(d.token); })
      .catch(() => {});
  }, []);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const connectCmd = token ? `praxl connect --token ${token}` : "praxl connect";

  const cmds = [
    { id: "install", label: "1. Install CLI", cmd: "npm install -g praxl-app" },
    { id: "connect", label: "2. Connect & sync", cmd: connectCmd },
    { id: "scan", label: "3. Scan local skills (optional)", cmd: "praxl scan" },
  ];

  return (
    <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-3">
      {cmds.map((c) => (
        <div key={c.id}>
          <p className="text-xs font-medium mb-1.5">{c.label}:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 block text-[11px] font-mono bg-black/80 text-emerald-400 rounded px-3 py-2 truncate">
              {c.cmd}
            </code>
            <button onClick={() => copy(c.cmd, c.id)} className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              {copied === c.id ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClawHubTokenInput() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const setKey = trpc.settings.set.useMutation({
    onSuccess: () => { setSaved(true); setToken(""); setTimeout(() => setSaved(false), 3000); },
  });
  const clawHubStatus = trpc.settings.getClawHubStatus.useQuery();

  return (
    <div className="space-y-3">
      {clawHubStatus.data?.isSet && (
        <div className="flex items-center gap-2 text-xs">
          <Check className="size-3.5 text-green-500" />
          <span className="text-muted-foreground">Token configured ({clawHubStatus.data.masked})</span>
        </div>
      )}
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="clh_..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="font-mono text-sm"
        />
        <Button
          onClick={() => setKey.mutate({ key: "clawhub_token", value: token })}
          disabled={!token.trim() || setKey.isPending}
          size="sm"
        >
          {setKey.isPending ? <Loader2 className="size-3 animate-spin" /> : saved ? <Check className="size-3" /> : null}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [ghRepo, setGhRepo] = useState("");
  const [ghBranch, setGhBranch] = useState("main");
  const [ghSyncing, setGhSyncing] = useState(false);

  const apiKeyStatus = trpc.settings.getApiKeyStatus.useQuery();
  const settingsPlanQuery = trpc.settings.getMyPlan.useQuery();
  const isProUser = settingsPlanQuery.data?.plan === "pro";
  const autoSuggestQuery = trpc.settings.get.useQuery("auto_suggest");
  const reviewOnSaveQuery = trpc.settings.get.useQuery("review_on_save");
  const ghRepoQuery = trpc.settings.get.useQuery("github_repo");

  // Pre-fill GitHub repo from saved settings
  useEffect(() => {
    if (ghRepoQuery.data) setGhRepo(ghRepoQuery.data);
  }, [ghRepoQuery.data]);

  async function handleGithubSync() {
    setGhSyncing(true);
    try {
      const res = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: ghRepo, branch: ghBranch }),
      });
      const data = await res.json();
      if (res.ok) toast.success(`Synced ${data.synced} skills to GitHub`);
      else toast.error(data.error);
    } catch {
      toast.error("GitHub sync failed");
    }
    setGhSyncing(false);
  }
  const setSetting = trpc.settings.set.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(
        variables.key === "auto_suggest"
          ? "Auto-suggest setting saved"
          : "Review on save setting saved"
      );
      if (variables.key === "auto_suggest") autoSuggestQuery.refetch();
      if (variables.key === "review_on_save") reviewOnSaveQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const setApiKey = trpc.settings.set.useMutation({
    onSuccess: () => {
      toast.success("API key saved successfully");
      setApiKeyInput("");
      apiKeyStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteApiKey = trpc.settings.delete.useMutation({
    onSuccess: () => {
      toast.success("API key removed");
      apiKeyStatus.refetch();
    },
  });
  const testKey = trpc.ai.testKey.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Key works! (${data.masked})`);
      } else {
        toast.error(`Key failed: ${data.error}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSaveApiKey() {
    const key = apiKeyInput.trim();
    if (!key) {
      toast.error("Please enter an API key");
      return;
    }
    if (!key.startsWith("sk-ant-")) {
      toast.error("Invalid key format. Anthropic API keys start with sk-ant-");
      return;
    }
    setApiKey.mutate({ key: "anthropic_api_key", value: key });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your Praxl preferences.
        </p>
      </div>

      {/* Billing */}
      <Card id="billing">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <CardTitle>Plan & Billing</CardTitle>
          </div>
          <CardDescription>
            Your subscription, usage, and limits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingSection />
        </CardContent>
      </Card>

      {/* API Key */}
      <Card className={apiKeyStatus.data?.isSet ? "border-green-500/20" : "border-amber-500/30"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="size-4 text-muted-foreground" />
              <CardTitle>Anthropic API Key</CardTitle>
            </div>
            {apiKeyStatus.data?.isSet ? (
              <Badge className="gap-1 bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
                <ShieldCheck className="size-3" />
                Connected
              </Badge>
            ) : (
              <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                <ShieldAlert className="size-3" />
                Not configured
              </Badge>
            )}
          </div>
          <CardDescription>
            Required for AI features: skill generation, review, improvement,
            live analysis, and feedback. Get your key from{" "}
            <span className="font-mono text-xs">console.anthropic.com</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiKeyStatus.data?.isSet && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Check className="size-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Key is set</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {apiKeyStatus.data.masked}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testKey.mutate()}
                disabled={testKey.isPending}
              >
                {testKey.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  "Test"
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteApiKey.mutate("anthropic_api_key")}
                disabled={deleteApiKey.isPending}
              >
                {deleteApiKey.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                Remove
              </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="api-key">
              {apiKeyStatus.data?.isSet ? "Replace API Key" : "Enter API Key"}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-ant-api03-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showKey ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <Button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim() || setApiKey.isPending}
              >
                {setApiKey.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Key className="size-4" />
                )}
                Save Key
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your key is stored locally in the database and never sent to
              third parties. It&apos;s only used to call the Anthropic API
              directly.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ClawHub Token */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-sm">🦞</span>
            <CardTitle>ClawHub Token</CardTitle>
          </div>
          <CardDescription>
            Connect your ClawHub account to publish skills to the OpenClaw registry.
            Get your token from <a href="https://clawhub.ai/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">clawhub.ai/settings/tokens</a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClawHubTokenInput />
        </CardContent>
      </Card>

      {/* CLI Token */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            <CardTitle>CLI Token</CardTitle>
          </div>
          <CardDescription>
            Use this token to import skills from your terminal via the Praxl CLI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CliTokenSection />
          <CliCommandsSection />
        </CardContent>
      </Card>

      {/* GitHub Sync */}
      <Card id="github" className={!isProUser ? "opacity-75" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GithubIcon className="size-4 text-muted-foreground" />
              <CardTitle>GitHub Sync</CardTitle>
              {!isProUser && <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">Pro</Badge>}
            </div>
          </div>
          <CardDescription>
            Push your entire skill library to a GitHub repository. Two-way sync - edit on GitHub, changes land in Praxl.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isProUser ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 text-center space-y-3">
              <div className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10">
                <GithubIcon className="size-5 text-primary" />
              </div>
              <p className="text-sm font-medium">GitHub Sync is a Pro feature</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Push your skills to a GitHub repo, version-controlled and shareable. Changes sync both ways.
              </p>
              <Link href="/settings#billing">
                <Button size="sm">
                  <Sparkles className="size-3.5" />
                  Upgrade to Pro - $5/month
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <GitHubStatusBadge />
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium">How to connect GitHub</p>
                <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal pl-4">
                  <li>Create a <a href="https://github.com/settings/tokens/new?scopes=repo&description=Praxl" target="_blank" className="text-primary underline">Personal Access Token</a> on GitHub with <code className="bg-muted px-1 rounded">repo</code> scope</li>
                  <li>Paste it in the &quot;Personal Access Token&quot; field below</li>
                  <li>Enter your repository name (e.g. <code className="bg-muted px-1 rounded">username/my-skills</code>)</li>
                  <li>Click &quot;Sync to GitHub&quot; - Praxl creates a commit with all your skills</li>
                </ol>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="gh-repo">Repository</Label>
                <Input
                  id="gh-repo"
                  placeholder="username/my-skills"
                  value={ghRepo}
                  onChange={(e) => setGhRepo(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gh-branch">
                  <GitBranch className="inline size-3.5 mr-1" />
                  Branch
                </Label>
                <Input
                  id="gh-branch"
                  placeholder="main"
                  value={ghBranch}
                  onChange={(e) => setGhBranch(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="gh-pat">Personal Access Token (recommended)</Label>
                <GitHubPatInput />
              </div>
              <Button
                onClick={handleGithubSync}
                disabled={!ghRepo.trim() || ghSyncing}
              >
                {ghSyncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <GithubIcon className="size-4" />
                )}
                Sync to GitHub
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* General */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="size-4 text-muted-foreground" />
            <CardTitle>General</CardTitle>
          </div>
          <CardDescription>
            Application information and general settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Praxl</p>
              <p className="text-xs text-muted-foreground">
                Manage, version, and deploy AI skills across all your tools
              </p>
            </div>
            <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
              v1.0.0
            </span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Environment</p>
              <p className="text-xs text-muted-foreground">
                Current runtime environment
              </p>
            </div>
            <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
              development
            </span>
          </div>
        </CardContent>
      </Card>

      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="size-4 text-muted-foreground" />
            <CardTitle>AI Configuration</CardTitle>
          </div>
          <CardDescription>
            Configure AI model preferences and behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label>Default Model</Label>
              <p className="text-xs text-muted-foreground">
                Default AI model for skill analysis
              </p>
            </div>
            <Select defaultValue={DEFAULT_MODEL}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div>
                      <span>{model.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {model.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label>Auto-suggest improvements</Label>
              <p className="text-xs text-muted-foreground">
                Automatically suggest skill improvements when editing
              </p>
            </div>
            <Switch
              checked={autoSuggestQuery.data !== "false"}
              onCheckedChange={(checked) =>
                setSetting.mutate({ key: "auto_suggest", value: String(checked) })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label>Review on save</Label>
              <p className="text-xs text-muted-foreground">
                Run AI review before saving skill changes
              </p>
            </div>
            <Switch
              checked={reviewOnSaveQuery.data === "true"}
              onCheckedChange={(checked) =>
                setSetting.mutate({ key: "review_on_save", value: String(checked) })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Import/Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="size-4 text-muted-foreground" />
            <CardTitle>Import / Export</CardTitle>
          </div>
          <CardDescription>
            Import skills from files or export your skill library.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => toast.info("Coming soon - Import from directory")}
          >
            <Upload className="size-4" />
            Import from Directory
          </Button>
          <Button
            variant="outline"
            onClick={() => toast.info("Coming soon - Export all skills")}
          >
            <Download className="size-4" />
            Export All Skills
          </Button>
        </CardContent>
      </Card>

      {/* My Data & Privacy */}
      <Card id="privacy">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            <CardTitle>My Data & Privacy</CardTitle>
          </div>
          <CardDescription>
            Export your data, delete your account, and review your privacy requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MyDataSection />
        </CardContent>
      </Card>

      {/* Account deletion is handled in "My Data & Privacy" section above */}
    </div>
  );
}
