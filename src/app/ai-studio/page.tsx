"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Editor from "@monaco-editor/react";
import { trpc } from "@/lib/trpc";
import { SkillLimitBanner } from "@/components/skill-limit-banner";
import { AI_MODELS, DEFAULT_MODEL } from "@/lib/ai-config";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import { toast } from "sonner";
import { BetaBadge } from "@/components/beta-badge";

import {
  Sparkles,
  RefreshCw,
  Star,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Wand2,
  Plus,
  Brain,
  FileText,
  BarChart3,
  ArrowRight,
  Mic,
  MicOff,
  Languages,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/lib/workspace-context";

const CATEGORIES = [
  "Document Creation",
  "Workflow Automation",
  "MCP Enhancement",
];

const PATTERNS = [
  "Sequential",
  "Multi-MCP",
  "Iterative",
  "Context-aware",
  "Domain-specific",
];

function parseFrontmatter(content: string) {
  // Strip markdown fences and leading text before ---
  let clean = content;
  // Remove ```markdown wrapper if AI wrapped it
  clean = clean.replace(/^```(?:markdown|yaml|md)?\s*\n?/m, "").replace(/\n?```\s*$/, "");
  // Find the first --- block
  const fmStart = clean.indexOf("---");
  if (fmStart === -1) return { name: "", slug: "", description: "" };
  const afterFirst = clean.indexOf("\n", fmStart);
  const fmEnd = clean.indexOf("---", afterFirst + 1);
  if (fmEnd === -1) return { name: "", slug: "", description: "" };

  const yaml = clean.slice(afterFirst + 1, fmEnd);
  const body = clean.slice(fmEnd + 3).trim();
  const fullContent = clean.slice(fmStart).trim();

  const getName = yaml.match(/^name:\s*(.+)$/m);
  const getDesc = yaml.match(/^description:\s*(.+)$/m);
  const slug = getName?.[1]?.trim().replace(/['"]/g, "") ?? "";
  const description = getDesc?.[1]?.trim().replace(/['"]/g, "") ?? "";
  const name =
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "Untitled Skill";
  return { name, slug, description, fullContent };
}

function ScoreIndicator({ score }: { score: number }) {
  if (score >= 4) {
    return (
      <Badge className="gap-1 bg-green-500/15 text-green-700 dark:text-green-400">
        <CheckCircle className="size-3" />
        {score}/5
      </Badge>
    );
  }
  if (score >= 3) {
    return (
      <Badge className="gap-1 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">
        <Star className="size-3" />
        {score}/5
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-red-500/15 text-red-700 dark:text-red-400">
      <AlertTriangle className="size-3" />
      {score}/5
    </Badge>
  );
}

function VoiceWaveform({ volume, isSpeaking }: { volume: number; isSpeaking: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isSpeaking && volume < 0.05) return;
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, [isSpeaking, volume]);

  return (
    <div className="flex items-center gap-[1px] h-4 flex-1 max-w-48">
      {Array.from({ length: 24 }).map((_, i) => {
        const seed = Math.sin(tick * 0.3 + i * 1.7) * 0.5 + 0.5;
        const barH = isSpeaking
          ? Math.max(2, volume * 16 * (0.3 + seed * 0.7))
          : 2 + seed * 1.5;
        return (
          <div
            key={i}
            className={`flex-1 rounded-full transition-all duration-75 ${
              isSpeaking ? "bg-red-400/70" : "bg-red-300/30"
            }`}
            style={{ height: `${barH}px` }}
          />
        );
      })}
    </div>
  );
}

export default function AIStudioPage() {
  const searchParams = useSearchParams();
  const { activeOrgId } = useWorkspace();
  const [model, setModel] = useState(DEFAULT_MODEL);

  // Generate Skill state
  const [prompt, setPrompt] = useState(searchParams.get("prompt") || "");
  const [category, setCategory] = useState<string | null>(null);
  const [pattern, setPattern] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);

  // Batch Review state
  const [reviews, setReviews] = useState<
    { skillId: string; name: string; score: number; issues: string[] }[]
  >([]);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [expandedReviewContent, setExpandedReviewContent] = useState<
    string | null
  >(null);

  // Mutations
  const generateSkill = trpc.ai.generateSkill.useMutation({
    onSuccess: (data) => {
      // Clean AI output: strip markdown fences, find content starting from ---
      let clean = data.content;
      clean = clean.replace(/^```(?:markdown|yaml|md)?\s*\n?/m, "").replace(/\n?```\s*$/, "");
      const fmIdx = clean.indexOf("---");
      if (fmIdx > 0) clean = clean.slice(fmIdx);
      setGeneratedContent(clean.trim());
      toast.success("Skill generated successfully!");
    },
    onError: (err) => {
      toast.error(`Generation failed: ${err.message}`);
    },
  });

  const batchReview = trpc.ai.batchReview.useMutation({
    onSuccess: (data) => {
      setReviews(data.reviews);
      toast.success(`Reviewed ${data.reviews.length} skills`);
    },
    onError: (err) => {
      toast.error(`Batch review failed: ${err.message}`);
    },
  });

  const reviewSkill = trpc.ai.reviewSkill.useMutation({
    onSuccess: (data) => {
      setExpandedReviewContent(data.review);
    },
    onError: (err) => {
      toast.error(`Review failed: ${err.message}`);
    },
  });

  const createSkill = trpc.skills.create.useMutation({
    onSuccess: () => {
      toast.success("Skill saved successfully!");
      setGeneratedContent(null);
      setPrompt("");
    },
    onError: (err) => {
      toast.error(`Failed to save skill: ${err.message}`);
    },
  });

  const skillsQuery = trpc.skills.list.useQuery({ orgId: activeOrgId });

  // Voice dictation
  const [voiceLang, setVoiceLang] = useState("pl-PL");
  const handleVoiceResult = useCallback(
    (text: string, isFinal: boolean) => {
      if (isFinal) {
        setPrompt((prev) => prev + (prev ? " " : "") + text);
      }
    },
    []
  );
  const speech = useSpeechRecognition({
    lang: voiceLang,
    continuous: true,
    interimResults: true,
    onResult: handleVoiceResult,
  });

  // Dashboard stats
  const dashboardStats = useMemo(() => {
    if (reviews.length === 0) return null;
    const avgScore =
      reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
    const needsAttention = reviews.filter((r) => r.score < 3).length;
    return {
      avgScore: Math.round(avgScore * 10) / 10,
      needsAttention,
      reviewed: reviews.length,
    };
  }, [reviews]);

  function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Please enter a description for your skill");
      return;
    }
    generateSkill.mutate({
      prompt: prompt.trim(),
      category: category ?? undefined,
      pattern: pattern ?? undefined,
      model,
    });
  }

  function handleSaveSkill() {
    if (!generatedContent) return;
    const parsed = parseFrontmatter(generatedContent);
    if (!parsed.slug) {
      toast.error(
        "Could not extract skill name from frontmatter. Please ensure the generated content has valid YAML frontmatter."
      );
      return;
    }
    createSkill.mutate({
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      content: parsed.fullContent || generatedContent,
      orgId: activeOrgId,
    });
  }

  function handleViewFullReview(skillId: string) {
    if (expandedReviewId === skillId) {
      setExpandedReviewId(null);
      setExpandedReviewContent(null);
      return;
    }
    setExpandedReviewId(skillId);
    setExpandedReviewContent(null);
    const skill = skillsQuery.data?.find((s) => s.id === skillId);
    if (skill) {
      reviewSkill.mutate({
        skillId: skill.id,
        content: skill.content ?? "",
        model,
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-8">
      <SkillLimitBanner />
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              AI Studio
            </h1>
            <BetaBadge />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-powered skill creation, review, and improvement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Model:</span>
          <Select value={model} onValueChange={(v) => v && setModel(v)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Section 1: Generate Skill */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wand2 className="size-5 text-primary" />
            <CardTitle>Generate Skill from Description</CardTitle>
          </div>
          <CardDescription>
            Describe what you want your skill to do and AI will generate a
            complete SKILL.md for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Prompt textarea with voice dictation */}
          <div className="relative">
            <Textarea
              placeholder={speech.isListening ? "Speak now..." : "Describe what you want your skill to do, or use the microphone..."}
              className={`min-h-32 resize-y pr-16 transition-all duration-300 ${speech.isListening ? "ring-2 ring-red-500/40 border-red-500/40" : ""}`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            {/* Interim transcript overlay */}
            {speech.interimTranscript && (
              <div className="absolute left-3 right-16 bottom-3 pointer-events-none">
                <span className="text-sm text-muted-foreground/60 italic animate-pulse">
                  {speech.interimTranscript}
                </span>
              </div>
            )}
            {/* Mic button */}
            <div className="absolute right-2 top-2 flex flex-col items-center gap-2">
              <button
                onClick={speech.toggle}
                disabled={!speech.isSupported}
                className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                  speech.isListening
                    ? "h-12 w-12 bg-red-500 text-white shadow-lg shadow-red-500/30"
                    : "h-9 w-9 bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
                title={speech.isListening ? "Stop" : "Voice dictation"}
              >
                {/* Animated volume rings */}
                {speech.isListening && (
                  <>
                    <span
                      className="absolute inset-0 rounded-full bg-red-400/30 animate-ping"
                      style={{ animationDuration: "1.5s" }}
                    />
                    <span
                      className="absolute rounded-full bg-red-400/20 transition-all duration-150 ease-out"
                      style={{
                        inset: `${-4 - speech.volume * 16}px`,
                      }}
                    />
                    <span
                      className="absolute rounded-full bg-red-400/10 transition-all duration-150 ease-out"
                      style={{
                        inset: `${-8 - speech.volume * 24}px`,
                      }}
                    />
                  </>
                )}
                {speech.isListening ? (
                  <MicOff className="size-5 relative z-10" />
                ) : (
                  <Mic className="size-4 relative z-10" />
                )}
              </button>
              {/* Volume bar */}
              {speech.isListening && (
                <div className="flex gap-[2px] items-end h-4">
                  {[0.15, 0.3, 0.45, 0.6, 0.75].map((threshold, i) => (
                    <div
                      key={i}
                      className={`w-[3px] rounded-full transition-all duration-100 ${
                        speech.volume > threshold
                          ? speech.isSpeaking ? "bg-red-400" : "bg-red-300/50"
                          : "bg-muted-foreground/20"
                      }`}
                      style={{
                        height: speech.volume > threshold
                          ? `${Math.max(4, Math.min(16, speech.volume * 20))}px`
                          : "3px",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Voice status bar */}
          {speech.isListening && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  {speech.isSpeaking ? "Listening..." : "Waiting for speech..."}
                </span>
              </div>
              <VoiceWaveform volume={speech.volume} isSpeaking={speech.isSpeaking} />
              <div className="flex items-center gap-1.5 ml-auto">
                <Languages className="size-3.5 text-muted-foreground" />
                <Select value={voiceLang} onValueChange={(v) => {
                  if (!v) return;
                  if (speech.isListening) speech.stop();
                  setVoiceLang(v);
                }}>
                  <SelectTrigger className="h-6 w-28 text-xs border-none bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pl-PL">Polish</SelectItem>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="en-GB">English (UK)</SelectItem>
                    <SelectItem value="de-DE">German</SelectItem>
                    <SelectItem value="fr-FR">French</SelectItem>
                    <SelectItem value="es-ES">Spanish</SelectItem>
                    <SelectItem value="uk-UA">Ukrainian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Language selector when not listening */}
          {!speech.isListening && (
            <div className="flex items-center gap-1.5">
              <Languages className="size-3.5 text-muted-foreground" />
              <Select value={voiceLang} onValueChange={(v) => v && setVoiceLang(v)}>
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pl-PL">Polski</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                  <SelectItem value="de-DE">Deutsch</SelectItem>
                  <SelectItem value="fr-FR">Francais</SelectItem>
                  <SelectItem value="es-ES">Espanol</SelectItem>
                  <SelectItem value="uk-UA">Ukrainska</SelectItem>
                </SelectContent>
              </Select>
              {!speech.isSupported && (
                <span className="text-xs text-muted-foreground">Voice dictation not supported in this browser</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Category (optional)
              </span>
              <Select
                value={category ?? ""}
                onValueChange={(v) => v && setCategory(v === "__none" ? null : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Pattern (optional)
              </span>
              <Select
                value={pattern ?? ""}
                onValueChange={(v) => v && setPattern(v === "__none" ? null : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select pattern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {PATTERNS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleGenerate}
              disabled={generateSkill.isPending || !prompt.trim()}
            >
              {generateSkill.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {generateSkill.isPending ? "Generating..." : "Generate Skill"}
            </Button>

            {generatedContent && (
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={generateSkill.isPending}
              >
                <RefreshCw className="size-4" />
                Regenerate
              </Button>
            )}
          </div>

          {generatedContent && (
            <div className="space-y-3">
              <Separator />
              {/* Mobile: textarea preview. Desktop: Monaco */}
              <textarea
                className="lg:hidden block w-full min-h-[300px] rounded-lg border p-3 font-mono text-xs bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                value={generatedContent}
                readOnly
                spellCheck={false}
              />
              <div className="hidden lg:block overflow-hidden rounded-lg border">
                <Editor
                  height="400px"
                  language="markdown"
                  theme="vs-dark"
                  value={generatedContent}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    lineNumbers: "off",
                    padding: { top: 12 },
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveSkill}
                  disabled={createSkill.isPending}
                >
                  {createSkill.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Save as New Skill
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Batch Skill Review */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="size-5 text-primary" />
              <CardTitle>Batch Skill Review</CardTitle>
            </div>
            <Button
              onClick={() => batchReview.mutate({ model })}
              disabled={batchReview.isPending}
            >
              {batchReview.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              {batchReview.isPending ? "Reviewing..." : "Review All Skills"}
            </Button>
          </div>
          <CardDescription>
            Run AI-powered quality analysis on all your skills at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batchReview.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Analyzing all skills... This may take a moment.
              </p>
            </div>
          )}

          {!batchReview.isPending && reviews.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Brain className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No reviews yet. Click &quot;Review All Skills&quot; to get
                started.
              </p>
            </div>
          )}

          {reviews.length > 0 && (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Skill</TableHead>
                    <TableHead className="w-24">Score</TableHead>
                    <TableHead>Top Issues</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((review) => (
                    <>
                      <TableRow
                        key={review.skillId}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleViewFullReview(review.skillId)}
                      >
                        <TableCell className="font-medium">
                          {review.name}
                        </TableCell>
                        <TableCell>
                          <ScoreIndicator score={review.score} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {review.issues.slice(0, 3).map((issue, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-xs"
                              >
                                {issue}
                              </Badge>
                            ))}
                            {review.issues.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{review.issues.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ArrowRight
                            className={`size-4 text-muted-foreground transition-transform ${
                              expandedReviewId === review.skillId
                                ? "rotate-90"
                                : ""
                            }`}
                          />
                        </TableCell>
                      </TableRow>
                      {expandedReviewId === review.skillId && (
                        <TableRow key={`${review.skillId}-detail`}>
                          <TableCell colSpan={4}>
                            <div className="rounded-lg border bg-muted/30 p-4">
                              {reviewSkill.isPending ? (
                                <div className="flex items-center gap-2 py-4">
                                  <Loader2 className="size-4 animate-spin" />
                                  <span className="text-sm text-muted-foreground">
                                    Loading detailed review...
                                  </span>
                                </div>
                              ) : expandedReviewContent ? (
                                <>
                                  <textarea
                                    className="lg:hidden block w-full min-h-[250px] rounded-lg border p-3 font-mono text-xs bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                                    value={expandedReviewContent}
                                    readOnly
                                    spellCheck={false}
                                  />
                                  <div className="hidden lg:block overflow-hidden rounded-lg border">
                                    <Editor
                                      height="300px"
                                      language="markdown"
                                      theme="vs-dark"
                                      value={expandedReviewContent}
                                      options={{
                                        readOnly: true,
                                        minimap: { enabled: false },
                                        wordWrap: "on",
                                        scrollBeyondLastLine: false,
                                        fontSize: 13,
                                        lineNumbers: "off",
                                        padding: { top: 12 },
                                      }}
                                    />
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  No review content available.
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Skill Health Dashboard */}
      {dashboardStats && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              <CardTitle>Skill Health Dashboard</CardTitle>
            </div>
            <CardDescription>
              Overview of your skill portfolio quality based on the latest batch
              review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="flex flex-col items-center gap-1 py-6">
                  <Star className="size-8 text-yellow-500" />
                  <p className="text-3xl font-bold">
                    {dashboardStats.avgScore}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Average Score
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col items-center gap-1 py-6">
                  <AlertTriangle
                    className={`size-8 ${
                      dashboardStats.needsAttention > 0
                        ? "text-red-500"
                        : "text-green-500"
                    }`}
                  />
                  <p className="text-3xl font-bold">
                    {dashboardStats.needsAttention}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Needs Attention
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col items-center gap-1 py-6">
                  <CheckCircle className="size-8 text-green-500" />
                  <p className="text-3xl font-bold">
                    {dashboardStats.reviewed}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Skills Reviewed
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
