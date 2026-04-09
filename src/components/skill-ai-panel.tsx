"use client";

import * as React from "react";
import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { DiffMethod } from "react-diff-viewer-continued";
import { trpc } from "@/lib/trpc";
import { AI_MODELS, FAST_MODEL, DEFAULT_MODEL } from "@/lib/ai-config";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  Sparkles,
  AlertTriangle,
  XCircle,
  Lightbulb,
  Check,
  X,
  Loader2,
  Send,
  MessageSquarePlus,
  RotateCcw,
  Wrench,
  Shield,
  FileText,
  BookOpen,
  Target,
  Zap,
  CheckCircle2,
} from "lucide-react";

const ReactDiffViewer = dynamic(
  () => import("react-diff-viewer-continued").then((mod) => mod.default),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillAIPanelProps {
  skillId: string;
  skillContent: string;
  onContentChange: (content: string, changelog: string) => void;
}

interface AnalysisIssue {
  severity: "error" | "warning" | "suggestion";
  category: string;
  title: string;
  description: string;
  fix: string;
  lineHint?: string;
  status?: "open" | "fixed";
}

interface DiffPreview {
  oldContent: string;
  newContent: string;
  summary: string;
  source: "fix" | "feedback";
  issueIndex?: number;
}

interface FeedbackEntry {
  text: string;
  status: "pending" | "accepted" | "rejected";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, suggestion: 2 };

function severityIcon(severity: string, fixed?: boolean) {
  if (fixed) return <CheckCircle2 className="size-4 text-emerald-500" />;
  switch (severity) {
    case "error": return <XCircle className="size-4 text-red-500" />;
    case "warning": return <AlertTriangle className="size-4 text-yellow-500" />;
    default: return <Lightbulb className="size-4 text-blue-500" />;
  }
}

function severityBadgeVariant(severity: string) {
  switch (severity) {
    case "error": return "destructive" as const;
    case "warning": return "secondary" as const;
    default: return "outline" as const;
  }
}

function categoryIcon(category: string) {
  const lower = category.toLowerCase();
  if (lower.includes("frontmatter") || lower.includes("yaml")) return <FileText className="size-3" />;
  if (lower.includes("description") || lower.includes("trigger")) return <Target className="size-3" />;
  if (lower.includes("example")) return <BookOpen className="size-3" />;
  if (lower.includes("security")) return <Shield className="size-3" />;
  if (lower.includes("performance")) return <Zap className="size-3" />;
  return <Wrench className="size-3" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SkillAIPanel({ skillId, skillContent, onContentChange }: SkillAIPanelProps) {
  const [activeTab, setActiveTab] = useState<number>(0);

  // Analysis state - persists across fixes
  const [analysisModel, setAnalysisModel] = useState(FAST_MODEL);
  const [fixModel, setFixModel] = useState(DEFAULT_MODEL);
  const [issues, setIssues] = useState<AnalysisIssue[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [diffPreview, setDiffPreview] = useState<DiffPreview | null>(null);
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);

  // Feedback state
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackHistory, setFeedbackHistory] = useState<FeedbackEntry[]>([]);

  // Mutations
  const analyzeMutation = trpc.ai.analyzeSkillLive.useMutation({
    onSuccess: (data) => {
      setIssues(data.issues.map((i) => ({ ...i, status: "open" as const })));
      setHasAnalyzed(true);
    },
  });

  const fixIssueMutation = trpc.ai.fixIssue.useMutation();

  const applyFeedbackMutation = trpc.ai.applyFeedback.useMutation({
    onSuccess: (data) => {
      setDiffPreview({
        oldContent: skillContent,
        newContent: data.content,
        summary: data.changelog || data.summary,
        source: "feedback",
      });
    },
  });

  // Handlers
  const handleAnalyze = useCallback(() => {
    setDiffPreview(null);
    analyzeMutation.mutate({ content: skillContent, model: analysisModel });
  }, [analyzeMutation, skillContent, analysisModel]);

  const handleFixIssue = useCallback((issue: AnalysisIssue, index: number) => {
    setFixingIndex(index);
    fixIssueMutation.mutate(
      {
        content: skillContent,
        issueTitle: issue.title,
        issueFix: issue.fix,
        issueCategory: issue.category,
        model: fixModel,
      },
      {
        onSuccess: (data) => {
          setDiffPreview({
            oldContent: skillContent,
            newContent: data.content,
            summary: data.summary,
            source: "fix",
            issueIndex: index,
          });
          setFixingIndex(null);
        },
        onError: () => setFixingIndex(null),
      }
    );
  }, [fixIssueMutation, skillContent, fixModel]);

  const handleAcceptDiff = useCallback(() => {
    if (!diffPreview) return;
    onContentChange(diffPreview.newContent, diffPreview.summary);

    // Mark issue as fixed (don't clear analysis!)
    if (diffPreview.source === "fix" && diffPreview.issueIndex !== undefined) {
      setIssues((prev) =>
        prev.map((issue, idx) =>
          idx === diffPreview.issueIndex ? { ...issue, status: "fixed" as const } : issue
        )
      );
    }

    if (diffPreview.source === "feedback") {
      setFeedbackHistory((prev) =>
        prev.map((entry, idx) =>
          idx === prev.length - 1 ? { ...entry, status: "accepted" as const } : entry
        )
      );
      setFeedbackText("");
    }

    setDiffPreview(null);
  }, [diffPreview, onContentChange]);

  const handleRejectDiff = useCallback(() => {
    if (diffPreview?.source === "feedback") {
      setFeedbackHistory((prev) =>
        prev.map((entry, idx) =>
          idx === prev.length - 1 ? { ...entry, status: "rejected" as const } : entry
        )
      );
    }
    setDiffPreview(null);
  }, [diffPreview]);

  const handleSubmitFeedback = useCallback(() => {
    if (!feedbackText.trim()) return;
    setFeedbackHistory((prev) => [...prev, { text: feedbackText.trim(), status: "pending" }]);
    applyFeedbackMutation.mutate({
      content: skillContent,
      feedback: feedbackText.trim(),
      model: fixModel,
    });
  }, [applyFeedbackMutation, feedbackText, skillContent, fixModel]);

  // Derived
  const openIssues = issues.filter((i) => i.status !== "fixed");
  const fixedIssues = issues.filter((i) => i.status === "fixed");
  const sortedOpen = [...openIssues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const openCounts = {
    error: openIssues.filter((i) => i.severity === "error").length,
    warning: openIssues.filter((i) => i.severity === "warning").length,
    suggestion: openIssues.filter((i) => i.severity === "suggestion").length,
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  function renderDiff(old: string, next: string) {
    return (
      <div className="overflow-hidden rounded-lg border border-border max-h-64 overflow-y-auto">
        <ReactDiffViewer
          oldValue={old}
          newValue={next}
          splitView={false}
          useDarkTheme={true}
          compareMethod={DiffMethod.WORDS}
          styles={{ contentText: { fontSize: "12px", lineHeight: "1.5" } }}
        />
      </div>
    );
  }

  function renderIssueCard(issue: AnalysisIssue, globalIndex: number) {
    const isFixed = issue.status === "fixed";
    const isFixing = fixingIndex === globalIndex;

    return (
      <Card key={`${issue.title}-${globalIndex}`} className={`gap-2 ${isFixed ? "opacity-60" : ""}`}>
        <CardContent className="space-y-2 p-3">
          <div className="flex items-start gap-2">
            {severityIcon(issue.severity, isFixed)}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {isFixed ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">fixed</Badge>
                ) : (
                  <Badge variant={severityBadgeVariant(issue.severity)}>{issue.severity}</Badge>
                )}
                <Badge variant="outline" className="gap-1 text-[11px]">
                  {categoryIcon(issue.category)}
                  {issue.category}
                </Badge>
              </div>
              <p className={`font-medium text-sm ${isFixed ? "line-through text-muted-foreground" : ""}`}>{issue.title}</p>
            </div>
          </div>

          {!isFixed && (
            <>
              <p className="text-xs text-muted-foreground pl-6">{issue.description}</p>
              <div className="ml-6 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground border border-border/50">
                <span className="font-medium text-foreground/80">Fix: </span>{issue.fix}
              </div>
              <div className="pl-6">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleFixIssue(issue, globalIndex)}
                  disabled={isFixing || fixIssueMutation.isPending}
                >
                  {isFixing ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  {isFixing ? "Fixing..." : "AI Auto-fix"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full border-t border-border bg-card/50">
      <Tabs value={activeTab} onValueChange={(v) => v !== null && setActiveTab(v as number)}>
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <TabsList variant="line">
            <TabsTrigger value={0} className="gap-1.5">
              <Sparkles className="size-3.5" />
              Live Analysis
              {hasAnalyzed && openIssues.length > 0 && (
                <Badge variant={openCounts.error > 0 ? "destructive" : "secondary"} className="ml-1 px-1.5 text-[10px] h-4">
                  {openIssues.length}
                </Badge>
              )}
              {hasAnalyzed && openIssues.length === 0 && fixedIssues.length > 0 && (
                <CheckCircle2 className="size-3.5 text-emerald-500 ml-1" />
              )}
            </TabsTrigger>
            <TabsTrigger value={1} className="gap-1.5">
              <MessageSquarePlus className="size-3.5" />
              Feedback & Fix
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-4">
          {/* ── Analysis Tab ────────────────────────────────────── */}
          <TabsContent value={0}>
            <div className="space-y-4">
              {/* Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={handleAnalyze} disabled={analyzeMutation.isPending || !skillContent.trim()} size="sm">
                  {analyzeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {analyzeMutation.isPending ? "Analyzing..." : hasAnalyzed ? "Re-analyze" : "Analyze"}
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Analysis:</span>
                  <Select value={analysisModel} onValueChange={(v) => v && setAnalysisModel(v)}>
                    <SelectTrigger className="h-7 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Fix:</span>
                  <Select value={fixModel} onValueChange={(v) => v && setFixModel(v)}>
                    <SelectTrigger className="h-7 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {hasAnalyzed && (
                  <div className="flex items-center gap-2 ml-auto text-xs">
                    {openCounts.error > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="size-3" />{openCounts.error}</span>}
                    {openCounts.warning > 0 && <span className="flex items-center gap-1 text-yellow-500"><AlertTriangle className="size-3" />{openCounts.warning}</span>}
                    {openCounts.suggestion > 0 && <span className="flex items-center gap-1 text-blue-500"><Lightbulb className="size-3" />{openCounts.suggestion}</span>}
                    {fixedIssues.length > 0 && <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="size-3" />{fixedIssues.length} fixed</span>}
                  </div>
                )}
              </div>

              {analyzeMutation.isError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  Analysis failed: {analyzeMutation.error.message}
                </div>
              )}

              {/* Diff preview from fix */}
              {diffPreview && diffPreview.source === "fix" && (
                <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="size-4 text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-400">Proposed fix: {diffPreview.summary}</span>
                  </div>
                  {renderDiff(diffPreview.oldContent, diffPreview.newContent)}
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={handleAcceptDiff}>
                      <Check className="size-3" /> Accept & Save as New Version
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleRejectDiff}>
                      <X className="size-3" /> Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Loading */}
              {analyzeMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin" />
                  <p className="text-sm">Analyzing your skill...</p>
                </div>
              )}

              {/* All fixed */}
              {hasAnalyzed && !analyzeMutation.isPending && openIssues.length === 0 && fixedIssues.length > 0 && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-muted-foreground">
                  <CheckCircle2 className="size-8 text-emerald-500" />
                  <p className="text-sm font-medium text-emerald-400">All {fixedIssues.length} issues fixed!</p>
                  <p className="text-xs">Click Re-analyze to check for remaining improvements.</p>
                </div>
              )}

              {/* No issues at all */}
              {hasAnalyzed && !analyzeMutation.isPending && issues.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Check className="size-10 text-green-500" />
                  <p className="text-sm font-medium text-foreground">No issues found - your skill looks great!</p>
                </div>
              )}

              {/* Issue list */}
              {hasAnalyzed && !analyzeMutation.isPending && issues.length > 0 && (
                <div className="space-y-2">
                  {/* Open issues first */}
                  {sortedOpen.map((issue) => {
                    const idx = issues.indexOf(issue);
                    return renderIssueCard(issue, idx);
                  })}
                  {/* Fixed issues collapsed */}
                  {fixedIssues.length > 0 && openIssues.length > 0 && (
                    <>
                      <Separator />
                      <p className="text-xs font-medium text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> {fixedIssues.length} fixed
                      </p>
                      {fixedIssues.map((issue) => {
                        const idx = issues.indexOf(issue);
                        return renderIssueCard(issue, idx);
                      })}
                    </>
                  )}
                </div>
              )}

              {/* Empty state */}
              {!hasAnalyzed && !analyzeMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <Sparkles className="size-10" />
                  <p className="text-sm">Click <span className="font-medium text-foreground">Analyze</span> to check your skill against best practices.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Feedback Tab ───────────────────────────────────── */}
          <TabsContent value={1}>
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Model:</span>
                <Select value={fixModel} onValueChange={(v) => v && setFixModel(v)}>
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Textarea
                  placeholder={"Describe what's not working...\n\nExamples:\n- \"The skill doesn't trigger when I say X\"\n- \"Instructions for step 3 are too vague\"\n- \"Add error handling for API timeouts\""}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={4}
                  className="resize-y"
                />
                <Button onClick={handleSubmitFeedback} disabled={applyFeedbackMutation.isPending || !feedbackText.trim()} size="sm">
                  {applyFeedbackMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {applyFeedbackMutation.isPending ? "Applying feedback..." : "Submit Feedback"}
                </Button>
              </div>

              {applyFeedbackMutation.isError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  Failed: {applyFeedbackMutation.error.message}
                </div>
              )}

              {applyFeedbackMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin" />
                  <p className="text-sm">AI is applying your feedback...</p>
                </div>
              )}

              {diffPreview && diffPreview.source === "feedback" && (
                <div className="space-y-3">
                  <Separator />
                  <div className="rounded-lg bg-muted/50 p-3 text-xs border border-border/50 whitespace-pre-wrap">
                    <p className="font-medium text-foreground/80 mb-1">Changes:</p>
                    {diffPreview.summary}
                  </div>
                  {renderDiff(diffPreview.oldContent, diffPreview.newContent)}
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAcceptDiff}>
                      <Check className="size-4" /> Accept & Save as New Version
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRejectDiff}>
                      <X className="size-4" /> Reject
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDiffPreview(null)}>
                      <RotateCcw className="size-4" /> Revise
                    </Button>
                  </div>
                </div>
              )}

              {feedbackHistory.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">History</p>
                  {feedbackHistory.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-2 rounded-md bg-muted/30 p-2 text-xs border border-border/30">
                      {entry.status === "accepted" ? <Check className="size-3.5 text-green-500 mt-0.5" /> :
                       entry.status === "rejected" ? <X className="size-3.5 text-red-400 mt-0.5" /> :
                       <Loader2 className="size-3.5 text-muted-foreground animate-spin mt-0.5" />}
                      <p className="flex-1 text-muted-foreground line-clamp-2">{entry.text}</p>
                      <Badge variant={entry.status === "accepted" ? "default" : entry.status === "rejected" ? "destructive" : "secondary"}>
                        {entry.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {!diffPreview && !applyFeedbackMutation.isPending && feedbackHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
                  <MessageSquarePlus className="size-10" />
                  <p className="text-sm text-center">Describe what you want to change - AI will propose edits with a diff preview.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
