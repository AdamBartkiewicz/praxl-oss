"use client";

import { use, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Editor, { DiffEditor as MonacoDiffEditor } from "@monaco-editor/react";
import dynamic from "next/dynamic";
import { DiffMethod } from "react-diff-viewer-continued";

const ReactDiffViewer = dynamic(
  () => import("react-diff-viewer-continued").then((mod) => mod.default),
  { ssr: false }
);
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Save,
  Trash2,
  Clock,
  User,
  Tag,
  Monitor,
  GitBranch,
  Circle,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Plus,
  X,
  Check,
  SquareCheck,
  Square,
  Sparkles,
  Download,
  FolderOpen,
  File,
  FileCode,
  Image,
  Upload,
  Eye,
  Pencil,
  FilePlus,
  Rocket,
  ChevronRight,
  RotateCcw,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { AIChatPanel } from "@/components/ai-chat-panel";
import { FileEditorDialog } from "@/components/file-editor-dialog";
import { SecurityPanel } from "@/components/security-badge";
import { securityScan } from "@/lib/security-scan";
import { SkillVisualView } from "@/components/skill-visual-view";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AI_MODELS, DEFAULT_MODEL, FAST_MODEL } from "@/lib/ai-config";
import { useWorkspace } from "@/lib/workspace-context";
import {
  validateSkill,
  validateSkillName,
  validateDescription,
  parseSkillMd,
  generateSkillMd,
  qualityChecklist,
  type ValidationResult,
  type ChecklistItem,
} from "@/lib/skill-validation";

// ─── Deploy Status Bar ──────────────────────────────────────────────────────

function DeployStatusBar({ skillId, skillSlug, currentVersion }: { skillId: string; skillSlug: string; currentVersion: number }) {
  const assignmentsQuery = trpc.sync.getAssignments.useQuery();
  const localStateQuery = trpc.sync.getLocalState.useQuery();
  const assignMutation = trpc.sync.assignSkill.useMutation({
    onSuccess: () => {
      assignmentsQuery.refetch();
      toast.success("Skill re-assigned - will sync on next CLI poll");
    },
    onError: (err) => toast.error(err.message),
  });

  const assignments = (assignmentsQuery.data ?? []).filter((a) => a.skill?.id === skillId);
  if (assignments.length === 0) return null;

  const localStates = localStateQuery.data ?? [];

  return (
    <div className="flex items-center gap-3 border-b border-border px-6 py-1.5 bg-muted/30 overflow-x-auto">
      {assignments.map((a) => {
        const synced = localStates.some(
          (ls) => ls.platform === a.target?.platform && ls.slug === skillSlug
        );
        const deployedVersion = a.deployedVersion;
        const needsUpdate = deployedVersion != null && deployedVersion < currentVersion;
        return (
          <div key={a.id} className="flex items-center gap-1.5 shrink-0">
            <span className={`inline-block size-1.5 rounded-full ${synced && !needsUpdate ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
            <span className="text-[11px] text-muted-foreground">{a.target?.label ?? a.target?.platform}</span>
            {needsUpdate ? (
              <>
                <span className="text-[10px] font-mono px-1 rounded bg-amber-500/10 text-amber-500">
                  v{deployedVersion} → v{currentVersion}
                </span>
                <button
                  onClick={() => assignMutation.mutate({ skillId, targetId: a.target?.id ?? "", version: currentVersion })}
                  disabled={assignMutation.isPending}
                  className="text-[10px] text-amber-600 hover:text-amber-500 font-medium bg-amber-500/10 px-1 rounded"
                >
                  Update
                </button>
              </>
            ) : synced ? (
              <span className="text-[10px] font-mono px-1 rounded bg-emerald-500/10 text-emerald-500">
                v{deployedVersion ?? currentVersion} ✓
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1 rounded bg-amber-500/10 text-amber-500">
                v{deployedVersion} pending sync
              </span>
            )}
          </div>
        );
      })}

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {assignments.every((a) => {
          const synced = localStates.some((ls) => ls.platform === a.target?.platform && ls.slug === skillSlug);
          const upToDate = a.deployedVersion == null || a.deployedVersion >= currentVersion;
          return synced && upToDate;
        }) ? (
          <span className="text-[10px] text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="size-3" /> All synced
          </span>
        ) : assignments.some((a) => a.deployedVersion != null && a.deployedVersion < currentVersion) ? (
          <span className="text-[10px] text-amber-500">Updates available</span>
        ) : (
          <span className="text-[10px] text-amber-500">Waiting for CLI sync</span>
        )}
      </div>
    </div>
  );
}

// ─── Version Diff Block ─────────────────────────────────────────────────────

function VersionDiffBlock({ skillId, version }: { skillId: string; version: number }) {
  const { resolvedTheme } = useTheme();
  const diffQuery = trpc.skills.getVersionDiff.useQuery(
    { skillId, version },
    { staleTime: 60_000 }
  );

  if (diffQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-6 border-t border-border bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
        <span className="text-xs text-muted-foreground">Loading diff...</span>
      </div>
    );
  }

  if (diffQuery.error) {
    return (
      <div className="flex items-center justify-center py-4 border-t border-border bg-muted/20">
        <span className="text-xs text-red-400">Failed to load diff</span>
      </div>
    );
  }

  const data = diffQuery.data;
  if (!data) return null;

  const oldContent = data.previousContent || "";
  const newContent = data.content || "";

  // Compute added/removed line counts
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const addedCount = newLines.filter((line) => !oldSet.has(line)).length;
  const removedCount = oldLines.filter((line) => !newSet.has(line)).length;

  const isDark =
    resolvedTheme === "dark" ||
    (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  return (
    <div className="border-t border-border bg-muted/20">
      <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground border-b border-border/50">
        <span className="text-emerald-500 font-mono">+{addedCount}</span>
        <span className="text-red-400 font-mono">-{removedCount}</span>
        {version === 1 && (
          <span className="italic">Initial version</span>
        )}
      </div>
      <div className="max-h-[400px] overflow-auto">
        <ReactDiffViewer
          oldValue={oldContent}
          newValue={newContent}
          splitView={false}
          useDarkTheme={isDark}
          compareMethod={DiffMethod.LINES}
          styles={{
            contentText: { fontSize: "12px", lineHeight: "1.5", fontFamily: "monospace" },
            gutter: { minWidth: "30px", fontSize: "11px" },
          }}
          hideLineNumbers={false}
        />
      </div>
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  "claude-code",
  "claude-web",
  "cursor",
  "codex",
  "gemini-cli",
  "copilot",
  "windsurf",
  "opencode",
  "custom",
] as const;

const CATEGORY_OPTIONS = [
  { value: "document-creation", label: "Document Creation" },
  { value: "workflow-automation", label: "Workflow Automation" },
  { value: "mcp-enhancement", label: "MCP Enhancement" },
] as const;

const PATTERN_OPTIONS = [
  { value: "sequential", label: "Sequential" },
  { value: "multi-mcp", label: "Multi-MCP" },
  { value: "iterative", label: "Iterative" },
  { value: "context-aware", label: "Context-aware" },
  { value: "domain-specific", label: "Domain-specific" },
] as const;

const LICENSE_OPTIONS = ["none", "MIT", "Apache-2.0", "custom"] as const;

const INSERT_SECTIONS: { label: string; content: string }[] = [
  {
    label: "Instructions",
    content:
      "\n## Instructions\n\nDescribe the step-by-step instructions for this skill.\n",
  },
  {
    label: "Steps",
    content:
      "\n## Steps\n\n### Step 1: [Action]\n**Purpose:** [Why]\n\n1. [Action item]\n2. [Action item]\n\n### Step 2: [Action]\n**Purpose:** [Why]\n\n1. [Action item]\n2. [Action item]\n",
  },
  {
    label: "Examples",
    content:
      '\n## Examples\n\n### Example 1: [Scenario]\nUser says: "[example request]"\n\nActions:\n1. [Step 1]\n2. [Step 2]\n\nResult: [Expected output]\n',
  },
  {
    label: "Troubleshooting",
    content:
      "\n## Troubleshooting\n\n### [Common Issue]\n**Cause:** [Why it happens]\n**Solution:** [How to fix]\n",
  },
  {
    label: "When to use",
    content:
      "\n## When to use\n\nUse this skill when the user needs to:\n- [Scenario 1]\n- [Scenario 2]\n- [Scenario 3]\n",
  },
];

const CHECKLIST_CATEGORY_LABELS: Record<string, string> = {
  planning: "Planning",
  development: "Development",
  "pre-upload": "Pre-upload Testing",
  "post-upload": "Post-upload Monitoring",
};


// ─── Component ───────────────────────────────────────────────────────────────

export default function SkillEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { activeOrgId } = useWorkspace();

  // ─── tRPC queries / mutations ────────────────────────────────────────────

  const {
    data: skill,
    isLoading,
    refetch,
  } = trpc.skills.getBySlug.useQuery({ slug, orgId: activeOrgId });
  const { data: projects } = trpc.projects.list.useQuery({ orgId: activeOrgId });
  const utils = trpc.useUtils();

  // Track skill view (once per session)
  const trackUsage = trpc.skills.trackUsage.useMutation();
  const viewTracked = useRef(false);
  useEffect(() => {
    if (skill && !viewTracked.current) {
      viewTracked.current = true;
      trackUsage.mutate({ skillSlug: skill.slug, source: "view" });
    }
  }, [skill?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateMutation = trpc.skills.update.useMutation({
    onSuccess: () => {
      setHasUnsavedChanges(false);
      refetch();
      toast.success("Skill saved");
      if (skill) trackUsage.mutate({ skillSlug: skill.slug, source: "edit" });
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  const filesQuery = trpc.files.list.useQuery(skill?.id ?? "", { enabled: !!skill });
  const filesCount = filesQuery.data?.length ?? 0;

  const addFileMutation = trpc.files.add.useMutation({
    onSuccess: () => {
      filesQuery.refetch();
      toast.success("File added");
    },
    onError: (err) => {
      toast.error(`Failed to add file: ${err.message}`);
    },
  });

  const deleteFileMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      filesQuery.refetch();
      toast.success("File deleted");
    },
    onError: (err) => {
      toast.error(`Failed to delete file: ${err.message}`);
    },
  });

  const deleteMutation = trpc.skills.delete.useMutation({
    onSuccess: () => {
      toast.success("Skill deleted");
      router.push("/skills");
    },
    onError: (err) => {
      toast.error(`Failed to delete: ${err.message}`);
    },
  });

  const rollbackMutation = trpc.skills.rollbackToVersion.useMutation({
    onSuccess: (data) => {
      refetch();
      utils.skills.getBySlug.invalidate({ slug, orgId: activeOrgId });
      // Update local content state to match rolled-back version
      const targetVersion = skill?.versions?.find((v) => v.version === data.version);
      if (targetVersion) {
        setContent(targetVersion.content);
        if (targetVersion.description) setDescription(targetVersion.description);
      }
      setProposedContent(null);
      setProposedChangelog("");
      toast.success(`Rolled back to v${data.version}`);
    },
    onError: (err) => {
      toast.error(`Rollback failed: ${err.message}`);
    },
  });

  // ─── State ───────────────────────────────────────────────────────────────

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [platformHints, setPlatformHints] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [projectId, setProjectId] = useState<string>("");
  const [skillCategory, setSkillCategory] = useState<string>("");
  const [pattern, setPattern] = useState<string>("");
  const [license, setLicense] = useState<string>("");
  const [compatibility, setCompatibility] = useState<string>("");
  const [allowedTools, setAllowedTools] = useState<string>("");
  const [skillMetadata, setSkillMetadata] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [proposedContent, setProposedContent] = useState<string | null>(null);
  const [proposedChangelog, setProposedChangelog] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [aiChatWidth, setAiChatWidth] = useState(380);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"code" | "visual">("code");

  // Issues tab AI
  const [aiFixModel, setAiFixModel] = useState(FAST_MODEL);
  const [fixingIssueIdx, setFixingIssueIdx] = useState<number | null>(null);
  const [pendingFix, setPendingFix] = useState<{ index: number; newContent: string; summary: string } | null>(null);
  const fixIssueMutation = trpc.ai.fixIssue.useMutation();
  const optimizeDescMutation = trpc.ai.optimizeDescription.useMutation();

  // Frontmatter fields parsed from content
  const [fmName, setFmName] = useState("");
  const [fmDescription, setFmDescription] = useState("");
  const [fmLicense, setFmLicense] = useState("");
  const [fmCompatibility, setFmCompatibility] = useState("");
  const [fmAllowedTools, setFmAllowedTools] = useState("");
  const [fmAuthor, setFmAuthor] = useState("");
  const [fmVersion, setFmVersion] = useState("");
  const [fmMcpServer, setFmMcpServer] = useState("");

  // Checklist manual checks
  const [manualChecks, setManualChecks] = useState<Set<string>>(new Set());

  // Files tab
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [fileEditorOpen, setFileEditorOpen] = useState(false);
  const [editFileId, setEditFileId] = useState<string | null>(null);
  const [uploadFolder, setUploadFolder] = useState<string>("references");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewFileQuery = trpc.files.get.useQuery(previewFileId ?? "", { enabled: !!previewFileId });

  // Version dialog
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [selectedVersionContent, setSelectedVersionContent] = useState("");
  const [selectedVersionLabel, setSelectedVersionLabel] = useState("");

  // History tab: expanded version diff
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  // Confirmation dialog (replaces window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  // Quality tab: checklist collapsible
  const [checklistOpen, setChecklistOpen] = useState(true);

  // Refs
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);
  const updatingFromFrontmatterRef = useRef(false);
  const updatingFromEditorRef = useRef(false);

  // ─── Derived state ──────────────────────────────────────────────────────

  const validation: ValidationResult = useMemo(
    () => validateSkill({ name: fmName || name, description: fmDescription || description, content }),
    [fmName, name, fmDescription, description, content]
  );

  const wordCount = useMemo(() => {
    const parsed = parseSkillMd(content);
    const text = parsed?.body ?? content;
    return text.split(/\s+/).filter(Boolean).length;
  }, [content]);

  const issueCount = validation.errors.length + validation.warnings.length;
  const securityResult = useMemo(() => securityScan(content), [content]);
  const allGreen = issueCount === 0 && securityResult.safe;

  // ─── Warn on unsaved changes ─────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // ─── Initialize ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (skill && !initializedRef.current) {
      setName(skill.name);
      setDescription(skill.description ?? "");
      setContent(skill.content ?? "");
      setTags(skill.tags ?? []);
      setPlatformHints(skill.platformHints ?? []);
      setIsActive(skill.isActive ?? true);
      setProjectId(skill.project?.id ?? "");
      setSkillCategory(skill.skillCategory ?? "");
      setPattern(skill.pattern ?? "");
      setLicense(skill.license ?? "");
      setCompatibility(skill.compatibility ?? "");
      setAllowedTools(skill.allowedTools ?? "");
      setSkillMetadata(
        (skill.skillMetadata as Record<string, string>) ?? {}
      );

      // Parse frontmatter from content
      const parsed = parseSkillMd(skill.content ?? "");
      if (parsed) {
        const fm = parsed.frontmatter;
        setFmName((fm.name as string) ?? "");
        setFmDescription((fm.description as string) ?? "");
        setFmLicense((fm.license as string) ?? "");
        setFmCompatibility((fm.compatibility as string) ?? "");
        setFmAllowedTools((fm["allowed-tools"] as string) ?? "");
        const meta = (fm.metadata as Record<string, string>) ?? {};
        setFmAuthor(meta.author ?? "");
        setFmVersion(meta.version ?? "");
        setFmMcpServer(meta["mcp-server"] ?? "");
      }

      initializedRef.current = true;
    }
  }, [skill]);

  // ─── Sync: Monaco content -> frontmatter tab fields ──────────────────────

  useEffect(() => {
    if (!initializedRef.current || updatingFromFrontmatterRef.current) return;
    updatingFromEditorRef.current = true;

    const parsed = parseSkillMd(content);
    if (parsed) {
      const fm = parsed.frontmatter;
      setFmName((fm.name as string) ?? "");
      setFmDescription((fm.description as string) ?? "");
      setFmLicense((fm.license as string) ?? "");
      setFmCompatibility((fm.compatibility as string) ?? "");
      setFmAllowedTools((fm["allowed-tools"] as string) ?? "");
      const meta = (fm.metadata as Record<string, string>) ?? {};
      setFmAuthor(meta.author ?? "");
      setFmVersion(meta.version ?? "");
      setFmMcpServer(meta["mcp-server"] ?? "");
    }

    updatingFromEditorRef.current = false;
  }, [content]);

  // ─── Sync: frontmatter tab fields -> Monaco content ──────────────────────

  const updateContentFromFrontmatter = useCallback(
    (updates: {
      name?: string;
      description?: string;
      license?: string;
      compatibility?: string;
      allowedTools?: string;
      author?: string;
      version?: string;
      mcpServer?: string;
    }) => {
      if (updatingFromEditorRef.current) return;
      updatingFromFrontmatterRef.current = true;

      const n = updates.name ?? fmName;
      const d = updates.description ?? fmDescription;
      const l = updates.license ?? fmLicense;
      const c = updates.compatibility ?? fmCompatibility;
      const at = updates.allowedTools ?? fmAllowedTools;
      const author = updates.author ?? fmAuthor;
      const ver = updates.version ?? fmVersion;
      const mcp = updates.mcpServer ?? fmMcpServer;

      const parsed = parseSkillMd(content);
      const body = parsed?.body ?? "";

      const metadata: Record<string, string> = {};
      if (author) metadata.author = author;
      if (ver) metadata.version = ver;
      if (mcp) metadata["mcp-server"] = mcp;

      const newContent = generateSkillMd({
        name: n,
        description: d,
        license: l && l !== "none" ? l : undefined,
        compatibility: c || undefined,
        allowedTools: at || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        body,
      });

      setContent(newContent);

      // Also sync the top-level name/description used for validation & saving
      if (updates.name !== undefined) setName(n);
      if (updates.description !== undefined) setDescription(d);

      updatingFromFrontmatterRef.current = false;
    },
    [
      content,
      fmName,
      fmDescription,
      fmLicense,
      fmCompatibility,
      fmAllowedTools,
      fmAuthor,
      fmVersion,
      fmMcpServer,
    ]
  );

  // ─── Auto-save ───────────────────────────────────────────────────────────

  const triggerAutoSave = useCallback(() => {
    if (!skill || !initializedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      updateMutation.mutate({
        id: skill.id,
        name,
        slug: skill.slug,
        description,
        content,
        tags,
        platformHints,
        isActive,
        projectId: projectId || undefined,
        skillCategory: skillCategory || undefined,
        pattern: pattern || undefined,
        license: license || undefined,
        compatibility: compatibility || undefined,
        allowedTools: allowedTools || undefined,
        skillMetadata:
          Object.keys(skillMetadata).length > 0 ? skillMetadata : undefined,
      });
    }, 2000);
  }, [
    skill,
    name,
    description,
    content,
    tags,
    platformHints,
    isActive,
    projectId,
    skillCategory,
    pattern,
    license,
    compatibility,
    allowedTools,
    skillMetadata,
    updateMutation,
  ]);

  useEffect(() => {
    if (!initializedRef.current) return;
    setHasUnsavedChanges(true);
    triggerAutoSave();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    name,
    description,
    content,
    tags,
    platformHints,
    isActive,
    projectId,
    skillCategory,
    pattern,
    license,
    compatibility,
    allowedTools,
    skillMetadata,
  ]);

  // ─── AI Propose / Accept / Reject ────────────────────────────────────────

  const handleAIPropose = useCallback((newContent: string, changelog: string) => {
    setProposedContent(newContent);
    setProposedChangelog(changelog);
  }, []);

  const handleAcceptProposal = useCallback(() => {
    if (!proposedContent || !skill) return;
    updateMutation.mutate(
      { id: skill.id, content: proposedContent, changelog: proposedChangelog || "AI edit" },
      {
        onSuccess: () => {
          setContent(proposedContent);
          setProposedContent(null);
          setProposedChangelog("");
          setHasUnsavedChanges(false);
          utils.skills.getBySlug.invalidate({ slug, orgId: activeOrgId });
          toast.success(`Applied: ${proposedChangelog}`);
        },
      }
    );
  }, [proposedContent, proposedChangelog, skill, updateMutation, slug, utils]);

  const handleRejectProposal = useCallback(() => {
    setProposedContent(null);
    setProposedChangelog("");
    toast.info("Change rejected");
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleManualSave = () => {
    if (!skill) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    updateMutation.mutate({
      id: skill.id,
      name,
      slug: skill.slug,
      description,
      content,
      tags,
      platformHints,
      isActive,
      projectId: projectId || undefined,
      skillCategory: skillCategory || undefined,
      pattern: pattern || undefined,
      license: license || undefined,
      compatibility: compatibility || undefined,
      allowedTools: allowedTools || undefined,
      skillMetadata:
        Object.keys(skillMetadata).length > 0 ? skillMetadata : undefined,
    });
  };

  const handleDelete = () => {
    if (!skill) return;
    setConfirmDialog({
      open: true,
      title: "Delete skill",
      description: "Are you sure you want to delete this skill? This cannot be undone.",
      onConfirm: () => {
        deleteMutation.mutate(skill.id);
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  };

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const togglePlatformHint = (hint: string) => {
    if (platformHints.includes(hint)) {
      setPlatformHints(platformHints.filter((h) => h !== hint));
    } else {
      setPlatformHints([...platformHints, hint]);
    }
  };

  const handleInsertSection = (sectionContent: string) => {
    setContent((prev) => prev + sectionContent);
  };

  const handleViewVersion = (version: {
    version: number;
    content: string;
    changelog?: string | null;
  }) => {
    setSelectedVersionContent(version.content);
    setSelectedVersionLabel(`v${version.version}`);
    setVersionDialogOpen(true);
  };

  const handleRestoreVersion = (versionContent: string) => {
    setContent(versionContent);
    setVersionDialogOpen(false);
    toast.info("Version content loaded into editor");
  };

  const toggleManualCheck = (id: string) => {
    setManualChecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ─── Deploy ──────────────────────────────────────────────────────────────

  const targetsQuery = trpc.sync.targets.useQuery();
  const assignmentsQuery = trpc.sync.getAssignments.useQuery();
  const localStateQuery = trpc.sync.getLocalState.useQuery();
  const assignMutation = trpc.sync.assignSkill.useMutation({
    onSuccess: () => {
      assignmentsQuery.refetch();
      toast.success("Skill assigned - will sync on next CLI poll");
    },
    onError: (err) => toast.error(`Assign failed: ${err.message}`),
  });

  function PublishToClawHub({ skill: s }: { skill: { id: string; slug: string; currentVersion: number } }) {
    const [publishing, setPublishing] = useState(false);
    const clawHubStatus = trpc.settings.getClawHubStatus.useQuery();

    if (!clawHubStatus.data?.isSet) return null;

    const handlePublish = async () => {
      const version = prompt("Version to publish (semver):", `1.0.${s.currentVersion}`);
      if (!version) return;
      setPublishing(true);
      try {
        const res = await fetch("/api/clawhub/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillId: s.id, version }),
        });
        const data = await res.json();
        if (data.ok) {
          toast.success(`Published to ClawHub! ${data.url || ""}`);
        } else {
          toast.error(data.error || "Failed to publish");
        }
      } catch (err) {
        toast.error("Failed to publish to ClawHub");
      }
      setPublishing(false);
    };

    return (
      <Button variant="outline" size="sm" onClick={handlePublish} disabled={publishing}>
        {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="mr-1">🦞</span>}
        Publish
      </Button>
    );
  }

  function DeployDropdown({ skillId }: { skillId: string }) {
    const targets = targetsQuery.data ?? [];
    const assignments = (assignmentsQuery.data ?? []).filter((a) => a.skill?.id === skillId);
    const localStates = localStateQuery.data ?? [];
    const pendingCount = assignments.filter(
      (a) => !localStates.some((ls) => ls.platform === a.target?.platform && ls.slug === skill?.slug)
    ).length;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger className={buttonVariants({ variant: pendingCount > 0 ? "default" : "outline", size: "sm" }) + " gap-1"}>
          {assignMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          Deploy
          {pendingCount > 0 && (
            <span className="ml-0.5 bg-white/20 text-[10px] rounded-full px-1.5">{pendingCount}</span>
          )}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          {targets.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No platforms configured -{" "}
              <Link href="/sync" className="text-primary underline">go to Sync</Link>
            </div>
          )}
          {targets.map((t) => {
            const assignment = assignments.find((a) => a.target?.id === t.id);
            const assigned = !!assignment;
            const synced = assigned && localStates.some(
              (ls) => ls.platform === t.platform && ls.slug === skill?.slug
            );
            const deployedVersion = assignment?.deployedVersion;
            const needsUpdate = assigned && deployedVersion != null && skill?.currentVersion != null && deployedVersion < skill.currentVersion;

            return (
              <DropdownMenuItem
                key={t.id}
                onClick={(e) => {
                  if (!assigned) {
                    assignMutation.mutate({ skillId, targetId: t.id, version: skill?.currentVersion });
                  } else if (needsUpdate) {
                    e.preventDefault();
                  }
                }}
                className="flex items-center justify-between"
              >
                <span>{t.label}</span>
                <div className="flex items-center gap-1.5">
                  {assigned && !needsUpdate && synced && (
                    <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 rounded">
                      v{deployedVersion ?? skill?.currentVersion} ✓
                    </span>
                  )}
                  {assigned && !needsUpdate && !synced && (
                    <span className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 rounded">
                      v{deployedVersion} pending
                    </span>
                  )}
                  {needsUpdate && (
                    <>
                      <span className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 rounded">
                        v{deployedVersion} → v{skill?.currentVersion}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          assignMutation.mutate({ skillId, targetId: t.id, version: skill?.currentVersion });
                        }}
                        disabled={assignMutation.isPending}
                        className="text-[10px] font-medium text-amber-600 hover:text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded"
                      >
                        Update
                      </button>
                    </>
                  )}
                  {!assigned && (
                    <span className="text-[10px] font-medium text-primary">Deploy v{skill?.currentVersion}</span>
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}
          <Separator className="my-1" />
          <DropdownMenuItem
            onClick={async () => {
              try {
                const res = await fetch("/api/github/push-skill", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ skillId }),
                });
                const data = await res.json();
                if (res.ok) {
                  toast.success(`Pushed to GitHub`, { description: `${data.repo} - ${data.skill} v${data.version}` });
                } else {
                  toast.error(data.error || "GitHub push failed");
                }
              } catch {
                toast.error("GitHub push failed");
              }
            }}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5">
              <GitBranch className="size-3.5" />
              Push to GitHub
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // ─── Checklist computation ───────────────────────────────────────────────

  const checklistState = useMemo(() => {
    const skillData = { name, description, content };
    const categories = ["planning", "development", "pre-upload", "post-upload"] as const;
    const grouped: Record<string, { item: ChecklistItem; checked: boolean }[]> =
      {};

    let total = 0;
    let checked = 0;

    for (const cat of categories) {
      grouped[cat] = [];
    }

    for (const item of qualityChecklist) {
      const isChecked = item.autoCheck
        ? item.autoCheck(skillData)
        : manualChecks.has(item.id);
      grouped[item.category].push({ item, checked: isChecked });
      total++;
      if (isChecked) checked++;
    }

    return { grouped, total, checked, percentage: Math.round((checked / total) * 100) };
  }, [name, description, content, manualChecks]);

  // ─── Frontmatter preview parsing ────────────────────────────────────────

  const parsedPreview = useMemo(() => parseSkillMd(content), [content]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Skill not found</p>
        <Link
          href="/skills"
          className={buttonVariants({ variant: "ghost" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Skills
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      {/* NOTE: after this header, a flex row wraps editor + AI chat */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/skills"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-64 border-none bg-transparent text-lg font-semibold shadow-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Skill name"
          />

          {/* Validation status - clickable */}
          {issueCount > 0 ? (
            <Popover>
              <PopoverTrigger>
                <div className={`flex items-center gap-1.5 cursor-pointer rounded-md px-2 py-1 transition-colors hover:bg-accent ${validation.errors.length > 0 ? "text-red-400" : "text-amber-400"}`}>
                  {validation.errors.length > 0 ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  <span className="text-xs font-medium">
                    {validation.errors.length > 0
                      ? `${validation.errors.length} error${validation.errors.length !== 1 ? "s" : ""}`
                      : `${validation.warnings.length} warning${validation.warnings.length !== 1 ? "s" : ""}`}
                    {validation.errors.length > 0 && validation.warnings.length > 0
                      ? `, ${validation.warnings.length} warning${validation.warnings.length !== 1 ? "s" : ""}`
                      : ""}
                  </span>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-96 max-h-80 overflow-y-auto p-0" align="start">
                <div className="p-3 border-b border-border">
                  <p className="text-sm font-medium">Validation Issues</p>
                </div>
                <div className="divide-y divide-border">
                  {validation.errors.map((issue, i) => (
                    <div key={`e-${i}`} className="flex gap-2.5 p-3">
                      <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" />
                      <div>
                        <p className="text-xs font-medium text-red-400">{issue.field}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{issue.message}</p>
                      </div>
                    </div>
                  ))}
                  {validation.warnings.map((issue, i) => (
                    <div key={`w-${i}`} className="flex gap-2.5 p-3">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
                      <div>
                        <p className="text-xs font-medium text-amber-400">{issue.field}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{issue.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : securityResult.criticalCount > 0 ? (
            <div className="flex items-center gap-1.5 text-red-400 cursor-pointer rounded-md px-2 py-1 hover:bg-accent" onClick={() => setActivePanel("security")}>
              <Shield className="h-4 w-4" />
              <span className="text-xs font-medium">{securityResult.criticalCount} security flag{securityResult.criticalCount > 1 ? "s" : ""}</span>
            </div>
          ) : securityResult.warningCount > 0 ? (
            <div className="flex items-center gap-1.5 text-amber-400 cursor-pointer rounded-md px-2 py-1 hover:bg-accent" onClick={() => setActivePanel("security")}>
              <Shield className="h-4 w-4" />
              <span className="text-xs font-medium">{securityResult.warningCount} security warn</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium">All clear</span>
            </div>
          )}

          {hasUnsavedChanges && (
            <Badge
              variant="outline"
              className="gap-1 text-xs text-amber-400 border-amber-400/30"
            >
              <Circle className="h-2 w-2 fill-amber-400" />
              Unsaved
            </Badge>
          )}
          {updateMutation.isPending && (
            <Badge
              variant="outline"
              className="gap-1 text-xs text-blue-400 border-blue-400/30"
            >
              <Loader2 className="h-2 w-2 animate-spin" />
              Saving
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            v{skill.currentVersion}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            disabled={updateMutation.isPending || !hasUnsavedChanges}
          >
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/export/${skill.id}`, '_blank')}
          >
            <Download className="mr-2 h-4 w-4" />
            Export ZIP
          </Button>
          <DeployDropdown skillId={skill.id} />
          <PublishToClawHub skill={skill} />
          {/* Panel toggles */}
          <div className="flex items-center gap-1">
            {[
              { id: "details", label: "Details", icon: FileText },
              { id: "quality", label: "Quality", icon: CheckCircle2 },
              { id: "security", label: "Security", icon: Shield },
              { id: "history", label: "History", icon: Clock },
              { id: "files", label: "Files", icon: FolderOpen },
            ].map((panel) => {
              const isSecurityGreen = panel.id === "security" && allGreen;
              return (
                <Button
                  key={panel.id}
                  variant={activePanel === panel.id ? "secondary" : "ghost"}
                  size="sm"
                  className={`h-7 text-xs px-2 ${isSecurityGreen ? "text-emerald-500" : ""}`}
                  onClick={() => setActivePanel(activePanel === panel.id ? null : panel.id)}
                >
                  <panel.icon className="h-3.5 w-3.5 mr-1" />
                  {panel.label}
                </Button>
              );
            })}
          </div>
          <Button
            variant={aiPanelOpen ? "secondary" : "outline"}
            size="sm"
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            AI
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* ─── Deploy status bar ─────────────────────────────────────── */}
      {skill && <DeployStatusBar skillId={skill.id} skillSlug={skill.slug} currentVersion={skill.currentVersion} />}

      {/* ─── Main row: editor area + optional AI chat ──────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ─── Editor column ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 min-w-0">
        {/* ─── Editor layout ──────────────────────────────────────────── */}
        <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[400px]">
          {/* Editor / Visual */}
          <div className="flex flex-1 flex-col overflow-hidden">
          {/* Editor toolbar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-3">
              {/* Mode toggle */}
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => setEditorMode("code")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
                    editorMode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <FileCode className="size-3.5" />
                  Code
                </button>
                <button
                  onClick={() => setEditorMode("visual")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
                    editorMode === "visual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Eye className="size-3.5" />
                  Visual
                </button>
              </div>

              {editorMode === "code" && <DropdownMenu>
                <DropdownMenuTrigger className={buttonVariants({ variant: "outline", size: "sm" }) + " h-7 gap-1 text-xs"}>
                  <Plus className="h-3 w-3" />
                  Insert Section
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {INSERT_SECTIONS.map((section) => (
                    <DropdownMenuItem
                      key={section.label}
                      onClick={() => handleInsertSection(section.content)}
                    >
                      {section.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {editorMode === "code" && <><span>{wordCount} words</span>
              <Separator orientation="vertical" className="h-3" />
              {issueCount > 0 ? (
                <Popover>
                  <PopoverTrigger>
                    <span
                      className={`cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-accent ${
                        validation.errors.length > 0 ? "text-red-400" : "text-amber-400"
                      }`}
                    >
                      {issueCount} issue{issueCount !== 1 ? "s" : ""}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 max-h-64 overflow-y-auto p-0" align="end">
                    <div className="p-2 border-b border-border">
                      <p className="text-xs font-medium">{issueCount} issue{issueCount !== 1 ? "s" : ""} found</p>
                    </div>
                    <div className="divide-y divide-border">
                      {[...validation.errors, ...validation.warnings].map((issue, i) => (
                        <div key={i} className="flex gap-2 p-2">
                          {issue.severity === "error"
                            ? <XCircle className="h-3 w-3 mt-0.5 shrink-0 text-red-400" />
                            : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-400" />
                          }
                          <div>
                            <p className={`text-[11px] font-medium ${issue.severity === "error" ? "text-red-400" : "text-amber-400"}`}>
                              {issue.field}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{issue.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="text-emerald-400">0 issues</span>
              )}
              </>}
            </div>
          </div>

          {/* Validation banner */}
          {issueCount > 0 && (
            <div className={`px-3 py-2 text-sm flex items-center gap-2 border-b ${
              validation.errors.length > 0
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}>
              <AlertTriangle className="size-4 shrink-0" />
              <span className="font-medium">{issueCount} issue{issueCount !== 1 ? "s" : ""} found</span>
              {validation.errors.length > 0 && (
                <span className="text-xs opacity-75">({validation.errors.length} error{validation.errors.length !== 1 ? "s" : ""}, {validation.warnings.length} warning{validation.warnings.length !== 1 ? "s" : ""})</span>
              )}
            </div>
          )}

          {proposedContent !== null && (
            <div className="flex items-center justify-between bg-amber-500/10 border-b border-amber-500/30 px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="size-4 text-amber-500" />
                <span className="font-medium">AI proposed changes</span>
                <span className="text-xs text-muted-foreground">{proposedChangelog}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700" onClick={handleAcceptProposal}>
                  <Check className="size-3.5 mr-1" /> Accept
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={handleRejectProposal}>
                  <X className="size-3.5 mr-1" /> Reject
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {proposedContent !== null ? (
              <MonacoDiffEditor
                original={content}
                modified={proposedContent}
                language="markdown"
                theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                }}
              />
            ) : editorMode === "code" ? (
              <Editor
                height="100%"
                language="markdown"
                theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                value={content}
                onChange={(value) => setContent(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  wordWrap: "on",
                  padding: { top: 16 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  renderWhitespace: "selection",
                  bracketPairColorization: { enabled: true },
                }}
              />
            ) : (
              <div className="h-full overflow-y-auto">
                <SkillVisualView content={content} />
              </div>
            )}
          </div>
        </div>
      </div>{/* closes editor layout */}
      </div>{/* closes editor column */}

      {/* ─── Sheet for panel content ─────────────────────────────── */}
      <Sheet open={activePanel !== null} onOpenChange={(open) => { if (!open) setActivePanel(null); }}>
        <SheetContent side="right" className="w-[92vw] sm:w-[700px] lg:w-[800px] max-w-[92vw] p-0 overflow-hidden">
          <div className="flex flex-col h-full">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-medium capitalize">{activePanel}</h3>
            </div>
            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">

            {/* ─── Preview Panel ──────────────────────────────────── */}
            {activePanel === "preview" && (
              <div>
                <div className="p-6 space-y-4">
                  {parsedPreview ? (
                    <>
                      {/* Frontmatter block */}
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
                          Frontmatter
                        </p>
                        <div className="space-y-1 font-mono text-sm text-foreground/80">
                          {Object.entries(parsedPreview.frontmatter).map(
                            ([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <span className="text-blue-400 shrink-0">
                                  {key}:
                                </span>
                                <span className="text-foreground/70 break-all">
                                  {typeof value === "object"
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* Body */}
                      <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed text-foreground/90">
                        {parsedPreview.body || "(empty body)"}
                      </pre>
                    </>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-foreground/90">
                      {content || "No content yet. Start writing in the editor."}
                    </pre>
                  )}

                  {/* Validation issues */}
                  {(validation.errors.length > 0 ||
                    validation.warnings.length > 0) && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Validation
                      </p>
                      {validation.errors.map((issue, i) => (
                        <div
                          key={`e-${i}`}
                          className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-2 text-sm text-red-400"
                        >
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <span className="font-medium">{issue.field}:</span>{" "}
                            {issue.message}
                          </span>
                        </div>
                      ))}
                      {validation.warnings.map((issue, i) => (
                        <div
                          key={`w-${i}`}
                          className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-sm text-amber-400"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <span className="font-medium">{issue.field}:</span>{" "}
                            {issue.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Details Panel ──────────────────────────────────── */}
            {activePanel === "details" && (
              <div className="p-6 space-y-6">
                <p className="text-xs text-muted-foreground">
                  Edit frontmatter fields and skill metadata. Changes update the editor content automatically.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Left column: frontmatter fields */}
                  <div className="flex flex-col gap-5">
                    {/* name */}
                    <div className="space-y-1.5">
                      <Label htmlFor="fm-name">name</Label>
                      <Input
                        id="fm-name"
                        value={fmName}
                        onChange={(e) => {
                          setFmName(e.target.value);
                          updateContentFromFrontmatter({
                            name: e.target.value,
                          });
                        }}
                        placeholder="my-skill-name"
                        className="font-mono"
                      />
                      {validateSkillName(fmName).map((issue, i) => (
                        <p
                          key={i}
                          className={`text-xs ${
                            issue.severity === "error"
                              ? "text-red-400"
                              : "text-amber-400"
                          }`}
                        >
                          {issue.message}
                        </p>
                      ))}
                    </div>

                    {/* description */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="fm-desc">description</Label>
                        <span
                          className={`text-xs ${
                            fmDescription.length > 1024
                              ? "text-red-400"
                              : fmDescription.length > 250
                              ? "text-amber-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {fmDescription.length}/250
                        </span>
                      </div>
                      <Textarea
                        id="fm-desc"
                        value={fmDescription}
                        onChange={(e) => {
                          setFmDescription(e.target.value);
                          updateContentFromFrontmatter({
                            description: e.target.value,
                          });
                        }}
                        placeholder="Describe what this skill does and when to use it..."
                        className="min-h-20 font-mono text-sm"
                      />
                      {fmDescription.length > 250 && (
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-amber-400">
                            Claude Code reads only the first 250 chars to decide when to trigger this skill. Front-load the key use case.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-xs h-7"
                            disabled={optimizeDescMutation.isPending}
                            onClick={() => {
                              optimizeDescMutation.mutate(
                                { currentDescription: fmDescription, skillName: fmName, skillContent: content, model: aiFixModel },
                                {
                                  onSuccess: (data) => {
                                    setFmDescription(data.description);
                                    updateContentFromFrontmatter({ description: data.description });
                                    toast.success(`Optimized: ${data.description.length}/250 chars`);
                                  },
                                }
                              );
                            }}
                          >
                            <Sparkles className="mr-1 h-3 w-3" />
                            {optimizeDescMutation.isPending ? "Optimizing..." : "Optimize"}
                          </Button>
                        </div>
                      )}
                      {validateDescription(fmDescription).map((issue, i) => (
                        <p
                          key={i}
                          className={`text-xs ${
                            issue.severity === "error"
                              ? "text-red-400"
                              : "text-amber-400"
                          }`}
                        >
                          {issue.message}
                        </p>
                      ))}
                    </div>

                    {/* license */}
                    <div className="space-y-1.5">
                      <Label>license</Label>
                      <Select
                        value={fmLicense || "none"}
                        onValueChange={(v) => {
                          const val = v ?? "none";
                          setFmLicense(val === "none" ? "" : val);
                          updateContentFromFrontmatter({
                            license: val === "none" ? "" : val,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select license" />
                        </SelectTrigger>
                        <SelectContent>
                          {LICENSE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* compatibility */}
                    <div className="space-y-1.5">
                      <Label htmlFor="fm-compat">compatibility</Label>
                      <Textarea
                        id="fm-compat"
                        value={fmCompatibility}
                        onChange={(e) => {
                          setFmCompatibility(e.target.value);
                          updateContentFromFrontmatter({
                            compatibility: e.target.value,
                          });
                        }}
                        placeholder="e.g. Requires my-mcp MCP server connected"
                        className="min-h-12 font-mono text-sm"
                      />
                    </div>

                    {/* allowed-tools */}
                    <div className="space-y-1.5">
                      <Label htmlFor="fm-tools">allowed-tools</Label>
                      <Input
                        id="fm-tools"
                        value={fmAllowedTools}
                        onChange={(e) => {
                          setFmAllowedTools(e.target.value);
                          updateContentFromFrontmatter({
                            allowedTools: e.target.value,
                          });
                        }}
                        placeholder='e.g. "mcp__*", "Read", "Write"'
                        className="font-mono"
                      />
                    </div>
                  </div>

                  {/* Right column: metadata fields */}
                  <div className="flex flex-col gap-5">
                    {/* Tags */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5" />
                        Tags
                      </Label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="cursor-pointer gap-1 hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => removeTag(tag)}
                          >
                            {tag}
                            <X className="h-3 w-3" />
                          </Badge>
                        ))}
                        {tags.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            No tags
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          placeholder="Add tag..."
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTag();
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={addTag}
                        >
                          Add
                        </Button>
                      </div>
                    </div>

                    {/* Platform Hints */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Monitor className="h-3.5 w-3.5" />
                        Platform Hints
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        {PLATFORM_OPTIONS.map((platform) => (
                          <label
                            key={platform}
                            className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                          >
                            <input
                              type="checkbox"
                              checked={platformHints.includes(platform)}
                              onChange={() => togglePlatformHint(platform)}
                              className="sr-only"
                            />
                            {platformHints.includes(platform) ? (
                              <SquareCheck className="h-4 w-4 text-primary" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span>{platform}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Category */}
                    <div className="space-y-1.5">
                      <Label>Skill Category</Label>
                      <Select
                        value={skillCategory || "none"}
                        onValueChange={(v) =>
                          setSkillCategory(v === "none" ? "" : (v ?? ""))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {CATEGORY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Pattern */}
                    <div className="space-y-1.5">
                      <Label>Pattern</Label>
                      <Select
                        value={pattern || "none"}
                        onValueChange={(v) =>
                          setPattern(v === "none" ? "" : (v ?? ""))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select pattern" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {PATTERN_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Bottom row: project, active toggle, metadata fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Project */}
                  <div className="space-y-1.5">
                    <Label>Project</Label>
                    <Select
                      value={projectId}
                      onValueChange={(v) => setProjectId(v ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div className="space-y-0.5">
                      <Label>Active</Label>
                      <p className="text-xs text-muted-foreground">
                        Enable or disable this skill
                      </p>
                    </div>
                    <Switch
                      checked={isActive}
                      onCheckedChange={setIsActive}
                    />
                  </div>
                </div>

                <Separator />

                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Frontmatter Metadata
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* author */}
                  <div className="space-y-1.5">
                    <Label htmlFor="fm-author">author</Label>
                    <Input
                      id="fm-author"
                      value={fmAuthor}
                      onChange={(e) => {
                        setFmAuthor(e.target.value);
                        updateContentFromFrontmatter({
                          author: e.target.value,
                        });
                      }}
                      placeholder="Your Name"
                    />
                  </div>

                  {/* version */}
                  <div className="space-y-1.5">
                    <Label htmlFor="fm-ver">version</Label>
                    <Input
                      id="fm-ver"
                      value={fmVersion}
                      onChange={(e) => {
                        setFmVersion(e.target.value);
                        updateContentFromFrontmatter({
                          version: e.target.value,
                        });
                      }}
                      placeholder="1.0.0"
                      className="font-mono"
                    />
                  </div>

                  {/* mcp-server */}
                  <div className="space-y-1.5">
                    <Label htmlFor="fm-mcp">mcp-server</Label>
                    <Input
                      id="fm-mcp"
                      value={fmMcpServer}
                      onChange={(e) => {
                        setFmMcpServer(e.target.value);
                        updateContentFromFrontmatter({
                          mcpServer: e.target.value,
                        });
                      }}
                      placeholder="service-name"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Quality Panel ──────────────────────────────────── */}
            {activePanel === "quality" && (
              <div className="p-4 space-y-4">
                {/* Issues section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {validation.errors.length > 0 && (
                        <span className="text-red-400">{validation.errors.length} error{validation.errors.length !== 1 ? "s" : ""}</span>
                      )}
                      {validation.errors.length > 0 && validation.warnings.length > 0 && (
                        <span className="text-muted-foreground"> &middot; </span>
                      )}
                      {validation.warnings.length > 0 && (
                        <span className="text-amber-400">{validation.warnings.length} warning{validation.warnings.length !== 1 ? "s" : ""}</span>
                      )}
                      {issueCount === 0 && (
                        <span className="text-emerald-400">No issues</span>
                      )}
                    </p>
                    <Select value={aiFixModel} onValueChange={(v) => v && setAiFixModel(v)}>
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

                  {/* Pending fix diff */}
                  {pendingFix && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-400" />
                        <p className="text-sm font-medium text-emerald-400">{pendingFix.summary}</p>
                      </div>
                      <div className="rounded-md border border-border overflow-hidden max-h-60 overflow-y-auto text-xs">
                        <ReactDiffViewer
                          oldValue={content}
                          newValue={pendingFix.newContent}
                          splitView={false}
                          useDarkTheme={resolvedTheme === "dark"}
                          compareMethod={DiffMethod.LINES}
                          styles={{ contentText: { fontSize: "11px", lineHeight: "1.4" } }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => {
                            updateMutation.mutate(
                              { id: skill!.id, content: pendingFix.newContent, changelog: pendingFix.summary },
                              {
                                onSuccess: () => {
                                  setContent(pendingFix.newContent);
                                  setHasUnsavedChanges(false);
                                  setPendingFix(null);
                                  utils.skills.getBySlug.invalidate({ slug, orgId: activeOrgId });
                                  toast.success(`New version saved: ${pendingFix.summary}`);
                                },
                              }
                            );
                          }}
                        >
                          <Check className="h-3 w-3 mr-1" /> Accept & Save as New Version
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPendingFix(null)}>
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {validation.errors.map((issue, i) => (
                    <div key={`e-${i}`} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-red-400">{issue.field}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{issue.message}</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-red-500/20 text-red-400 hover:bg-red-500/10"
                          disabled={fixingIssueIdx !== null}
                          onClick={async () => {
                            setFixingIssueIdx(i);
                            try {
                              const data = await fixIssueMutation.mutateAsync({
                                content,
                                issueTitle: `${issue.field}: ${issue.message}`,
                                issueFix: issue.message,
                                issueCategory: issue.field,
                                model: aiFixModel,
                              });
                              if (data.content && data.content !== content) {
                                setPendingFix({ index: i, newContent: data.content, summary: data.summary });
                                toast.success("Fix ready - review the diff below");
                              } else {
                                toast.error("AI returned unchanged content. Try rephrasing or use AI chat.");
                              }
                            } catch (err) {
                              toast.error(`AI fix failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                            } finally {
                              setFixingIssueIdx(null);
                            }
                          }}
                        >
                          {fixingIssueIdx === i ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Fixing...</>
                          ) : (
                            <><Sparkles className="h-3 w-3" /> AI Auto-fix</>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Warnings */}
                  {validation.warnings.map((issue, i) => (
                    <div key={`w-${i}`} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-amber-400">{issue.field}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{issue.message}</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-amber-500/20 text-amber-400 hover:bg-amber-500/10"
                          disabled={fixingIssueIdx !== null}
                          onClick={async () => {
                            const idx = validation.errors.length + i;
                            setFixingIssueIdx(idx);
                            try {
                              const data = await fixIssueMutation.mutateAsync({
                                content,
                                issueTitle: `${issue.field}: ${issue.message}`,
                                issueFix: issue.message,
                                issueCategory: issue.field,
                                model: aiFixModel,
                              });
                              if (data.content && data.content !== content) {
                                setPendingFix({ index: idx, newContent: data.content, summary: data.summary });
                                toast.success("Fix ready - review the diff below");
                              } else {
                                toast.error("AI returned unchanged content. Try rephrasing or use AI chat.");
                              }
                            } catch (err) {
                              toast.error(`AI fix failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                            } finally {
                              setFixingIssueIdx(null);
                            }
                          }}
                        >
                          {fixingIssueIdx === validation.errors.length + i ? (
                            <><Loader2 className="h-3 w-3 animate-spin" /> Fixing...</>
                          ) : (
                            <><Sparkles className="h-3 w-3" /> AI Auto-fix</>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}

                  {issueCount === 0 && (
                    <div className="flex items-center gap-2 py-3 text-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      <p className="text-sm font-medium text-emerald-400">No issues found - your skill looks great!</p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Checklist section (collapsible) */}
                <div className="space-y-3">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left"
                    onClick={() => setChecklistOpen(!checklistOpen)}
                  >
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${checklistOpen ? "rotate-90" : ""}`} />
                    <span className="text-sm font-medium">Quality Checklist</span>
                    <span className="text-sm font-mono text-muted-foreground ml-auto">
                      {checklistState.checked}/{checklistState.total} ({checklistState.percentage}%)
                    </span>
                  </button>

                  {/* Progress bar (always visible) */}
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        checklistState.percentage === 100
                          ? "bg-emerald-500"
                          : checklistState.percentage >= 60
                            ? "bg-amber-500"
                            : "bg-red-500"
                      }`}
                      style={{
                        width: `${checklistState.percentage}%`,
                      }}
                    />
                  </div>

                  {checklistOpen && (
                    <div className="space-y-4 pt-2">
                      {(
                        [
                          "planning",
                          "development",
                          "pre-upload",
                          "post-upload",
                        ] as const
                      ).map((cat) => (
                        <div key={cat} className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {CHECKLIST_CATEGORY_LABELS[cat]}
                          </h3>
                          <div className="space-y-1">
                            {checklistState.grouped[cat].map(
                              ({ item, checked }) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                                    checked
                                      ? "text-foreground/70"
                                      : "text-foreground hover:bg-accent/50"
                                  } ${item.autoCheck ? "cursor-default" : "cursor-pointer"}`}
                                  onClick={() => {
                                    if (!item.autoCheck) {
                                      toggleManualCheck(item.id);
                                    }
                                  }}
                                  disabled={!!item.autoCheck}
                                >
                                  {checked ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                  ) : (
                                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                  <span
                                    className={
                                      checked ? "line-through opacity-60" : ""
                                    }
                                  >
                                    {item.label}
                                  </span>
                                  {item.autoCheck && (
                                    <Badge
                                      variant="outline"
                                      className="ml-auto text-[10px] px-1.5 py-0"
                                    >
                                      auto
                                    </Badge>
                                  )}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Security Panel ─────────────────────────────────── */}
            {activePanel === "security" && (
              <div className="p-4 space-y-4">
                <p className="text-sm font-medium">Security Scan</p>
                <p className="text-xs text-muted-foreground">
                  Regex-based pattern matching for common security risks. Scans for shell execution, hardcoded credentials, file deletion, and more.
                </p>
                <SecurityPanel content={content} />
              </div>
            )}

            {/* ─── History Panel ──────────────────────────────────── */}
            {activePanel === "history" && (
              <div>
                <div className="flex flex-col gap-2 p-4">
                  {skill.versions && skill.versions.length > 0 ? (
                    skill.versions.map((version) => {
                      const isExpanded = expandedVersion === version.version;
                      const isCurrent = version.version === skill.currentVersion;
                      return (
                        <Card
                          key={version.id}
                          className="p-0 transition-colors overflow-hidden"
                        >
                          {/* Version header - clickable to expand */}
                          <button
                            type="button"
                            className="w-full text-left p-4 transition-colors hover:bg-accent/50"
                            onClick={() =>
                              setExpandedVersion(isExpanded ? null : version.version)
                            }
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronRight
                                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                                    isExpanded ? "rotate-90" : ""
                                  }`}
                                />
                                <GitBranch className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm font-medium">
                                  v{version.version}
                                </span>
                                {isCurrent && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] h-4 px-1.5"
                                  >
                                    current
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {!isCurrent && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[11px] gap-1 px-2"
                                    disabled={rollbackMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      rollbackMutation.mutate({
                                        skillId: skill.id,
                                        version: version.version,
                                      });
                                    }}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    Rollback to this version
                                  </Button>
                                )}
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {new Date(
                                    version.createdAt
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground ml-6">
                              {version.author && (
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {version.author}
                                </div>
                              )}
                            </div>
                            {(version.changelog || version.description) && (
                              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2 ml-6">
                                {version.changelog || version.description}
                              </p>
                            )}
                            {!version.changelog && !version.description && (
                              <p className="mt-1.5 text-xs text-muted-foreground/50 italic ml-6">
                                No changelog
                              </p>
                            )}
                          </button>

                          {/* Expanded diff section */}
                          {isExpanded && (
                            <VersionDiffBlock
                              skillId={skill.id}
                              version={version.version}
                            />
                          )}
                        </Card>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <GitBranch className="mb-3 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        No version history yet
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        Versions are created when you save changes
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Files Panel ───────────────────────────────────── */}
            {activePanel === "files" && (
              <div className="p-4 space-y-4">
                {/* Upload controls */}
                <div className="flex items-center gap-2">
                  <Select value={uploadFolder} onValueChange={(v) => v && setUploadFolder(v)}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="references">references/</SelectItem>
                      <SelectItem value="scripts">scripts/</SelectItem>
                      <SelectItem value="assets">assets/</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file || !skill) return;
                      const reader = new FileReader();
                      const isText = file.type.startsWith("text/") || /\.(md|txt|json|yaml|yml|xml|csv|js|ts|py|sh|html|css|sql)$/i.test(file.name);
                      if (isText) {
                        reader.onload = () => {
                          addFileMutation.mutate({
                            skillId: skill.id,
                            folder: uploadFolder as "references" | "scripts" | "assets",
                            filename: file.name,
                            content: reader.result as string,
                            mimeType: file.type || "text/plain",
                            size: file.size,
                          });
                        };
                        reader.readAsText(file);
                      } else {
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(",")[1] ?? "";
                          addFileMutation.mutate({
                            skillId: skill.id,
                            folder: uploadFolder as "references" | "scripts" | "assets",
                            filename: file.name,
                            content: base64,
                            mimeType: file.type || "application/octet-stream",
                            size: file.size,
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={addFileMutation.isPending}
                  >
                    {addFileMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Upload
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setEditFileId(null); setFileEditorOpen(true); }}
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    New file
                  </Button>
                </div>

                <Separator />

                {/* File list grouped by folder */}
                {filesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !filesQuery.data || filesQuery.data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FolderOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">No files yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Upload references, scripts, or assets for this skill.</p>
                  </div>
                ) : (
                  (() => {
                    const grouped: Record<string, typeof filesQuery.data> = {};
                    for (const f of filesQuery.data!) {
                      const folder = f.folder || "other";
                      if (!grouped[folder]) grouped[folder] = [];
                      grouped[folder]!.push(f);
                    }
                    return Object.entries(grouped).map(([folder, files]) => (
                      <div key={folder} className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-1">
                          <FolderOpen className="h-3.5 w-3.5" />
                          {folder}/
                        </div>
                        {files!.map((f) => {
                          const isImage = f.mimeType?.startsWith("image/");
                          const isCode = /\.(js|ts|py|sh|sql|json|yaml|yml|xml|html|css)$/i.test(f.filename);
                          const FileIcon = isImage ? Image : isCode ? FileCode : File;
                          const sizeStr = f.size < 1024
                            ? `${f.size} B`
                            : f.size < 1024 * 1024
                            ? `${(f.size / 1024).toFixed(1)} KB`
                            : `${(f.size / (1024 * 1024)).toFixed(1)} MB`;

                          const openHandler = () => {
                            if (isImage) {
                              setPreviewFileId(f.id);
                              setFilePreviewOpen(true);
                            } else {
                              setEditFileId(f.id);
                              setFileEditorOpen(true);
                            }
                          };
                          return (
                            <div
                              key={f.id}
                              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50 hover:border-primary/40 group cursor-pointer transition-colors"
                              onClick={openHandler}
                            >
                              <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="truncate flex-1 font-medium">{f.filename}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{sizeStr}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {new Date(f.createdAt).toLocaleDateString()}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); openHandler(); }}
                                title={isImage ? "Preview" : "Edit"}
                              >
                                {isImage ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDialog({
                                    open: true,
                                    title: "Delete file",
                                    description: `Are you sure you want to delete "${f.filename}"?`,
                                    onConfirm: () => {
                                      deleteFileMutation.mutate(f.id);
                                      setConfirmDialog((prev) => ({ ...prev, open: false }));
                                    },
                                  });
                                }}
                                disabled={deleteFileMutation.isPending}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
              </div>
            )}

            </div>{/* closes panel content */}
          </div>{/* closes flex col */}
        </SheetContent>
      </Sheet>

      {/* File Editor Dialog (text files) */}
      {skill && (
        <FileEditorDialog
          open={fileEditorOpen}
          onOpenChange={(o) => { setFileEditorOpen(o); if (!o) setEditFileId(null); }}
          skillId={skill.id}
          fileId={editFileId}
          onSaved={() => filesQuery.refetch()}
        />
      )}

      {/* File Preview Dialog (images only now) */}
      <Dialog open={filePreviewOpen} onOpenChange={setFilePreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{previewFileQuery.data?.filename ?? "File Preview"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {previewFileQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : previewFileQuery.data?.mimeType?.startsWith("image/") ? (
              <img
                src={`data:${previewFileQuery.data.mimeType};base64,${previewFileQuery.data.content}`}
                alt={previewFileQuery.data.filename}
                className="max-w-full rounded-md"
              />
            ) : (
              <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-mono text-sm">
                {previewFileQuery.data?.content ?? ""}
              </pre>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ─── AI Chat column (inline, resizable, pushes editor narrower) ── */}
      {aiPanelOpen && (
        <div className="group/resize relative shrink-0 h-full" style={{ width: aiChatWidth }}>
          {/* Drag handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startW = aiChatWidth;
              const onMove = (ev: MouseEvent) => {
                const delta = startX - ev.clientX;
                setAiChatWidth(Math.max(300, Math.min(800, startW + delta)));
              };
              const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/30 active:bg-primary/50 transition-colors"
          />
          <AIChatPanel
            skillId={skill?.id}
            skillName={name}
            skillContent={content}
            skillDescription={description}
            issues={[...validation.errors, ...validation.warnings]}
            onProposeEdit={handleAIPropose}
            onApplyContent={(newContent, changelog) => {
              updateMutation.mutate(
                { id: skill!.id, content: newContent, changelog: changelog || "AI chat changes" },
                {
                  onSuccess: () => {
                    setContent(newContent);
                    setHasUnsavedChanges(false);
                    utils.skills.getBySlug.invalidate({ slug, orgId: activeOrgId });
                    toast.success(`New version saved: ${changelog || "AI chat changes"}`);
                  },
                }
              );
            }}
            onApplyDescription={(newDesc) => {
              setDescription(newDesc);
              setHasUnsavedChanges(true);
              toast.success("AI description applied");
            }}
            onClose={() => setAiPanelOpen(false)}
          />
        </div>
      )}

      </div>{/* closes main row */}

      {/* ─── Confirmation Dialog (replaces window.confirm) ──────────── */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription className="pt-2">{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDialog.onConfirm}>
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Version Content Dialog ──────────────────────────────────── */}
      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version {selectedVersionLabel}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-mono text-sm">
              {selectedVersionContent}
            </pre>
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setVersionDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              onClick={() => handleRestoreVersion(selectedVersionContent)}
            >
              Restore this version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
