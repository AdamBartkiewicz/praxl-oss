"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  SkipForward,
  Cloud,
  Monitor,
  Terminal,
  Globe,
  Cpu,
  Braces,
  Loader2,
  Power,
  Rocket,
  ClipboardCopy,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowDownToLine,
  Bot,
} from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PLATFORMS = [
  { value: "claude-code", label: "Claude Code", icon: Terminal },
  { value: "claude-web", label: "Claude Web", icon: Cloud },
  { value: "cursor", label: "Cursor", icon: Monitor },
  { value: "codex", label: "Codex", icon: Cpu },
  { value: "gemini-cli", label: "Gemini CLI", icon: Terminal },
  { value: "copilot", label: "Copilot", icon: Braces },
  { value: "windsurf", label: "Windsurf", icon: Globe },
  { value: "opencode", label: "OpenCode", icon: Terminal },
  { value: "openclaw", label: "OpenClaw", icon: Bot },
  { value: "custom", label: "Custom", icon: Braces },
] as const;

type SyncTarget = {
  id: string;
  platform: string;
  label: string;
  basePath: string;
  isActive: boolean;
  lastSyncedAt: Date | string | null;
  syncMode: string;
  userId: string;
  orgId: string | null;
  includeTags: string[] | null;
  excludeTags: string[] | null;
  includeProjects: string[] | null;
};

type SyncLog = {
  id: string;
  skillId: string;
  targetId: string;
  versionSynced: number;
  status: string;
  error: string | null;
  syncedAt: Date | string;
  skill: { name: string };
  target: { label: string; platform: string };
};

function getPlatformInfo(platform: string) {
  return PLATFORMS.find((p) => p.value === platform) ?? PLATFORMS[PLATFORMS.length - 1];
}

function formatRelativeTime(date: string | Date | null) {
  if (!date) return "Never";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

const PLATFORM_DEFAULTS: Record<string, { label: string; path: string }> = {
  "claude-code": { label: "Claude Code", path: "~/.claude/skills/" },
  "claude-web": { label: "Claude.ai", path: "" },
  "cursor": { label: "Cursor", path: "~/.cursor/skills/" },
  "codex": { label: "Codex", path: "~/.agents/skills/" },
  "gemini-cli": { label: "Gemini CLI", path: "~/.claude/skills/" },
  "copilot": { label: "Copilot", path: "~/.agents/skills/" },
  "windsurf": { label: "Windsurf", path: "~/.windsurf/skills/" },
  "opencode": { label: "OpenCode", path: "~/.opencode/skills/" },
  "openclaw": { label: "OpenClaw", path: "~/.openclaw/skills/" },
  "custom": { label: "", path: "" },
};

function AddTargetDialog({ trigger }: { trigger: React.ReactNode }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("claude-code");
  const [label, setLabel] = useState("Claude Code");
  const [basePath, setBasePath] = useState("~/.claude/skills/");
  const [syncMode, setSyncMode] = useState("manual");

  function handlePlatformChange(p: string) {
    setPlatform(p);
    const defaults = PLATFORM_DEFAULTS[p];
    if (defaults) {
      setLabel(defaults.label);
      setBasePath(defaults.path);
    }
  }

  const createTarget = trpc.sync.createTarget.useMutation({
    onSuccess: () => {
      utils.sync.targets.invalidate();
      toast.success("Sync target added");
      setOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setPlatform("claude-code");
    setLabel("Claude Code");
    setBasePath("~/.claude/skills/");
    setSyncMode("manual");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !basePath.trim()) return;
    createTarget.mutate({ platform, label, basePath, syncMode: syncMode as "auto" | "manual" });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Sync Target</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={(v) => v && handlePlatformChange(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-label">Label</Label>
            <Input
              id="target-label"
              placeholder="e.g. My Claude Code Config"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-path">Base Path</Label>
            <Input
              id="target-path"
              placeholder="e.g. ~/.claude/"
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Auto Sync</Label>
              <p className="text-xs text-muted-foreground">
                Automatically sync when skills change
              </p>
            </div>
            <Switch
              checked={syncMode === "auto"}
              onCheckedChange={(checked) =>
                setSyncMode(checked ? "auto" : "manual")
              }
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={createTarget.isPending}>
              Add Target
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TargetsTable() {
  const confirm = useConfirm();
  const { data: targets, isLoading } = trpc.sync.targets.useQuery();
  const utils = trpc.useUtils();

  const deleteTarget = trpc.sync.deleteTarget.useMutation({
    onSuccess: () => {
      utils.sync.targets.invalidate();
      toast.success("Target deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTarget = trpc.sync.updateTarget.useMutation({
    onSuccess: () => {
      utils.sync.targets.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const syncTarget = trpc.sync.syncTarget.useMutation({
    onSuccess: (data) => {
      utils.sync.targets.invalidate();
      utils.sync.logs.invalidate();
      toast.success(
        `Synced: ${data.synced} skills, ${data.skipped} skipped, ${data.failed} failed`
      );
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync Targets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!targets?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync Targets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <RefreshCw className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-medium">No sync targets</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a sync target to start syncing your skills to AI tools.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync Targets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto"><Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Synced</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((target: SyncTarget) => {
              const info = getPlatformInfo(target.platform);
              const PlatformIcon = info.icon;
              return (
                <TableRow key={target.id}>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1.5">
                      <PlatformIcon className="size-3" />
                      {info.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{target.label}</TableCell>
                  <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                    {target.basePath}
                  </TableCell>
                  <TableCell>
                    <Badge variant={target.syncMode === "auto" ? "default" : "secondary"}>
                      {target.syncMode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={target.isActive ? "default" : "secondary"}
                      className="gap-1"
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          target.isActive ? "bg-green-400" : "bg-gray-400"
                        }`}
                      />
                      {target.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatRelativeTime(target.lastSyncedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={target.isActive ? "Disable target" : "Enable target"}
                        onClick={() =>
                          updateTarget.mutate({
                            id: target.id,
                            isActive: !target.isActive,
                          })
                        }
                      >
                        <Power className={`size-3.5 ${target.isActive ? "text-emerald-500" : "text-muted-foreground"}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={async () => {
                          const ok = await confirm({ title: "Delete sync target", description: `Remove "${target.label}"? Skills will no longer sync to this platform.`, confirmLabel: "Delete", variant: "destructive" });
                          if (ok) deleteTarget.mutate(target.id);
                        }}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table></div>
      </CardContent>
    </Card>
  );
}

function SyncLogsTable() {
  const { data: logs, isLoading } = trpc.sync.logs.useQuery();

  function getStatusBadge(status: string) {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="size-3" />
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="size-3" />
            Failed
          </Badge>
        );
      case "skipped":
        return (
          <Badge variant="secondary" className="gap-1">
            <SkipForward className="size-3" />
            Skipped
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!logs?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync Logs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No sync activity yet. Sync logs will appear here after your first sync.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Sync Logs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto"><Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Skill</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log: SyncLog) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {formatRelativeTime(log.syncedAt)}
                </TableCell>
                <TableCell className="font-medium">
                  {log.skill?.name ?? "Unknown"}
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">
                    {log.target?.label ?? "Unknown"}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {log.versionSynced}
                </TableCell>
                <TableCell>{getStatusBadge(log.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div>
      </CardContent>
    </Card>
  );
}

function SyncAllButton() {
  const utils = trpc.useUtils();
  const syncAll = trpc.sync.syncAll.useMutation({
    onSuccess: (data) => {
      utils.sync.targets.invalidate();
      utils.sync.logs.invalidate();
      const summary = data.targets
        .map((t: { targetLabel: string; synced: number; failed: number; skipped: number }) =>
          `${t.targetLabel}: ${t.synced} synced, ${t.failed} failed`
        )
        .join("\n");
      toast.success("Sync complete", { description: summary });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Button
      variant="outline"
      onClick={() => syncAll.mutate()}
      disabled={syncAll.isPending}
    >
      {syncAll.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      Sync All
    </Button>
  );
}

function CliSetupCard() {
  const [copied, setCopied] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  React.useEffect(() => {
    fetch("/api/cli/token", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.token) setToken(d.token); })
      .catch(() => {});
  }, []);

  const connectCmd = token ? `praxl connect --token ${token}` : "praxl connect";

  const steps = [
    { cmd: "npm install -g praxl-app", desc: "Install the Praxl CLI globally (one time)." },
    { cmd: connectCmd, desc: "Connect, sync, and watch for changes (bidirectional)." },
    { cmd: "praxl scan", desc: "Scan local skills without connecting (optional)." },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Sync to your computer</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Use the Praxl CLI to keep local skill folders in sync. Works with Claude Code, Cursor, Codex, and more.
        </p>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <code className="text-xs font-mono font-medium">{step.cmd}</code>
                <p className="text-[11px] text-muted-foreground mt-0.5">{step.desc}</p>
              </div>
              <button
                onClick={() => copy(step.cmd, `step-${i}`)}
                className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {copied === `step-${i}` ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <ClipboardCopy className="size-3.5" />}
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <p className="text-[11px] text-muted-foreground">
            Multi-platform: <code className="bg-muted px-1 rounded">praxl sync --platforms claude-code,cursor,codex</code>
          </p>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Get your token: <Link href="/settings" className="text-primary underline">Settings → CLI Token</Link>
          </p>
          <Link href="https://github.com/AdamBartkiewicz/praxl-cli" target="_blank" className="text-xs text-muted-foreground hover:text-foreground underline">
            CLI Documentation ↗
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function GitHubSyncCard() {
  const ghRepo = trpc.settings.get.useQuery("github_repo");
  const ghAssignments = trpc.settings.get.useQuery("github_skill_slugs");
  const planQuery = trpc.settings.getMyPlan.useQuery();
  const isPro = planQuery.data?.plan === "pro";
  const { data: skills } = trpc.skills.list.useQuery();
  const [syncing, setSyncing] = useState(false);

  async function syncAssignedSkills() {
    if (!ghAssignments.data || !skills) return;
    let slugs: string[] = [];
    try {
      slugs = JSON.parse(ghAssignments.data);
    } catch {
      return;
    }
    if (!slugs.length) {
      toast.info("No skills assigned to GitHub.");
      return;
    }
    setSyncing(true);
    let successCount = 0;
    let failCount = 0;
    for (const slug of slugs) {
      const skill = skills.find((s: { slug: string; id: string }) => s.slug === slug);
      if (!skill) { failCount++; continue; }
      try {
        const res = await fetch("/api/github/push-skill", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillId: skill.id }),
        });
        if (res.ok) { successCount++; } else { failCount++; }
      } catch {
        failCount++;
      }
    }
    setSyncing(false);
    toast.success(`GitHub sync: ${successCount} pushed, ${failCount} failed`);
  }

  return (
    <Card className={!isPro ? "opacity-75" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GithubIcon className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">GitHub Sync</CardTitle>
          {!isPro && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wider border border-primary/30 ml-auto">Pro</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Push skills to a GitHub repository. Every push creates a commit with the skill version.
        </p>
        {!isPro && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs">GitHub sync is available on Pro.</p>
            <Link href="/settings#billing" className={buttonVariants({ size: "sm", className: "text-xs h-7" })}>
              Upgrade to Pro
            </Link>
          </div>
        )}
        {ghRepo.data ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Connected</p>
              <p className="text-[11px] font-mono text-muted-foreground">{ghRepo.data}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <XCircle className="size-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Not configured</p>
          </div>
        )}
        <div className={`flex items-center gap-2 ${!isPro ? "pointer-events-none opacity-50" : ""}`}>
          <Link href="/settings#github" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {ghRepo.data ? "Change repo" : "Set up GitHub sync"}
          </Link>
          {ghRepo.data && (
            <Button
              variant="outline"
              size="sm"
              onClick={syncAssignedSkills}
              disabled={syncing || !isPro}
            >
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Sync assigned skills
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          You can also push individual skills from the Deploy button in the editor.
        </p>
      </CardContent>
    </Card>
  );
}

function DeployOverviewCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Export & Deploy</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Download skills as ZIP files to manually install in any tool.
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-3 text-sm">
            <div className="mt-0.5 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
            <p className="text-xs text-muted-foreground">Open any skill → click <span className="font-medium text-foreground">Export ZIP</span> → get a ready-to-use skill folder</p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <div className="mt-0.5 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
            <p className="text-xs text-muted-foreground">Upload the ZIP to Claude.ai via Settings → Skills, or unzip into any tool&apos;s skills folder</p>
          </div>
        </div>
        <Link href="/skills" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Browse skills
        </Link>
      </CardContent>
    </Card>
  );
}

function ConnectionStatus() {
  const statusQuery = trpc.settings.cliStatus.useQuery(undefined, {
    refetchInterval: 10000, // Poll every 10s
  });
  const status = statusQuery.data;
  const [syncing, setSyncing] = React.useState(false);

  async function triggerSync() {
    setSyncing(true);
    try {
      await fetch("/api/cli/trigger-sync", { method: "POST", credentials: "include" });
      toast.success("Sync triggered! CLI will sync on next heartbeat.");
    } catch { toast.error("Failed to trigger sync"); }
    setTimeout(() => setSyncing(false), 3000);
  }

  if (!status) return null;

  if (status.online) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="size-3 rounded-full bg-emerald-500" />
                <div className="absolute inset-0 size-3 rounded-full bg-emerald-500 animate-ping opacity-30" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Computer connected</p>
                <p className="text-xs text-muted-foreground">
                  {status.platforms?.join(", ")} · {status.skillCount} skills · last seen {status.secondsAgo}s ago
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={triggerSync} disabled={syncing}>
                {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {syncing ? "Syncing..." : "Sync now"}
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={async () => {
                await fetch("/api/cli/disconnect", { method: "POST", credentials: "include" });
                toast.success("Disconnect signal sent. CLI will stop on next heartbeat.");
                statusQuery.refetch();
              }}>
                Disconnect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="size-3 rounded-full bg-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium">No computer connected</p>
            <p className="text-xs text-muted-foreground">
              Run <code className="bg-muted px-1 rounded">praxl connect</code> on your machine to connect.
              {status.lastSeen && ` Last seen: ${new Date(status.lastSeen).toLocaleString()}`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillDistribution() {
  const { data: skills, isLoading: skillsLoading } = trpc.skills.list.useQuery();
  const { data: targets, isLoading: targetsLoading } = trpc.sync.targets.useQuery();
  const { data: assignments, isLoading: assignmentsLoading } = trpc.sync.getAssignments.useQuery();
  const { data: localState, isLoading: localStateLoading } = trpc.sync.getLocalState.useQuery();
  const utils = trpc.useUtils();

  // GitHub column state
  const [ghSlugs, setGhSlugs] = useState<string[]>([]);
  const [ghRemoteSlugs, setGhRemoteSlugs] = useState<string[]>([]);
  const [ghConnected, setGhConnected] = useState(false);
  const ghRepo = trpc.settings.get.useQuery("github_repo");
  const ghAssignments = trpc.settings.get.useQuery("github_skill_slugs");
  const saveSetting = trpc.settings.set.useMutation({
    onSuccess: () => {
      ghAssignments.refetch();
    },
  });

  useEffect(() => {
    fetch("/api/github/check-skills", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setGhRemoteSlugs(data.slugs || []);
        setGhConnected(data.connected);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (ghAssignments.data) {
      try {
        setGhSlugs(JSON.parse(ghAssignments.data));
      } catch {
        setGhSlugs([]);
      }
    }
  }, [ghAssignments.data]);

  function toggleGithub(slug: string, currentlyAssigned: boolean) {
    const newSlugs = currentlyAssigned
      ? ghSlugs.filter((s) => s !== slug)
      : [...ghSlugs, slug];
    setGhSlugs(newSlugs);
    saveSetting.mutate({ key: "github_skill_slugs", value: JSON.stringify(newSlugs) });
  }

  const setSkillTargets = trpc.sync.setSkillTargets.useMutation({
    onSuccess: () => {
      utils.sync.getAssignments.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = skillsLoading || targetsLoading || assignmentsLoading || localStateLoading;

  // Build a set of "skillId:targetId" - only explicitly assigned
  const assignmentSet = useMemo(() => {
    const s = new Set<string>();
    if (!assignments) return s;
    for (const a of assignments) {
      s.add(`${a.skill.id}:${a.target.id}`);
    }
    return s;
  }, [assignments]);

  // Build a map of "skillId:targetId" → assignment for deployed version lookup
  const assignmentMap = useMemo(() => {
    const m = new Map<string, { deployedVersion?: number; deployedAt?: Date | string | null }>();
    if (!assignments) return m;
    for (const a of assignments) {
      m.set(`${a.skill.id}:${a.target.id}`, { deployedVersion: a.deployedVersion, deployedAt: a.deployedAt });
    }
    return m;
  }, [assignments]);

  // Build a set of "slug:platform" for local state lookup
  const localSet = useMemo(() => {
    const s = new Set<string>();
    if (localState) {
      for (const entry of localState) {
        s.add(`${entry.slug}:${entry.platform}`);
      }
    }
    return s;
  }, [localState]);

  const handleToggle = useCallback(
    (skillId: string, targetId: string, currentlyAssigned: boolean) => {
      if (!assignments) return;
      const currentTargetIds = assignments.filter((a) => a.skill.id === skillId).map((a) => a.target.id);

      const newTargetIds = currentlyAssigned
        ? currentTargetIds.filter((id) => id !== targetId)
        : [...currentTargetIds, targetId];

      setSkillTargets.mutate({ skillId, targetIds: newTargetIds });
    },
    [assignments, setSkillTargets]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!skills?.length || !targets?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Braces className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-medium">
            {!skills?.length ? "No skills yet" : "No platforms configured"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {!skills?.length
              ? "Create skills first, then assign them to platforms."
              : "Add a sync target above to start distributing skills."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skill Distribution</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Check the box to assign a skill to a sync target. Assigned skills are deployed to that tool&apos;s directory when you sync. Unchecked = not synced to that platform.
        </p>
        {assignments?.length === 0 && skills && skills.length > 0 && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
            <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>No skills assigned yet.</strong> Check the boxes below to choose which skills deploy to which platform. You can also click the column header to assign all skills to that target at once.
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="w-full overflow-x-auto"><Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Skill</TableHead>
                {targets.map((target: SyncTarget) => {
                  const info = getPlatformInfo(target.platform);
                  const PlatformIcon = info.icon;
                  return (
                    <TableHead key={target.id} className="text-center min-w-[80px]">
                      <div className="flex flex-col items-center gap-1">
                        <PlatformIcon className="size-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-normal leading-tight">
                          {target.label}
                        </span>
                      </div>
                    </TableHead>
                  );
                })}
                {ghRepo.data && (
                  <TableHead className="text-center min-w-[80px]">
                    <div className="flex flex-col items-center gap-1">
                      <GithubIcon className="size-3.5 text-muted-foreground" />
                      <span className="text-[11px] font-normal leading-tight">
                        GitHub
                      </span>
                    </div>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill: { id: string; slug: string; name: string; currentVersion?: number }) => {
                // Gather local status per platform for this skill
                const localPlatforms = targets
                  .filter((t: SyncTarget) => localSet.has(`${skill.slug}:${t.platform}`))
                  .map((t: SyncTarget) => t.platform);

                const assignedPlatforms = targets
                  .filter((t: SyncTarget) => assignmentSet.has(`${skill.id}:${t.id}`))
                  .map((t: SyncTarget) => t.platform);

                // Warning: assigned but not synced locally
                const hasWarning = assignedPlatforms.some(
                  (p) => !localPlatforms.includes(p)
                );

                return (
                  <TableRow key={skill.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/skills/${skill.slug}`}
                        className="text-sm hover:underline text-primary"
                      >
                        {skill.name}
                      </Link>
                    </TableCell>
                    {targets.map((target: SyncTarget) => {
                      const key = `${skill.id}:${target.id}`;
                      const isAssigned = assignmentSet.has(key);
                      const isSyncedLocally = localSet.has(`${skill.slug}:${target.platform}`);
                      const assignedButNotSynced = isAssigned && !isSyncedLocally;
                      const info = assignmentMap.get(key);
                      const deployedVersion = info?.deployedVersion;
                      const needsUpdate = isAssigned && deployedVersion != null && skill.currentVersion != null && deployedVersion < skill.currentVersion;

                      return (
                        <TableCell key={target.id} className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={() => handleToggle(skill.id, target.id, isAssigned)}
                              disabled={setSkillTargets.isPending}
                              className="size-4 rounded border-border accent-primary cursor-pointer"
                            />
                            {isAssigned && needsUpdate ? (
                              <span className="text-[10px] font-mono text-amber-500" title={`Deployed v${deployedVersion}, current v${skill.currentVersion}`}>
                                v{deployedVersion} → v{skill.currentVersion}
                              </span>
                            ) : isAssigned && deployedVersion != null ? (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                v{deployedVersion}
                              </span>
                            ) : null}
                            {assignedButNotSynced && !needsUpdate && (
                              <span title="Assigned but not synced locally">
                                <AlertTriangle className="size-3 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                    {ghRepo.data && (
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="checkbox"
                            checked={ghSlugs.includes(skill.slug)}
                            onChange={() => toggleGithub(skill.slug, ghSlugs.includes(skill.slug))}
                            disabled={saveSetting.isPending}
                            className="size-4 rounded border-border accent-primary cursor-pointer"
                          />
                          {ghRemoteSlugs.includes(skill.slug) ? (
                            <span className="size-2 rounded-full bg-emerald-500 inline-block" title="On GitHub" />
                          ) : ghSlugs.includes(skill.slug) ? (
                            <span title="Assigned but not on GitHub">
                              <AlertTriangle className="size-3 text-amber-500" />
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table></div>
        </div>
      </CardContent>
    </Card>
  );
}

const ReactDiffViewer = dynamic(
  () => import("react-diff-viewer-continued").then((m) => m.default),
  { ssr: false }
);

function ChangeRequests() {
  const utils = trpc.useUtils();
  const { data: changes, isLoading } = trpc.sync.pendingChanges.useQuery();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const acceptChange = trpc.sync.acceptChange.useMutation({
    onSuccess: () => {
      utils.sync.pendingChanges.invalidate();
      toast.success("Change accepted");
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectChange = trpc.sync.rejectChange.useMutation({
    onSuccess: () => {
      utils.sync.pendingChanges.invalidate();
      toast.success("Change rejected");
    },
    onError: (err) => toast.error(err.message),
  });

  const acceptAll = trpc.sync.acceptAllChanges.useMutation({
    onSuccess: () => {
      utils.sync.pendingChanges.invalidate();
      toast.success("All changes accepted");
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectAll = useMemo(() => {
    return changes?.map((c) => c.id) ?? [];
  }, [changes]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function humanizeSlug(slug: string) {
    return slug
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function handleDismissAll() {
    if (!changes) return;
    for (const change of changes) {
      rejectChange.mutate({ changeId: change.id });
    }
  }

  if (isLoading || !changes || changes.length === 0) return null;

  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <ArrowDownToLine className="size-4 text-amber-500" />
          <CardTitle className="text-base">
            {changes.length} incoming change{changes.length !== 1 ? "s" : ""} from your computer
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDismissAll}
            disabled={rejectChange.isPending}
          >
            Dismiss All
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={() => acceptAll.mutate()}
            disabled={acceptAll.isPending}
          >
            {acceptAll.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Accept All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {changes.map((change) => {
          const isExpanded = expanded.has(change.id);
          const platformInfo = getPlatformInfo(change.platform);
          return (
            <div
              key={change.id}
              className="rounded-lg border border-border/50 bg-card"
            >
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent/30 transition-colors"
                onClick={() => toggleExpand(change.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium flex-1 truncate">
                  {humanizeSlug(change.slug)}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  <platformInfo.icon className="size-3 mr-1" />
                  {platformInfo.label}
                </Badge>
                {change.skillId === null ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] shrink-0">
                    New skill
                  </Badge>
                ) : (
                  <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 text-[10px] shrink-0">
                    Updated
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeTime(change.createdAt)}
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-border/50 px-4 py-3 space-y-3">
                  <div className="overflow-auto rounded-md border border-border/50 max-h-80 text-xs">
                    {change.oldContent ? (
                      <ReactDiffViewer
                        oldValue={change.oldContent}
                        newValue={change.newContent}
                        splitView={false}
                        useDarkTheme
                        hideLineNumbers={false}
                      />
                    ) : (
                      <pre className="p-3 text-xs whitespace-pre-wrap bg-muted/30">
                        {change.newContent}
                      </pre>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rejectChange.mutate({ changeId: change.id })}
                      disabled={rejectChange.isPending}
                    >
                      <XCircle className="size-3.5" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptChange.mutate({ changeId: change.id })}
                      disabled={acceptChange.isPending}
                    >
                      {acceptChange.isPending && <Loader2 className="size-3.5 animate-spin" />}
                      <CheckCircle2 className="size-3.5" />
                      Accept
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function SyncPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sync & Deploy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Get your skills onto Claude Code, Cursor, Codex, and other tools.
        </p>
      </div>

      {/* Incoming change requests from local machine */}
      <ChangeRequests />

      {/* Connection status - most important */}
      <ConnectionStatus />

      {/* CLI setup instructions */}
      <CliSetupCard />

      {/* Local platforms config */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Local Platforms</CardTitle>
          </div>
          <AddTargetDialog
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="size-3.5" />
                Add Platform
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Choose which tool folders the CLI syncs your skills to.
          </p>
          <TargetsTable />
        </CardContent>
      </Card>

      {/* Skill distribution matrix */}
      <SkillDistribution />

      <div className="grid gap-6 md:grid-cols-2">
        <GitHubSyncCard />
        <DeployOverviewCard />
      </div>

      <Separator />

      <SyncLogsTable />
    </div>
  );
}
