"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  ArrowRight,
  Terminal,
  Sparkles,
  Copy,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Layers,
  FolderDown,
  Square,
  CheckSquare,
} from "lucide-react";

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);

  const cliStatus = trpc.settings.cliStatus.useQuery(undefined, { refetchInterval: 5000 });
  const { data: stats } = trpc.skills.stats.useQuery({ countAll: true });

  const cliOnline = cliStatus.data?.online ?? false;
  const hasSkills = (stats?.total ?? 0) > 0;

  // Auto-advance
  useEffect(() => {
    if (cliOnline && step === 0) setStep(1);
    if (hasSkills && step < 1) setStep(1);
  }, [cliOnline, hasSkills, step]);

  // Complete when skills exist
  useEffect(() => {
    if (hasSkills) {
      const t = setTimeout(onComplete, 1500);
      return () => clearTimeout(t);
    }
  }, [hasSkills, onComplete]);

  const steps = [
    { label: "Connect", done: cliOnline },
    { label: "Get Skills", done: hasSkills },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-8 p-6 md:p-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <img src="/logo-dark.png" alt="Praxl" className="h-12 w-12 rounded-xl hidden dark:block" />
          <img src="/logo-light.png" alt="Praxl" className="h-12 w-12 rounded-xl dark:hidden" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to Praxl</h1>
        <p className="text-sm text-muted-foreground">Let&apos;s get your skills organized. Takes about a minute.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              s.done ? "bg-emerald-500/15 text-emerald-500" :
              i === step ? "bg-primary/15 text-primary" :
              "bg-muted text-muted-foreground"
            }`}>
              {s.done ? <Check className="size-3" /> : <span>{i + 1}</span>}
              {s.label}
            </div>
            {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && <CliConnectStep online={cliOnline} onSkip={() => setStep(1)} onRefresh={() => cliStatus.refetch()} />}
      {step === 1 && <GetSkillsStep hasSkills={hasSkills} onDone={onComplete} cliOnline={cliOnline} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Connect CLI
// ---------------------------------------------------------------------------

function CliConnectStep({ online, onSkip, onRefresh }: { online: boolean; onSkip: () => void; onRefresh: () => void }) {
  const [copied, setCopied] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cli/token", { credentials: "include" })
      .then(r => r.json())
      .then(d => setToken(d.token))
      .catch(() => {});
  }, []);

  const copyCmd = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  if (online) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <CheckCircle2 className="size-5 text-emerald-500" />
          <div>
            <p className="text-sm font-medium">CLI connected</p>
            <p className="text-xs text-muted-foreground">Your local tools are syncing with Praxl</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={onSkip}>
            Continue <ArrowRight className="size-3 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const urlFlag = appUrl && !appUrl.includes("MANAGED_CLOUD_URL") ? ` --url ${appUrl}` : "";
  const connectCmd = token ? `praxl connect --token ${token}${urlFlag}` : `praxl connect${urlFlag}`;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <Terminal className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Connect the CLI to sync your skills</p>
            <p className="text-xs text-muted-foreground">Discovers your existing skills and keeps everything in sync</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">1. Install Praxl CLI</p>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 border px-3 py-2">
            <code className="flex-1 text-xs font-mono">npm install -g praxl-app</code>
            <button onClick={() => copyCmd("npm install -g praxl-app", "install")} className="text-muted-foreground hover:text-foreground">
              {copied === "install" ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">2. Connect and sync (auto-imports your skills)</p>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 border px-3 py-2">
            <code className="flex-1 text-xs font-mono truncate">{connectCmd}</code>
            <button onClick={() => copyCmd(connectCmd, "connect")} className="text-muted-foreground hover:text-foreground shrink-0">
              {copied === "connect" ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-muted-foreground">Waiting for CLI connection...</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRefresh}>
              <RefreshCw className="size-3 mr-1" /> Check
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSkip}>
              Skip for now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Get Skills
// ---------------------------------------------------------------------------

function GetSkillsStep({ hasSkills, onDone, cliOnline }: { hasSkills: boolean; onDone: () => void; cliOnline: boolean }) {
  const localStateQuery = trpc.sync.getLocalState.useQuery(undefined, { enabled: cliOnline, refetchInterval: 5000 });
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [importState, setImportState] = useState<"idle" | "importing" | "done">("idle");
  const [importedCount, setImportedCount] = useState(0);
  const utils = trpc.useUtils();

  const localSkills = localStateQuery.data || [];
  const uniqueLocal = [...new Map(localSkills.map((s) => [s.slug, s])).values()];

  useEffect(() => {
    if (uniqueLocal.length > 0 && selectedSlugs.size === 0) {
      setSelectedSlugs(new Set(uniqueLocal.map((s) => s.slug)));
    }
  }, [uniqueLocal.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSlug = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  };

  const sendCommand = trpc.sync.sendCliCommand.useMutation();

  async function handleImport() {
    setImportState("importing");
    // Send "import" command to CLI with selected slugs
    try {
      await sendCommand.mutateAsync({ action: "import", slugs: [...selectedSlugs] });
    } catch {}

    // Poll skills.stats until skills appear (CLI picks up command on next heartbeat ~15s)
    const startStats = await utils.skills.stats.fetch();
    const startCount = startStats?.total || 0;
    let attempts = 0;
    const maxAttempts = 20; // 20 × 2s = 40s (CLI heartbeat is 15s)
    const poll = async (): Promise<void> => {
      attempts++;
      await utils.skills.stats.invalidate();
      const stats = await utils.skills.stats.fetch();
      const total = stats?.total || 0;
      if (total > startCount) {
        setImportedCount(total - startCount);
        setImportState("done");
        return;
      }
      if (attempts >= maxAttempts) {
        setImportedCount(selectedSlugs.size);
        setImportState("done");
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
      return poll();
    };
    await poll();
  }

  if (hasSkills) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
            <Sparkles className="size-7 text-emerald-500" />
          </div>
          <div>
            <p className="text-lg font-semibold">You&apos;re all set!</p>
            <p className="text-sm text-muted-foreground mt-1">Your skills are ready to manage, improve, and deploy.</p>
          </div>
          <Button onClick={onDone} className="mt-2">
            Go to Dashboard <ArrowRight className="size-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* CLI found local skills - show them */}
        {cliOnline && uniqueLocal.length > 0 ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <FolderDown className="size-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Found {uniqueLocal.length} skills on your machine</p>
                <p className="text-xs text-muted-foreground">Select which ones to import into Praxl</p>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
              {uniqueLocal.map((s) => {
                const selected = selectedSlugs.has(s.slug);
                return (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => toggleSlug(s.slug)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    {selected ? <CheckSquare className="size-4 text-primary shrink-0" /> : <Square className="size-4 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium truncate flex-1">{s.slug}</span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{s.platform}</Badge>
                  </button>
                );
              })}
            </div>

            {importState === "importing" ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="size-6 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium">Importing your skills...</p>
                  <p className="text-xs text-muted-foreground mt-1">This usually takes a few seconds</p>
                </div>
              </div>
            ) : importState === "done" ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="size-6 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">{importedCount} skills imported!</p>
                  <p className="text-xs text-muted-foreground mt-1">Your skills are in Praxl and ready to manage.</p>
                </div>
                <Button onClick={onDone} className="mt-1">
                  Go to Dashboard <ArrowRight className="size-4 ml-1" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (selectedSlugs.size === uniqueLocal.length) setSelectedSlugs(new Set());
                    else setSelectedSlugs(new Set(uniqueLocal.map((s) => s.slug)));
                  }}
                >
                  {selectedSlugs.size === uniqueLocal.length ? "Deselect all" : "Select all"}
                </button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={selectedSlugs.size === 0}
                >
                  <FolderDown className="size-3.5" />
                  Import {selectedSlugs.size} skill{selectedSlugs.size !== 1 ? "s" : ""}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Add your first skill</p>
                <p className="text-xs text-muted-foreground">
                  {cliOnline
                    ? "No local skills found - create one or browse the marketplace"
                    : "Create from scratch, generate with AI, or browse the marketplace"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link href="/skills/new" className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                <Sparkles className="size-4 text-primary" />
                <div>
                  <p className="text-xs font-medium">Create new skill</p>
                  <p className="text-[10px] text-muted-foreground">Start from scratch or use AI</p>
                </div>
              </Link>

              <Link href="/marketplace" className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                <Layers className="size-4 text-primary" />
                <div>
                  <p className="text-xs font-medium">Browse marketplace</p>
                  <p className="text-[10px] text-muted-foreground">Install community skills</p>
                </div>
              </Link>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-xs" onClick={onDone}>
            Skip - I&apos;ll explore first
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
