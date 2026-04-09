"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { DiffMethod } from "react-diff-viewer-continued";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AI_MODELS, DEFAULT_MODEL, SKILL_EXPERT_SYSTEM_PROMPT } from "@/lib/ai-config";
import { CHAT_TOOLS, buildChatSystemBlocks } from "@/lib/ai-tools";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { AiUsageBadge } from "@/components/ai-usage-badge";

const ReactDiffViewer = dynamic(
  () => import("react-diff-viewer-continued").then((mod) => mod.default),
  { ssr: false }
);
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Send,
  Bot,
  User,
  Copy,
  Check,
  Loader2,
  X,
  Trash2,
  CheckCircle2,
  XCircle,
  Pencil,
  MessageSquare,
  ChevronDown,
  Target,
  BookOpen,
  FileText,
  Shield,
  Zap,
  ListChecks,
  Settings2,
  FolderOpen,
  FileDown,
  AlertTriangle,
} from "lucide-react";
import { BetaBadge } from "@/components/beta-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface AIPlan {
  steps: string[];
  currentStep: number;
  completedSteps: number[];
  reasoning?: string;
}

interface AIChatPanelProps {
  skillId?: string;
  skillName?: string;
  skillContent?: string;
  skillDescription?: string;
  issues?: SkillIssue[];
  onApplyContent?: (content: string, changelog: string) => void;
  onApplyDescription?: (description: string) => void;
  onProposeEdit?: (content: string, changelog: string) => void;
  onClose: () => void;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "tool-action";
  content: string;
  messageType: "chat" | "edit" | "field-update" | "status";
  metadata: Record<string, unknown>;
  // For edit proposals
  _pendingContent?: string;
  _pendingChangelog?: string;
  _oldContent?: string;
  _applied?: boolean;
  _rejected?: boolean;
  // For field updates
  _field?: string;
  _fieldValue?: string;
}

// Smart model routing: estimate complexity from user prompt
function estimatePromptComplexity(prompt: string): "simple" | "medium" | "complex" {
  const p = prompt.toLowerCase();
  const complexPatterns = [
    /rewrite (entire|whole|all|everything)/,
    /restructure|refactor|reorganize/,
    /generate (a |the )?(complete|full|entire)/,
    /create (from scratch|new skill)/,
    /comprehensive|extensive|thorough/,
    /migrate|convert|transform/,
    /multiple (files|changes|edits)/,
    /improve (everything|all|entire)/,
  ];
  const simplePatterns = [
    /^(add|change|update|fix|rename|remove|delete)\s+\w+\s+(to|field|line)/,
    /update (the )?(description|name|title)/,
    /fix (the )?typo/,
    /rename/,
    /^(is|what|how|can|why|when|should)/,  // questions
  ];

  if (complexPatterns.some(r => r.test(p))) return "complex";
  if (simplePatterns.some(r => r.test(p)) || prompt.length < 50) return "simple";
  return "medium";
}

function suggestedModelFor(complexity: "simple" | "medium" | "complex"): string {
  if (complexity === "complex") return "claude-sonnet-4-6";
  return "claude-haiku-4-5-20251001";
}

function genId() {
  return Math.random().toString(36).slice(2, 14);
}

// ---------------------------------------------------------------------------
// Quick Actions
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: "Fix all issues", icon: Zap, msg: "Analyze this skill, find ALL issues (frontmatter, description, structure, examples, error handling), and fix them all in one edit. Apply all fixes at once." },
  { label: "Review", icon: Sparkles, msg: "Review this skill and rate each area 1-5." },
  { label: "Improve description", icon: Target, msg: "Improve the description - add WHAT it does, WHEN to use it, and specific trigger phrases." },
  { label: "Add examples", icon: BookOpen, msg: "Add 2-3 concrete usage examples with realistic scenarios." },
  { label: "Add error handling", icon: Shield, msg: "Add a troubleshooting section with common errors and solutions." },
  { label: "Full rewrite", icon: Settings2, msg: "Rewrite this entire skill following all best practices. Keep the same purpose but improve everything." },
] as const;

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Unexpected token '<'") || msg.includes("<HTML>") || msg.includes("<!DOCTYPE")) {
    return "Request timed out (server limit). Try a shorter instruction or switch to Haiku model.";
  }
  if (msg.includes("Unable to transform")) return "Server error. Try again.";
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return "Network error - check your connection.";
  if (msg.includes("401") || msg.includes("API key")) return "API key rejected. Check Settings.";
  if (msg.includes("429") || msg.includes("Rate limit")) return "Rate limited - wait a moment.";
  return msg;
}

// ---------------------------------------------------------------------------
// Apply frontmatter field update to skill content
// ---------------------------------------------------------------------------

function applyFieldUpdate(content: string, field: string, value: string): string {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)\n(---)/);
  if (!fmMatch) return content;

  const [fullMatch, open, body, close] = fmMatch;
  const fieldRegex = new RegExp(`^(${field}:\\s*)(.*)$`, "m");
  const match = body.match(fieldRegex);

  let newBody: string;
  if (match) {
    // Value might need quoting if it contains special chars
    const needsQuote = value.includes(":") || value.includes("#") || value.includes('"') || value.startsWith("'");
    const quotedValue = needsQuote ? `"${value.replace(/"/g, '\\"')}"` : value;
    newBody = body.replace(fieldRegex, `${match[1]}${quotedValue}`);
  } else {
    // Field doesn't exist - add it
    newBody = body + `\n${field}: ${value}`;
  }

  return content.replace(fullMatch, `${open}${newBody}\n${close}`);
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function CodeBlock({ children, onCopy }: { children: string; onCopy: () => void }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="group/code relative rounded-md bg-black/20 dark:bg-white/5 my-1.5 overflow-hidden">
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 group-hover/code:opacity-100 transition-opacity z-10">
        <button
          onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1 rounded bg-muted/80 backdrop-blur px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-2 overflow-x-auto text-xs"><code>{children}</code></pre>
    </div>
  );
}

function Md({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>,
          h3: ({ children }) => <h5 className="text-xs font-semibold mt-2 mb-1">{children}</h5>,
          p: ({ children }) => <p className="text-sm leading-relaxed mb-1.5">{children}</p>,
          ul: ({ children }) => <ul className="text-sm list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          code: ({ children, className }) => {
            const text = String(children).replace(/\n$/, "");
            if (className?.includes("language-")) {
              return <CodeBlock onCopy={() => navigator.clipboard.writeText(text)}>{text}</CodeBlock>;
            }
            return <code className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs font-mono">{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 my-1.5 text-muted-foreground italic text-sm">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/50 border-b border-border">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-muted/30">{children}</tr>,
          th: ({ children }) => <th className="px-2.5 py-1.5 text-left font-semibold text-foreground/80 text-[11px]">{children}</th>,
          td: ({ children }) => <td className="px-2.5 py-1.5 text-muted-foreground text-[11px]">{children}</td>,
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proactive Suggestions Banner
// ---------------------------------------------------------------------------

function ProactiveBanner({ skillId, onAction }: { skillId: string; onAction: (text: string) => void }) {
  const suggestionsQuery = trpc.ai.getProactiveSuggestions.useQuery({ skillId }, {
    staleTime: 10 * 1000, // 10s cache - refresh often after edits
    refetchOnWindowFocus: false,
  });

  const suggestions = suggestionsQuery.data?.suggestions || [];
  const actionable = suggestions.filter(s => s.action);

  if (actionable.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b shrink-0 space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground">Suggestions</p>
      <div className="flex flex-wrap gap-1">
        {actionable.slice(0, 4).map((s, i) => (
          <button
            key={i}
            onClick={() => s.action && onAction(s.action)}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors ${
              s.type === "warning"
                ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {s.type === "warning" ? "⚠" : "💡"} {s.message.slice(0, 40)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff Block
// ---------------------------------------------------------------------------

function DiffBlock({ oldContent, newContent }: { oldContent: string; newContent: string }) {
  const [expanded, setExpanded] = React.useState(true);
  const [isDark, setIsDark] = React.useState(true);
  React.useEffect(() => {
    setIsDark(!document.documentElement.classList.contains("light"));
    const observer = new MutationObserver(() => {
      setIsDark(!document.documentElement.classList.contains("light"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const added = newLines.filter((l, i) => oldLines[i] !== l).length;
  const removed = oldLines.filter((l, i) => newLines[i] !== l).length;

  return (
    <div className="border-t border-emerald-500/20 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`size-3 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        <span className="font-medium">Changes</span>
        <span className="text-emerald-500">+{added}</span>
        <span className="text-red-400">-{removed}</span>
      </button>
      {expanded && (
        <div className="max-h-64 overflow-y-auto text-[12px] border-t border-border/50">
          <ReactDiffViewer
            oldValue={oldContent}
            newValue={newContent}
            splitView={false}
            useDarkTheme={isDark}
            compareMethod={DiffMethod.LINES}
            hideLineNumbers
            styles={{
              contentText: { fontSize: "12px", lineHeight: "1.4", fontFamily: "var(--font-geist-mono), monospace" },
              diffContainer: { background: "transparent" },
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIChatPanel({
  skillId,
  skillName,
  skillContent,
  skillDescription,
  issues,
  onApplyContent,
  onApplyDescription,
  onProposeEdit,
  onClose,
}: AIChatPanelProps) {
  const [model, setModel] = React.useState(DEFAULT_MODEL);
  const [localMessages, setLocalMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Track latest skill content (updates when user accepts changes)
  const latestContentRef = React.useRef(skillContent);
  React.useEffect(() => {
    const changed = latestContentRef.current !== skillContent;
    latestContentRef.current = skillContent;
    // Only treat as accepted if new content EXACTLY matches what AI proposed
    // (prevents Monaco edits from falsely advancing plan)
    if (changed && pendingExternalEditRef.current && skillContent === pendingExternalEditContentRef.current) {
      pendingExternalEditRef.current = false;
      pendingExternalEditContentRef.current = null;
      setTimeout(() => { advancePlanAfterAcceptRef.current?.(); }, 100);
    }
  }, [skillContent]);

  // Streaming fetch to /api/ai/chat
  const [chatPending, setChatPending] = React.useState(false);
  const [chatStartTime, setChatStartTime] = React.useState<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!chatPending) { setChatStartTime(null); setElapsed(0); return; }
    const start = Date.now();
    setChatStartTime(start);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(timer);
  }, [chatPending]);
  const streamingMsgRef = React.useRef<string | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const [activePlan, setActivePlan] = React.useState<AIPlan | null>(null);
  const handleSendRef = React.useRef<((text: string, isAutoContinuation?: boolean) => void) | null>(null);
  const autoContinuationInProgressRef = React.useRef(false);
  const pendingExternalEditRef = React.useRef(false);
  const pendingExternalEditContentRef = React.useRef<string | null>(null);
  const advancePlanAfterAcceptRef = React.useRef<(() => void) | null>(null);

  // Advance plan after accepting a step - works for ANY action type.
  // Idempotent: won't re-complete a step already done, so multiple
  // accepts (e.g. AI did 3 edits in one turn) correctly advance through
  // sequential steps.
  const advancePlanAfterAccept = React.useCallback(() => {
    setActivePlan((current) => {
      if (!current) return current;
      // Already complete for current step? advance already happened.
      if (current.completedSteps.includes(current.currentStep)) return current;
      const newCompleted = [...current.completedSteps, current.currentStep];
      const nextStepIdx = current.currentStep + 1;
      const updated = {
        ...current,
        completedSteps: newCompleted,
        currentStep: Math.min(nextStepIdx, current.steps.length - 1),
      };
      // Trigger next step if not last
      if (nextStepIdx < current.steps.length) {
        setTimeout(() => {
          handleSendRef.current?.(
            `Execute step ${nextStepIdx + 1} from the plan: "${current.steps[nextStepIdx]}"\n\nIMPORTANT: Do NOT call create_plan again - the plan already exists. Call the appropriate tool directly (edit_skill, edit_file, or update_frontmatter_field) to complete this step.`,
            true, // isAutoContinuation
          );
        }, 400);
      }
      return updated;
    });
  }, []);
  React.useEffect(() => { advancePlanAfterAcceptRef.current = advancePlanAfterAccept; }, [advancePlanAfterAccept]);
  const apiKeyQuery = trpc.settings.getApiKey.useQuery(undefined, { staleTime: 60_000 });
  const filesQuery = trpc.files.listWithContent.useQuery(skillId ?? "", { enabled: !!skillId });
  const notesQuery = trpc.skills.getNotes.useQuery(skillId ?? "", { enabled: !!skillId });
  const saveNoteMutation = trpc.skills.saveNote.useMutation();

  const chatCallStreaming = React.useCallback(async (
    params: { messages: Array<{ role: string; content: string }>; skillId?: string; skillContent?: string; model: string },
    onTextDelta: (text: string, msgId: string) => void,
    onToolUse: (name: string, input: Record<string, string | string[]>) => void,
    onStep: (step: number, tool: string, summary: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
  ) => {
    setChatPending(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const apiKey = apiKeyQuery.data?.key;

    // Watchdog: very generous - 180s of silence (Claude can think long before first token)
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const resetWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        controller.abort();
        onError("AI has been silent for 3 minutes - likely stuck. Aborted. Try again or use a faster model.");
      }, 180000);
    };

    try {
      const hasByoKey = !!apiKey;
      console.log("[ai-chat] Starting request, hasByoKey:", hasByoKey, "model:", params.model);

      resetWatchdog();

      let res: Response;
      if (hasByoKey) {
        console.log("[ai-chat] Calling Anthropic API directly...");
        // Direct browser → Anthropic call (no server proxy, no Vercel timeout)
        const hasSkill = params.skillContent && params.skillContent.length > 10;
        // Build system as array of blocks with cache_control for prompt caching (90% cost savings)
        const systemBlocks = buildChatSystemBlocks(
          SKILL_EXPERT_SYSTEM_PROMPT,
          params.skillContent,
          filesQuery.data,
          notesQuery.data,
        );
        // Max tokens: Haiku capped at 8192 (model limit). Sonnet/Opus up to 64000 with beta header.
        const isHaiku = params.model.includes("haiku");
        const maxTokens = isHaiku ? 8192 : 64000;

        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            ...(!isHaiku ? { "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15" } : {}),
          },
          body: JSON.stringify({
            model: params.model,
            max_tokens: maxTokens,
            system: systemBlocks,
            messages: params.messages,
            stream: true,
            ...(hasSkill ? { tools: CHAT_TOOLS } : {}),
          }),
          signal: controller.signal,
        });
      } else {
        console.log("[ai-chat] Using server proxy (no BYO key)...");
        // Server proxy - uses server key, Haiku, with usage limits
        res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messages: params.messages,
            skillId: params.skillId,
            skillContent: params.skillContent,
          }),
          signal: controller.signal,
        });
      }

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try { errMsg = JSON.parse(errText)?.error?.message || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream reader");
      const decoder = new TextDecoder();
      let buffer = "";
      let streamMsgId = "";
      let currentToolName = "";
      let currentToolInput = "";
      let currentBlockType = "";
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetWatchdog(); // Reset watchdog on every chunk

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            // content_block_start: initialize block type
            if (event.type === "content_block_start") {
              const block = event.content_block;
              currentBlockType = block.type;
              if (block.type === "tool_use") {
                currentToolName = block.name;
                currentToolInput = "";
              }
            }
            // content_block_delta: streaming chunks
            else if (event.type === "content_block_delta") {
              const delta = event.delta;
              if (delta.type === "text_delta" && delta.text) {
                onTextDelta(delta.text, streamMsgId);
                if (!streamMsgId) streamMsgId = "streaming";
              } else if (delta.type === "input_json_delta" && delta.partial_json) {
                currentToolInput += delta.partial_json;
              }
            }
            // content_block_stop: finalize tool_use
            else if (event.type === "content_block_stop") {
              if (currentBlockType === "tool_use" && currentToolName) {
                try {
                  const input = currentToolInput ? JSON.parse(currentToolInput) : {};
                  onToolUse(currentToolName, input);
                } catch (parseErr) {
                  console.error("[ai-chat] tool_use JSON parse error:", parseErr, currentToolInput);
                }
                currentToolName = "";
                currentToolInput = "";
              }
              currentBlockType = "";
            }
            // message_delta: check stop_reason
            else if (event.type === "message_delta") {
              if (event.delta?.stop_reason === "max_tokens") {
                throw new Error("Response hit token limit (output was cut off). Try a more specific instruction or switch to Sonnet/Opus model for longer outputs.");
              }
            }
            // message_stop: end of response
            else if (event.type === "message_stop") {
              receivedDone = true;
            }
            // error events
            else if (event.type === "error") {
              throw new Error(event.error?.message || "Anthropic API error");
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message.includes("Anthropic")) throw parseErr;
            // Silent parse errors for malformed chunks
          }
        }
      }

      if (!receivedDone) {
        onError("AI stream ended unexpectedly. Try again.");
      } else {
        onDone();
      }
      void onStep; // unused in direct mode
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        // Already reported by watchdog
      } else {
        onError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
      setChatPending(false);
      streamingMsgRef.current = null;
    }
  }, [apiKeyQuery.data, filesQuery.data, notesQuery.data]);
  const utils = trpc.useUtils();
  const saveMsgMutation = trpc.chat.saveMessage.useMutation();
  const addFileMutation = trpc.files.add.useMutation();
  const clearHistoryMutation = trpc.chat.clearHistory.useMutation();
  const historyQuery = trpc.chat.getHistory.useQuery(skillId ?? "", { enabled: !!skillId });

  const isLoading = chatPending;

  // Merge DB + local messages
  const dbMessages: ChatMsg[] = React.useMemo(() => {
    if (!historyQuery.data) return [];
    return historyQuery.data.map((m) => ({
      id: m.id,
      role: m.role as ChatMsg["role"],
      content: m.content,
      messageType: m.messageType as ChatMsg["messageType"],
      metadata: (m.metadata ?? {}) as Record<string, unknown>,
      _applied: (m.metadata as Record<string, unknown>)?.applied === true,
      _rejected: (m.metadata as Record<string, unknown>)?.rejected === true,
    }));
  }, [historyQuery.data]);

  const messages = React.useMemo(() => {
    const dbIds = new Set(dbMessages.map((m) => m.id));
    const onlyLocal = localMessages.filter((m) => !dbIds.has(m.id));
    return [...dbMessages, ...onlyLocal];
  }, [dbMessages, localMessages]);

  const setMessages = setLocalMessages;

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const persistMsg = React.useCallback(
    async (msg: ChatMsg) => {
      if (!skillId) return;
      const validRoles = ["user", "assistant", "tool-action"] as const;
      const role = validRoles.includes(msg.role as typeof validRoles[number]) ? msg.role as typeof validRoles[number] : "user";
      try { await saveMsgMutation.mutateAsync({ skillId, role, content: msg.content, messageType: msg.messageType, metadata: msg.metadata }); } catch {}
    },
    [skillId, saveMsgMutation]
  );

  const addMsg = React.useCallback(
    (msg: Omit<ChatMsg, "id">) => {
      const newMsg: ChatMsg = { ...msg, id: genId() };
      setMessages((prev) => [...prev, newMsg]);
      persistMsg(newMsg);
      return newMsg;
    },
    [persistMsg]
  );

  // ─── Send message (streaming) ─────────────────────
  const handleSend = React.useCallback(async (overrideText?: string, isAutoContinuation?: boolean) => {
    const text = (overrideText || input).trim();
    if (!text || isLoading) return;
    if (!overrideText) setInput("");

    // If user sends a MANUAL message during an active plan, clear the plan
    // (they're starting something new, don't want auto-continuation)
    if (!isAutoContinuation && activePlan && activePlan.completedSteps.length < activePlan.steps.length) {
      setActivePlan(null);
      pendingExternalEditRef.current = false;
      pendingExternalEditContentRef.current = null;
    }

    addMsg({ role: "user", content: text, messageType: "chat", metadata: isAutoContinuation ? { autoContinuation: true } : {} });

    // Build history with token budget (approx. 4 chars = 1 token)
    // Keep newest messages; truncate oldest if total exceeds budget.
    const HISTORY_TOKEN_BUDGET = 36000; // ~144KB of history
    const estimateTokens = (s: string) => Math.ceil(s.length / 4);

    const allHistory: Array<{ role: "user" | "assistant"; content: string; tokens: number }> = [];
    for (const m of messages) {
      if (m.role === "user") {
        allHistory.push({ role: "user", content: m.content, tokens: estimateTokens(m.content) });
      } else if (m.role === "assistant" && m.messageType === "chat") {
        allHistory.push({ role: "assistant", content: m.content, tokens: estimateTokens(m.content) });
      } else if (m.messageType === "edit" || m.messageType === "field-update") {
        const toolName = m.metadata?.toolName || "edit";
        const desc = m._pendingChangelog || m.content;
        if (m._rejected) {
          const propText = `[Proposed ${toolName}: ${desc}]`;
          const rejText = "REJECTED. Discard that change completely. Do NOT include it in any future edits. The skill remains unchanged from before the proposal.";
          allHistory.push({ role: "assistant", content: propText, tokens: estimateTokens(propText) });
          allHistory.push({ role: "user", content: rejText, tokens: estimateTokens(rejText) });
        } else if (m._applied) {
          // Strong signal: task completed, changes are now in "Current Skill"
          const propText = `[Called ${toolName}: ${desc}]`;
          const ackText = "Accepted. Change is now in the skill. Task complete - do NOT repeat or re-include this change in any future response.";
          allHistory.push({ role: "assistant", content: propText, tokens: estimateTokens(propText) });
          allHistory.push({ role: "user", content: ackText, tokens: estimateTokens(ackText) });
        } else {
          const t = `[Proposed ${toolName}: ${desc}] (pending review)`;
          allHistory.push({ role: "assistant", content: t, tokens: estimateTokens(t) });
        }
      } else if (m.role === "tool-action") {
        allHistory.push({ role: "assistant", content: m.content, tokens: estimateTokens(m.content) });
      }
    }

    // Trim from oldest until within budget (keep last N fitting in budget)
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    let totalTokens = estimateTokens(text); // current user message
    for (let i = allHistory.length - 1; i >= 0; i--) {
      const entry = allHistory[i];
      if (totalTokens + entry.tokens > HISTORY_TOKEN_BUDGET) break;
      totalTokens += entry.tokens;
      history.unshift({ role: entry.role, content: entry.content });
    }
    history.push({ role: "user", content: text });

    // Create a placeholder message for streaming text
    const streamMsgId = genId();
    setMessages((prev) => [...prev, { id: streamMsgId, role: "assistant", content: "", messageType: "chat", metadata: {} }]);
    streamingMsgRef.current = streamMsgId;

    // Validate AI's edit_skill output before showing to user
    const validateEditSkillOutput = (content: string): string[] => {
      const warnings: string[] = [];
      if (!content.trimStart().startsWith("---")) {
        warnings.push("Missing YAML frontmatter (should start with ---)");
      }
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) {
        warnings.push("Invalid or unclosed YAML frontmatter");
      } else {
        const fm = fmMatch[1];
        if (!/^name:/m.test(fm)) warnings.push("Missing 'name' field in frontmatter");
        if (!/^description:/m.test(fm)) warnings.push("Missing 'description' field in frontmatter");
        const nameMatch = fm.match(/^name:\s*(.+)$/m);
        if (nameMatch) {
          const name = nameMatch[1].trim().replace(/^["']|["']$/g, "");
          if (name !== name.toLowerCase() || /\s/.test(name)) {
            warnings.push(`Name "${name}" is not kebab-case`);
          }
        }
      }
      return warnings;
    };

    // Track what tools AI called this turn - used to auto-continue after plan creation
    let planJustCreated: { steps: string[]; firstStep: string } | null = null;
    let anyEditToolCalled = false;

    const handleToolUse = (name: string, input: Record<string, string | string[]>) => {
      if (["edit_skill", "update_frontmatter_field", "edit_file"].includes(name)) {
        anyEditToolCalled = true;
      }
      if (name === "create_plan" && Array.isArray(input.steps)) {
        // Loop guard: ignore if a plan already exists (prevents infinite plan creation)
        if (activePlan && activePlan.completedSteps.length < activePlan.steps.length) {
          addMsg({
            role: "tool-action",
            content: "⚠️ Plan already exists - AI tried to create a new one. Ignoring. Execute the current plan's next step.",
            messageType: "status",
            metadata: {},
          });
          return;
        }
        const steps = (input.steps as string[]).filter(s => s.trim().length > 0);
        if (steps.length > 0) {
          const plan: AIPlan = { steps, currentStep: 0, completedSteps: [], reasoning: input.reasoning as string | undefined };
          setActivePlan(plan);
          planJustCreated = { steps, firstStep: steps[0] };
          addMsg({
            role: "assistant",
            content: `Plan created: ${steps.length} steps`,
            messageType: "status",
            metadata: { isPlan: true, steps, reasoning: input.reasoning },
          });
        }
        return;
      }
      const strInput = input as Record<string, string>;
      if (name === "edit_skill" && strInput.content) {
        const summary = strInput.summary || "AI edit";
        const changelog = strInput.changelog || `- ${summary}`;

        // Self-validation: warn user if AI generated invalid skill
        const warnings = validateEditSkillOutput(strInput.content);
        if (warnings.length > 0) {
          addMsg({
            role: "assistant",
            content: `⚠️ AI-generated content has issues:\n${warnings.map(w => `- ${w}`).join("\n")}\n\nReview carefully before applying, or ask AI to fix.`,
            messageType: "status",
            metadata: { validationWarnings: warnings },
          });
        }

        if (onProposeEdit) {
          onProposeEdit(strInput.content, changelog);
          pendingExternalEditRef.current = true;
          pendingExternalEditContentRef.current = strInput.content; // track exact proposed content
          addMsg({ role: "assistant", content: `Proposed: ${changelog}`, messageType: "chat", metadata: {} });
        } else {
          const diffId = genId();
          setMessages((prev) => [...prev, {
            id: diffId, role: "assistant", content: changelog, messageType: "edit",
            metadata: { toolName: "edit_skill", summary },
            _oldContent: latestContentRef.current || "", _pendingContent: strInput.content, _pendingChangelog: summary,
          }]);
        }
      } else if (name === "update_frontmatter_field" && strInput.field && strInput.value) {
        const currentContent = latestContentRef.current || "";
        const newContent = applyFieldUpdate(currentContent, strInput.field, strInput.value);
        const summary = strInput.summary || `Updated ${strInput.field}`;
        const diffId = genId();
        setMessages((prev) => [...prev, {
          id: diffId, role: "assistant",
          content: `Updated **${strInput.field}** → ${strInput.value.length > 80 ? strInput.value.slice(0, 80) + "..." : strInput.value}`,
          messageType: "field-update",
          metadata: { toolName: "update_frontmatter_field", field: strInput.field },
          _oldContent: currentContent, _pendingContent: newContent, _pendingChangelog: summary,
          _field: strInput.field, _fieldValue: strInput.value,
        }]);
      } else if (name === "edit_file" && strInput.folder && strInput.filename && strInput.content) {
        addMsg({
          role: "assistant",
          content: `**File:** \`${strInput.folder}/${strInput.filename}\`\n${strInput.summary || "New file"}`,
          messageType: "edit",
          metadata: { toolName: "edit_file", folder: strInput.folder, filename: strInput.filename, fileContent: strInput.content },
        });
      } else if (name === "save_note") {
        addMsg({ role: "tool-action", content: `Noted: ${strInput.note}`, messageType: "status", metadata: {} });
        if (skillId && strInput.note) {
          saveNoteMutation.mutate({ skillId, note: strInput.note }, {
            onSuccess: () => { utils.skills.getNotes.invalidate(skillId); },
          });
        }
      }
    };

    await chatCallStreaming(
      {
        messages: history,
        skillId: skillId || undefined,
        skillContent: latestContentRef.current || undefined,
        model,
      },
      // onTextDelta
      (deltaText) => {
        setMessages((prev) => prev.map((m) =>
          m.id === streamMsgId ? { ...m, content: m.content + deltaText } : m
        ));
      },
      // onToolUse
      handleToolUse,
      // onStep (unused now)
      () => {},
      // onDone
      () => {
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === streamMsgId);
          if (msg && msg.content?.trim()) persistMsg(msg);
          if (msg && !msg.content?.trim()) return prev.filter((m) => m.id !== streamMsgId);
          return prev;
        });

        // Auto-trigger step 1 if AI only created plan but didn't execute
        // Guard: only if there's no active continuation already in progress
        if (planJustCreated && !anyEditToolCalled && !autoContinuationInProgressRef.current) {
          autoContinuationInProgressRef.current = true;
          setTimeout(() => {
            handleSendRef.current?.(
              `Execute step 1 from the plan: "${planJustCreated!.firstStep}"\n\n` +
              `IMPORTANT: Do NOT call create_plan again - the plan already exists. ` +
              `Call edit_skill, edit_file, or update_frontmatter_field DIRECTLY to complete this step.`,
              true,
            );
            autoContinuationInProgressRef.current = false;
          }, 400);
        } else if (!planJustCreated && !anyEditToolCalled && activePlan && activePlan.completedSteps.length < activePlan.steps.length) {
          // AI responded to plan step without calling any edit tool - stuck
          addMsg({
            role: "assistant",
            content: "⚠️ AI responded without taking action on this step. It may need rephrasing - try sending a specific instruction for this step, or click Cancel on the plan.",
            messageType: "status",
            metadata: { isStuckWarning: true },
          });
        }
      },
      // onError
      (error) => {
        const friendly = friendlyError(new Error(error));
        setMessages((prev) => prev.map((m) =>
          m.id === streamMsgId ? { ...m, content: `Error: ${friendly}` } : m
        ));
      },
    );
  }, [input, isLoading, messages, model, addMsg, chatCallStreaming, skillId, persistMsg, activePlan]);

  React.useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

  // ─── Accept/Reject ─────────────────────────────────
  const handleAccept = React.useCallback(
    (msgId: string) => {
      const msg = localMessages.find((m) => m.id === msgId) || dbMessages.find((m) => m.id === msgId);
      if (!msg?._pendingContent || !onApplyContent) return;
      onApplyContent(msg._pendingContent, msg._pendingChangelog || "AI edit");
      toast.success(`Applied: ${msg._pendingChangelog || "AI edit"}`);
      latestContentRef.current = msg._pendingContent;
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, _applied: true, _pendingContent: undefined } : m))
      );
      if (skillId) {
        saveMsgMutation.mutate({ skillId, role: "tool-action", content: `✓ Applied: ${msg._pendingChangelog}`, messageType: "status", metadata: { applied: true } });
        // Refresh suggestions - accepted change may have resolved issues
        utils.ai.getProactiveSuggestions.invalidate({ skillId });
      }
      advancePlanAfterAccept();
    },
    [localMessages, dbMessages, onApplyContent, skillId, saveMsgMutation, utils, advancePlanAfterAccept]
  );

  // Save a file created by edit_file tool
  const handleSaveFile = React.useCallback(async (msgId: string) => {
    const msg = localMessages.find((m) => m.id === msgId) || dbMessages.find((m) => m.id === msgId);
    if (!msg?.metadata || !skillId) return;
    const { folder, filename, fileContent } = msg.metadata as { folder?: string; filename?: string; fileContent?: string };
    if (!folder || !filename || !fileContent) return;

    const validFolders = ["references", "scripts", "assets"];
    if (!validFolders.includes(folder)) {
      toast.error("Invalid folder: " + folder);
      return;
    }

    try {
      await addFileMutation.mutateAsync({
        skillId,
        folder: folder as "references" | "scripts" | "assets",
        filename,
        content: fileContent,
        mimeType: "text/plain",
        size: fileContent.length,
      });
      toast.success(`File saved: ${folder}/${filename}`);
      setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, _applied: true } : m));
      // Refresh files list so Files panel shows new file
      if (skillId) {
        utils.files.list.invalidate(skillId);
        utils.files.listWithContent.invalidate(skillId);
      }
      advancePlanAfterAccept();
    } catch (err) {
      toast.error(`Failed to save file: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }, [localMessages, dbMessages, skillId, addFileMutation, utils, advancePlanAfterAccept]);

  const handleReject = React.useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, _rejected: true, _pendingContent: undefined } : m))
    );
  }, []);

  const handleCopy = React.useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // ─── Render message ────────────────────────────────
  function renderMessage(msg: ChatMsg) {
    // Hide auto-continuation messages - they're system-internal
    if ((msg.metadata as Record<string, unknown>)?.autoContinuation) return null;
    // Plan message
    if ((msg.metadata as Record<string, unknown>)?.isPlan) {
      const planSteps = ((msg.metadata as Record<string, unknown>)?.steps as string[]) || [];
      const reasoning = (msg.metadata as Record<string, unknown>)?.reasoning as string | undefined;
      const completedCount = activePlan?.completedSteps.length || 0;
      const totalCount = activePlan?.steps.length || planSteps.length;
      const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      const isComplete = activePlan && completedCount === totalCount;
      const currentStepIndex = activePlan?.currentStep ?? -1;

      return (
        <div key={msg.id} className="flex gap-2">
          <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
            isLoading && !isComplete ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
          }`}>
            {isLoading && !isComplete ? <Loader2 className="size-3 animate-spin" /> : <ListChecks className="size-3" />}
          </div>
          <div className="flex-1 rounded-xl border-2 border-primary/30 bg-primary/5 overflow-hidden">
            {/* Header with progress bar */}
            <div className="px-3 py-2 border-b border-primary/20 bg-primary/10">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {isComplete ? (
                    <Badge className="text-[10px] bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1">
                      <CheckCircle2 className="size-2.5" /> Plan Complete
                    </Badge>
                  ) : isLoading ? (
                    <Badge className="text-[10px] bg-primary/20 text-primary border-primary/40 gap-1">
                      <div className="flex gap-0.5">
                        <span className="size-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0ms" }} />
                        <span className="size-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "150ms" }} />
                        <span className="size-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "300ms" }} />
                      </div>
                      Working on step {currentStepIndex + 1}
                    </Badge>
                  ) : (
                    <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Plan: {completedCount}/{totalCount}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{Math.round(progressPercent)}%</span>
                  {!isComplete && activePlan && (
                    <button
                      onClick={() => {
                        setActivePlan(null);
                        pendingExternalEditRef.current = false;
                        pendingExternalEditContentRef.current = null;
                      }}
                      className="text-[9px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded hover:bg-destructive/10"
                      title="Cancel plan"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${isComplete ? "bg-emerald-500" : "bg-primary"}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Steps list */}
            <div className="px-3 py-2 space-y-2">
              {reasoning && <p className="text-xs text-muted-foreground italic">{reasoning}</p>}
              <ol className="space-y-1.5">
                {planSteps.map((step, i) => {
                  const isDone = activePlan?.completedSteps.includes(i);
                  const isCurrent = currentStepIndex === i && !isDone;
                  const isActivelyRunning = isCurrent && isLoading;
                  return (
                    <li
                      key={i}
                      className={`flex items-start gap-2 text-xs rounded-md px-2 py-1.5 transition-all ${
                        isActivelyRunning
                          ? "bg-primary/15 border border-primary/40 shadow-sm"
                          : isCurrent
                          ? "bg-primary/5 border border-primary/20"
                          : ""
                      }`}
                    >
                      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5 ${
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isActivelyRunning
                          ? "bg-primary text-primary-foreground"
                          : isCurrent
                          ? "bg-primary/30 text-primary border border-primary"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {isDone ? "✓" : isActivelyRunning ? <Loader2 className="size-3 animate-spin" /> : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`${
                          isDone ? "text-muted-foreground line-through" : isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                        }`}>
                          {step}
                        </span>
                        {isActivelyRunning && (
                          <span className="ml-2 text-[10px] text-primary font-medium inline-flex items-center gap-1">
                            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                            running...
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      );
    }

    // Status messages
    if (msg.messageType === "status" || msg.role === "tool-action") {
      const warnings = (msg.metadata as Record<string, unknown>)?.validationWarnings as string[] | undefined;
      const isWarning = warnings && warnings.length > 0;
      if (isWarning) {
        return (
          <div key={msg.id} className="flex gap-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
              <AlertTriangle className="size-3" />
            </div>
            <div className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-2">
              <div className="text-xs whitespace-pre-wrap">{msg.content}</div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                onClick={() => handleSend(`The last edit_skill output had these issues:\n${warnings.map(w => `- ${w}`).join("\n")}\n\nFix these and call edit_skill again with corrected content.`)}
              >
                <Sparkles className="size-3 mr-1" /> Ask AI to fix
              </Button>
            </div>
          </div>
        );
      }
      return (
        <div key={msg.id} className="flex justify-center py-1">
          <div className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="size-3" />
            <span>{msg.content}</span>
          </div>
        </div>
      );
    }

    // Edit proposals (tool_use: edit_skill or update_frontmatter_field)
    if (msg.messageType === "edit" || msg.messageType === "field-update") {
      const isFieldUpdate = msg.messageType === "field-update";
      const isFileEdit = msg.metadata?.toolName === "edit_file";
      const badgeLabel = isFileEdit ? `File: ${msg.metadata?.folder}/${msg.metadata?.filename}` : isFieldUpdate ? `Update: ${msg._field}` : "Edit skill";
      const badgeColor = isFileEdit ? "bg-purple-500/15 text-purple-400 border-purple-500/30" : isFieldUpdate ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
      const iconColor = isFileEdit ? "bg-purple-500/20 text-purple-400" : isFieldUpdate ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-500";
      return (
        <div key={msg.id} className="flex gap-2">
          <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${iconColor}`}>
            {isFileEdit ? <FolderOpen className="size-3" /> : isFieldUpdate ? <Settings2 className="size-3" /> : <Pencil className="size-3" />}
          </div>
          <div className="flex-1 rounded-xl overflow-hidden border border-emerald-500/20">
            <div className="bg-emerald-500/5 px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <Badge className={`text-[10px] ${badgeColor}`}>
                  {badgeLabel}
                </Badge>
                {msg._pendingChangelog && (
                  <span className="text-[10px] text-muted-foreground">{msg._pendingChangelog}</span>
                )}
              </div>
              <Md content={msg.content} />
            </div>

            {/* Diff */}
            {msg._oldContent && msg._pendingContent && !msg._applied && !msg._rejected && (
              <DiffBlock oldContent={msg._oldContent} newContent={msg._pendingContent} />
            )}

            {/* Actions */}
            {msg._applied ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border-t border-emerald-500/20">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                <span className="text-[11px] font-medium text-emerald-500">{isFileEdit ? "File saved" : "Applied & saved"}</span>
              </div>
            ) : msg._rejected ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-t border-border">
                <XCircle className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">Rejected</span>
              </div>
            ) : isFileEdit && msg.metadata?.fileContent ? (
              <div className="border-t border-emerald-500/20">
                {/* File content preview */}
                <div className="max-h-32 overflow-y-auto bg-muted/30 px-3 py-2">
                  <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono">{String(msg.metadata.fileContent).slice(0, 500)}{String(msg.metadata.fileContent).length > 500 ? "\n..." : ""}</pre>
                </div>
                <div className="flex gap-2 px-3 py-2 bg-emerald-500/5">
                  <Button size="sm" className="h-6 text-[11px] bg-purple-600 hover:bg-purple-700" onClick={() => handleSaveFile(msg.id)}>
                    <FileDown className="size-3" /> Save file
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => handleReject(msg.id)}>
                    <X className="size-3" /> Dismiss
                  </Button>
                </div>
              </div>
            ) : msg._pendingContent ? (
              <div className="flex gap-2 px-3 py-2 border-t border-emerald-500/20 bg-emerald-500/5">
                <Button size="sm" className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAccept(msg.id)}>
                  <Check className="size-3" /> Apply
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => handleReject(msg.id)}>
                  <X className="size-3" /> Reject
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    // Regular chat - hide empty streaming placeholder
    if (!msg.content && msg.role === "assistant") return null;
    const isUser = msg.role === "user";
    return (
      <div key={msg.id} className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
        <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {isUser ? <User className="size-3" /> : <Bot className="size-3" />}
        </div>
        <div className={`group/msg max-w-[90%] rounded-xl px-3 py-2 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
          ) : (
            <Md content={msg.content} />
          )}
          {!isUser && (
            <div className="flex items-center gap-1 mt-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
              <button onClick={() => handleCopy(msg.content, msg.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                {copiedId === msg.id ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────
  return (
    <div className="flex h-full flex-col border-l border-border bg-card/50">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">AI Assistant</span>
          <AiUsageBadge feature="chat" />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Select value={model} onValueChange={(v) => v && setModel(v)}>
            <SelectTrigger className="h-6 w-28 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button onClick={() => { if (skillId) { clearHistoryMutation.mutate(skillId, { onSuccess: () => historyQuery.refetch() }); setLocalMessages([]); } }} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Clear history">
            <Trash2 className="size-3.5" />
          </button>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Close">
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Proactive Suggestions */}
      {skillId && <ProactiveBanner skillId={skillId} onAction={handleSend} />}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3" ref={scrollRef}>
        <div className="flex flex-col gap-2.5">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
              <MessageSquare className="size-6 opacity-40" />
              <p className="text-xs">AI will directly edit your skill when you ask.</p>
              <p className="text-[10px] opacity-60">Try: &quot;add examples&quot;, &quot;improve description&quot;, &quot;fix the frontmatter&quot;</p>
            </div>
          )}
          {messages.map(renderMessage)}
          {isLoading && (
            <ThinkingIndicator
              elapsed={elapsed}
              isWriting={messages.some(m => m.id === streamingMsgRef.current && m.content)}
              onStop={() => { abortControllerRef.current?.abort(); }}
            />
          )}
        </div>
      </div>

      {/* Issues chips */}
      {issues && issues.length > 0 && (
        <div className="border-t px-3 py-1.5 shrink-0">
          <p className="text-[10px] text-muted-foreground mb-1">{issues.length} issue{issues.length > 1 ? "s" : ""} found - click to fix:</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {issues.slice(0, 5).map((issue, i) => (
              <button
                key={`issue-${i}`}
                onClick={() => handleSend(`Fix this issue: [${issue.field}] ${issue.message}. Apply the fix directly using edit_skill tool.`)}
                disabled={isLoading || !skillContent}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                  issue.severity === "error"
                    ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                    : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                <Zap className="size-2.5" />
                {issue.message.length > 40 ? issue.message.slice(0, 40) + "..." : issue.message}
              </button>
            ))}
            {issues.length > 1 && (
              <button
                onClick={() => handleSend(`Fix ALL ${issues.length} issues at once:\n${issues.map(i => `- [${i.field}] ${i.message}`).join("\n")}\n\nApply all fixes using edit_skill tool.`)}
                disabled={isLoading || !skillContent}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 text-primary px-2.5 py-1 text-[10px] font-medium hover:bg-primary/10 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap className="size-2.5" />
                Fix all {issues.length}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="border-t px-3 py-1.5 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.msg}
              onClick={() => handleSend(qa.msg)}
              disabled={isLoading || !skillContent}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <qa.icon className="size-2.5" />
              {qa.label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2.5 shrink-0">
        {/* Smart model suggestion */}
        {input.trim().length > 20 && (() => {
          const complexity = estimatePromptComplexity(input);
          const suggestedId = suggestedModelFor(complexity);
          const usingHaiku = model.includes("haiku");
          if (complexity === "complex" && usingHaiku) {
            const suggestedModel = AI_MODELS.find(m => m.id === suggestedId);
            return (
              <button
                onClick={() => setModel(suggestedId)}
                className="mb-2 flex items-center gap-1.5 text-[10px] text-amber-500 hover:text-amber-400 transition-colors"
              >
                <Sparkles className="size-2.5" />
                This looks complex - switch to {suggestedModel?.name || "Sonnet"}?
              </button>
            );
          }
          return null;
        })()}
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask anything or tell AI what to change..."
            className="min-h-[36px] max-h-[80px] flex-1 resize-none text-sm"
            rows={1}
          />
          <Button size="icon-sm" onClick={() => handleSend()} disabled={!input.trim() || isLoading}>
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
