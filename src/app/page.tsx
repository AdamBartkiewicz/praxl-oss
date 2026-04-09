"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Layers,
  Zap,
  FolderKanban,
  RefreshCw,
  Plus,
  Upload,
  ArrowRight,
  Tag,
  Loader2,
  Key,
  CheckCircle2,
  Circle,
  GitBranch,
  Rocket,
  BrainCircuit,
  FolderDown,
  Globe,
  Terminal,
  Sparkles,
  Clock,
  Shield,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ImportDialog } from "@/components/import-dialog";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { SecurityBadge } from "@/components/security-badge";
import { toast } from "sonner";
import { useUser } from "@/lib/auth/use-auth";
import { useWorkspace } from "@/lib/workspace-context";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function AnimatedNumber({ value, duration = 600 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const startTime = performance.now();
    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) ref.current = requestAnimationFrame(step);
    }
    ref.current = requestAnimationFrame(step);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return <>{display}</>;
}

function formatRelativeTime(date: string | Date) {
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* ─── Greeting Hero ────────────────────────────────────────────────────────── */

function StatusPill({ ok, label, href }: { ok: boolean; label: string; href?: string }) {
  const inner = (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
      ok
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
        : "border-border text-muted-foreground hover:text-foreground"
    }`}>
      <div className={`size-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
      {label}
    </div>
  );
  return href && !ok ? <Link href={href}>{inner}</Link> : inner;
}

function GreetingHero() {
  const { user } = useUser();
  const { activeOrgId } = useWorkspace();
  const { data: stats } = trpc.skills.stats.useQuery({ orgId: activeOrgId });
  const { data: cliStatus } = trpc.settings.cliStatus.useQuery(undefined, { refetchInterval: 10000 });
  const apiKeyStatus = trpc.settings.getApiKeyStatus.useQuery();
  const firstName = user?.name?.split(" ")[0] || "there";
  const hasGithub = false; // GitHub connection checked via settings, not auth provider

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-6 md:p-8">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You have <span className="font-medium text-foreground">{stats?.total ?? 0} skills</span> across{" "}
            <span className="font-medium text-foreground">{stats?.active ?? 0} active</span> deployments
          </p>
          <div className="flex items-center gap-2 mt-3">
            <StatusPill ok={cliStatus?.online ?? false} label={cliStatus?.online ? "CLI connected" : "CLI offline"} href="/sync" />
            <StatusPill ok={apiKeyStatus.data?.isSet ?? false} label={apiKeyStatus.data?.isSet ? "AI API key" : "No API key"} href="/settings" />
            <StatusPill ok={hasGithub} label={hasGithub ? "GitHub" : "No GitHub"} href="/settings" />
          </div>
        </div>
        <Link href="/skills/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="size-4 mr-1" /> New Skill
        </Link>
      </div>
    </div>
  );
}

/* ─── Stats Row ────────────────────────────────────────────────────────────── */

function StatsRow() {
  const { activeOrgId } = useWorkspace();
  const { data: stats, isLoading } = trpc.skills.stats.useQuery({ orgId: activeOrgId });
  const { data: projects } = trpc.projects.list.useQuery({ orgId: activeOrgId });
  const { data: targets } = trpc.sync.targets.useQuery();
  const { data: analytics } = trpc.skills.analytics.useQuery({ orgId: activeOrgId });

  const cards = [
    { label: "Skills", value: stats?.total ?? 0, icon: Layers, href: "/skills" },
    { label: "Projects", value: projects?.length ?? 0, icon: FolderKanban, href: "/projects" },
    { label: "Sync Targets", value: targets?.length ?? 0, icon: RefreshCw, href: "/sync" },
    { label: "Versions", value: analytics?.totalVersions ?? 0, icon: GitBranch },
    { label: "Deploys", value: analytics?.totalDeploys ?? 0, icon: Rocket },
    { label: "AI Reviews", value: analytics?.totalAiReviews ?? 0, icon: BrainCircuit },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
      {cards.map((card) => {
        const inner = (
          <div className="rounded-xl border bg-card p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <card.icon className="size-3.5" />
              <span className="text-[11px] font-medium">{card.label}</span>
            </div>
            {isLoading ? (
              <div className="mt-1.5 h-7 w-10 animate-pulse rounded bg-muted" />
            ) : (
              <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">
                <AnimatedNumber value={card.value} />
              </p>
            )}
          </div>
        );
        return card.href ? (
          <Link key={card.label} href={card.href}>{inner}</Link>
        ) : (
          <div key={card.label}>{inner}</div>
        );
      })}
    </div>
  );
}

/* ─── Recent Skills (improved) ─────────────────────────────────────────────── */

function RecentSkills() {
  const { activeOrgId } = useWorkspace();
  const { data: skills, isLoading } = trpc.skills.list.useQuery({ orgId: activeOrgId });
  const recent = skills?.slice(0, 8);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (!recent?.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
        <Layers className="size-8 text-muted-foreground/20" />
        <p className="mt-3 text-sm font-medium">No skills yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Create your first skill or browse the marketplace</p>
        <div className="mt-4 flex gap-2">
          <Link href="/skills/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3 mr-1" /> Create
          </Link>
          <Link href="/marketplace" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Globe className="size-3 mr-1" /> Marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {recent.map((skill) => (
        <Link
          key={skill.id}
          href={`/skills/${skill.slug ?? skill.id}`}
          className="group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-all hover:bg-muted/50 hover:shadow-sm"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                {skill.name}
              </span>
              {skill.skillCategory && (
                <Badge variant="secondary" className="text-[9px] shrink-0">{skill.skillCategory}</Badge>
              )}
            </div>
            {skill.description && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">{skill.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SecurityBadge content={skill.content} size="xs" />
            <Badge variant="outline" className="font-mono text-[10px]">v{skill.currentVersion}</Badge>
            <span className="text-[10px] text-muted-foreground w-12 text-right">{formatRelativeTime(skill.updatedAt)}</span>
          </div>
        </Link>
      ))}
      <Link
        href="/skills"
        className="flex items-center justify-center gap-1 rounded-lg py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        View all skills <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

/* ─── Quick Action Cards ───────────────────────────────────────────────────── */

function QuickActionCards({ onImportClick, onSyncClick, isSyncing }: { onImportClick: () => void; onSyncClick: () => void; isSyncing: boolean }) {
  const actions = [
    { label: "New Skill", desc: "Create from scratch or with AI", icon: Plus, href: "/skills/new", primary: true },
    { label: "Marketplace", desc: "Browse 2000+ community skills", icon: Globe, href: "/marketplace" },
    { label: "Import", desc: "ZIP, GitHub, or local folder", icon: Upload, onClick: onImportClick },
    { label: "Sync All", desc: "Deploy to all platforms", icon: RefreshCw, onClick: onSyncClick, loading: isSyncing },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {actions.map((action) => {
        const content = (
          <div className={`group flex flex-col gap-2 rounded-xl border p-4 transition-all hover:shadow-sm cursor-pointer ${
            action.primary ? "bg-primary/5 border-primary/20 hover:bg-primary/10" : "bg-card hover:bg-muted/50"
          }`}>
            <div className={`flex size-9 items-center justify-center rounded-lg ${
              action.primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {action.loading ? <Loader2 className="size-4 animate-spin" /> : <action.icon className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">{action.label}</p>
              <p className="text-[11px] text-muted-foreground">{action.desc}</p>
            </div>
          </div>
        );

        if (action.href) {
          return <Link key={action.label} href={action.href}>{content}</Link>;
        }
        return <div key={action.label} onClick={action.onClick}>{content}</div>;
      })}
    </div>
  );
}

/* ─── Onboarding (kept from original) ──────────────────────────────────────── */

function ScanLocalSkills() {
  const { activeOrgId } = useWorkspace();
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<{ name: string; slug: string; content: string; files: { folder: string; filename: string; content: string }[] }[]>([]);
  const [imported, setImported] = useState(false);
  const createSkill = trpc.skills.create.useMutation();
  const bulkAddFiles = trpc.files.bulkAdd.useMutation();
  const utils = trpc.useUtils();

  async function handleSelectFolder() {
    try {
      // @ts-expect-error - showDirectoryPicker is not in all TS defs
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });
      setScanning(true);
      setFound([]);
      const skills: typeof found = [];
      for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind !== "directory") continue;
        let skillMd: string | null = null;
        const files: { folder: string; filename: string; content: string }[] = [];
        for await (const [fname, fentry] of entry.entries()) {
          if (fentry.kind === "file" && fname === "SKILL.md") {
            const file = await fentry.getFile();
            skillMd = await file.text();
          }
          if (fentry.kind === "directory" && ["references", "scripts", "assets"].includes(fname)) {
            for await (const [subName, subEntry] of fentry.entries()) {
              if (subEntry.kind === "file") {
                const subFile = await subEntry.getFile();
                const text = await subFile.text();
                files.push({ folder: fname, filename: subName, content: text });
              }
            }
          }
        }
        if (skillMd) {
          const fmMatch = skillMd.match(/^---\n[\s\S]*?^name:\s*(.+)$/m);
          const slug = fmMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || name;
          const displayName = name.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          skills.push({ name: displayName, slug, content: skillMd, files });
        }
      }
      setFound(skills);
      setScanning(false);
    } catch (err) {
      setScanning(false);
      if ((err as Error).name !== "AbortError") toast.error("Could not read folder");
    }
  }

  async function handleImportAll() {
    setScanning(true);
    let count = 0;
    for (const skill of found) {
      try {
        const descMatch = skill.content.match(/^description:\s*(.+)$/m);
        const desc = descMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
        const result = await createSkill.mutateAsync({ name: skill.name, slug: skill.slug, description: desc, content: skill.content, orgId: activeOrgId });
        if (result?.id && skill.files.length > 0) {
          await bulkAddFiles.mutateAsync({ files: skill.files.map((f) => ({ skillId: result.id!, folder: f.folder, filename: f.filename, content: f.content, mimeType: "text/plain", size: f.content.length })) });
        }
        count++;
      } catch {}
    }
    setScanning(false);
    setImported(true);
    utils.skills.stats.invalidate();
    utils.skills.list.invalidate();
    toast.success(`Imported ${count} skill${count !== 1 ? "s" : ""}!`);
  }

  const isSupported = typeof window !== "undefined" && "showDirectoryPicker" in window;
  if (!isSupported) return <p className="text-[11px] text-muted-foreground">Use Chrome or Edge to scan local folders, or import via ZIP.</p>;
  if (imported) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-primary" /><span>Skills imported successfully!</span></div>;
  if (found.length > 0) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-border p-2.5 space-y-1.5">
          <p className="text-xs font-medium">Found {found.length} skill{found.length !== 1 ? "s" : ""}:</p>
          {found.map((s) => (
            <div key={s.slug} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <CheckCircle2 className="size-3 text-primary" /><span>{s.name}</span>
              {s.files.length > 0 && <span className="text-[10px] text-muted-foreground/50">+{s.files.length} files</span>}
            </div>
          ))}
        </div>
        <Button size="sm" onClick={handleImportAll} disabled={scanning}>
          {scanning ? <Loader2 className="size-3 animate-spin" /> : <FolderDown className="size-3" />} Import all to Praxl
        </Button>
      </div>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={handleSelectFolder} disabled={scanning}>
      {scanning ? <Loader2 className="size-3 animate-spin" /> : <FolderDown className="size-3" />}
      {scanning ? "Scanning..." : "Select skills folder"}
    </Button>
  );
}

function OnboardingCard({ onImportClick }: { onImportClick: () => void }) {
  const apiKeyStatus = trpc.settings.getApiKeyStatus.useQuery();
  const { data: stats } = trpc.skills.stats.useQuery();
  const hasApiKey = apiKeyStatus.data?.isSet ?? false;
  const hasSkills = (stats?.total ?? 0) > 0;

  const steps = [
    { title: "Set up your API key", description: "Connect your Anthropic API key to enable AI features", icon: Key, done: hasApiKey, action: <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>Go to Settings <ArrowRight className="ml-1 size-3" /></Link> },
    { title: "Create your first skill", description: "Define a new skill with metadata and content", icon: Plus, done: hasSkills, action: <Link href="/skills/new" className={buttonVariants({ variant: "outline", size: "sm" })}>Create Skill <ArrowRight className="ml-1 size-3" /></Link> },
    { title: "Import existing skills", description: "Upload a ZIP file with your existing skill definitions", icon: Upload, done: hasSkills, action: <Button variant="outline" size="sm" onClick={onImportClick}>Import ZIP <ArrowRight className="ml-1 size-3" /></Button> },
    { title: "Sync from your computer", description: "Import skills from ~/.claude/skills/ or any folder", icon: FolderDown, done: hasSkills, action: (
      <div className="space-y-2">
        <ScanLocalSkills />
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><span className="h-px flex-1 bg-border" /><span>or use CLI</span><span className="h-px flex-1 bg-border" /></div>
        <p className="text-[11px] text-muted-foreground">Get your token from <Link href="/settings" className="text-primary underline">Settings</Link> and run:</p>
        <code className="block text-[10px] font-mono bg-muted rounded px-2 py-1.5 select-all">praxl import --token YOUR_TOKEN</code>
      </div>
    )},
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Praxl</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage, version, and sync your skills across projects. Follow the steps below to get started.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {steps.map((step, i) => (
          <Card key={step.title} className="border-border shadow-none">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex size-8 items-center justify-center rounded-md border text-muted-foreground"><step.icon className="size-4" /></div>
                {step.done ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground/20" />}
              </div>
              <div>
                <p className="text-sm font-medium"><span className="mr-1.5 text-muted-foreground/50">{i + 1}.</span>{step.title}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
              {!step.done && step.action}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [importOpen, setImportOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: stats, isLoading: statsLoading } = trpc.skills.stats.useQuery();

  const syncAll = trpc.sync.syncAll.useMutation({
    onSuccess: (data) => {
      utils.sync.targets.invalidate();
      utils.sync.logs.invalidate();
      const summary = data.targets
        .map((t: { targetLabel: string; synced: number; failed: number }) => `${t.targetLabel}: ${t.synced} synced, ${t.failed} failed`)
        .join("\n");
      toast.success("Sync complete", { description: summary });
    },
    onError: (err) => toast.error(err.message),
  });

  const isEmpty = !statsLoading && (stats?.total ?? 0) === 0;
  const [showOnboarding, setShowOnboarding] = useState(false);
  const apiKeyStatus = trpc.settings.getApiKeyStatus.useQuery();
  const hasApiKey = apiKeyStatus.data?.isSet ?? false;
  const [apiKeyBannerDismissed, setApiKeyBannerDismissed] = useState(false);

  useEffect(() => {
    if (!statsLoading && isEmpty) setShowOnboarding(true);
  }, [statsLoading, isEmpty]);

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => { setShowOnboarding(false); utils.skills.stats.invalidate(); utils.skills.list.invalidate(); }} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-8">
      {isEmpty ? (
        <OnboardingCard onImportClick={() => setImportOpen(true)} />
      ) : (
        <>
          <GreetingHero />
          {!hasApiKey && !apiKeyBannerDismissed && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <Key className="size-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Get unlimited AI</p>
                <p className="text-xs text-muted-foreground">AI is included with limits. Add your own Anthropic API key in Settings for unlimited reviews, generation, and any model.</p>
              </div>
              <Link href="/settings" className="shrink-0 rounded-md bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors">
                Add key for unlimited
              </Link>
              <button onClick={() => setApiKeyBannerDismissed(true)} className="shrink-0 text-muted-foreground hover:text-foreground p-1">
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <StatsRow />
          <QuickActionCards
            onImportClick={() => setImportOpen(true)}
            onSyncClick={() => syncAll.mutate()}
            isSyncing={syncAll.isPending}
          />

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <p className="text-sm font-medium">Recent Activity</p>
              </div>
              <Link href="/skills" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                All skills <ArrowRight className="size-3" />
              </Link>
            </div>
            <RecentSkills />
          </div>
        </>
      )}

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { utils.skills.list.invalidate(); utils.skills.stats.invalidate(); }} />
    </div>
  );
}
