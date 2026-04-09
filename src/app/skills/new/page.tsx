"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SkillLimitBanner } from "@/components/skill-limit-banner";
import { useWorkspace } from "@/lib/workspace-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  GitBranch,
  Plug,
  Brain,
  RefreshCw,
  ListOrdered,
  Network,
  AlertTriangle,
  CheckCircle,
  Info,
  Sparkles,
  Plus,
  X,
} from "lucide-react";

import {
  skillCategories,
  skillPatterns,
  getTemplatesByCategory,
  type SkillTemplate,
} from "@/lib/skill-templates";
import {
  validateSkillName,
  validateDescription,
  validateSkill,
  qualityChecklist,
  generateSkillMd,
  type ValidationIssue,
} from "@/lib/skill-validation";
import { AI_MODELS, DEFAULT_MODEL } from "@/lib/ai-config";
import { toast } from "sonner";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const STEP_LABELS = [
  "Category & Template",
  "Use Cases & Triggers",
  "YAML Frontmatter",
  "Write Instructions",
  "Review & Create",
] as const;

const LICENSE_OPTIONS = [
  { value: "", label: "None" },
  { value: "MIT", label: "MIT" },
  { value: "Apache-2.0", label: "Apache 2.0" },
  { value: "custom", label: "Custom" },
] as const;

const SECTION_TEMPLATES: { label: string; content: string }[] = [
  {
    label: "Instructions",
    content: "\n## Instructions\n\n### When to use\nUse this skill when the user needs to...\n\n### How it works\n1. \n2. \n3. \n",
  },
  {
    label: "Steps",
    content: "\n## Steps\n\n### Step 1: \n**Purpose:** \n\nActions:\n1. \n2. \n\n**Expected output:** \n**If this fails:** \n\n### Step 2: \n**Purpose:** \n\nActions:\n1. \n2. \n",
  },
  {
    label: "Examples",
    content: '\n## Examples\n\n### Example 1: \nUser says: ""\n\nActions:\n1. \n2. \n\nResult: \n\n### Example 2: \nUser says: ""\n\nResult: \n',
  },
  {
    label: "Troubleshooting",
    content: "\n## Troubleshooting\n\n### Issue: \n**Cause:** \n**Solution:** \n\n### Issue: \n**Cause:** \n**Solution:** \n",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "document-creation": <FileText className="size-6" />,
  "workflow-automation": <GitBranch className="size-6" />,
  "mcp-enhancement": <Plug className="size-6" />,
};

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  FileText: <FileText className="size-5" />,
  ListOrdered: <ListOrdered className="size-5" />,
  Plug: <Plug className="size-5" />,
  RefreshCw: <RefreshCw className="size-5" />,
  Brain: <Brain className="size-5" />,
  Network: <Network className="size-5" />,
  GitBranch: <GitBranch className="size-5" />,
  Workflow: <GitBranch className="size-5" />,
};

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewSkillPage() {
  const router = useRouter();
  const { activeOrgId } = useWorkspace();

  // Wizard step
  const [step, setStep] = useState(0);

  // Step 1: Category & Template
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SkillTemplate | null>(null);

  // Step 2: Use Cases & Triggers
  const [skillTitle, setSkillTitle] = useState("");
  const [mainDescription, setMainDescription] = useState("");
  const [useCase1, setUseCase1] = useState("");
  const [useCase2, setUseCase2] = useState("");
  const [useCase3, setUseCase3] = useState("");
  const [triggerPhrases, setTriggerPhrases] = useState("");

  // Step 3: YAML Frontmatter
  const [skillName, setSkillName] = useState("");
  const [skillNameManual, setSkillNameManual] = useState(false);
  const [license, setLicense] = useState("");
  const [compatibility, setCompatibility] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [metaAuthor, setMetaAuthor] = useState("");
  const [metaVersion, setMetaVersion] = useState("1.0.0");
  const [metaMcpServer, setMetaMcpServer] = useState("");
  const [metaCategory, setMetaCategory] = useState("");
  const [metaTags, setMetaTags] = useState("");

  // Step 4: Instructions body
  const [body, setBody] = useState("");

  // Step 5: Review
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [platformHints, setPlatformHints] = useState<string[]>([]);
  const [tagsInput, setTagsInput] = useState("");

  // Data
  const projectsQuery = trpc.projects.list.useQuery({ orgId: activeOrgId });
  const projects = projectsQuery.data ?? [];

  const createMutation = trpc.skills.create.useMutation({
    onSuccess: (data) => {
      router.push(`/skills/${data?.slug ?? ""}`);
    },
  });

  // AI
  const [aiModel, setAiModel] = useState(DEFAULT_MODEL);
  const suggestTriggersMutation = trpc.ai.suggestTriggers.useMutation();
  const improveDescMutation = trpc.ai.improveDescription.useMutation();
  const optimizeDescMutation = trpc.ai.optimizeDescription.useMutation();
  const improveSkillMutation = trpc.ai.improveSkill.useMutation();

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const categoryTemplates = useMemo(
    () => (selectedCategory ? getTemplatesByCategory(selectedCategory) : []),
    [selectedCategory],
  );

  // Build the full description (WHAT + WHEN) for frontmatter
  const fullDescription = useMemo(() => {
    let desc = mainDescription;
    const triggers = triggerPhrases
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (triggers.length > 0) {
      desc += ` Use when user says ${triggers.map((t) => `"${t}"`).join(", ")}.`;
    }
    return desc;
  }, [mainDescription, triggerPhrases]);

  const descriptionIssues = useMemo(
    () => validateDescription(fullDescription),
    [fullDescription],
  );

  const nameIssues = useMemo(
    () => validateSkillName(skillName),
    [skillName],
  );

  // Build metadata record
  const metadata = useMemo(() => {
    const m: Record<string, string> = {};
    if (metaAuthor) m.author = metaAuthor;
    if (metaVersion) m.version = metaVersion;
    if (metaMcpServer) m["mcp-server"] = metaMcpServer;
    if (metaCategory) m.category = metaCategory;
    if (metaTags) m.tags = metaTags;
    return m;
  }, [metaAuthor, metaVersion, metaMcpServer, metaCategory, metaTags]);

  // Generate the YAML frontmatter preview
  const yamlPreview = useMemo(() => {
    const lines: string[] = ["---"];
    lines.push(`name: ${skillName || "my-skill"}`);
    const desc = fullDescription || "Description goes here";
    if (desc.length > 80 || desc.includes("\n")) {
      lines.push("description: >");
      desc.split("\n").forEach((l) => lines.push(`  ${l.trim()}`));
    } else {
      lines.push(`description: ${desc}`);
    }
    if (license) lines.push(`license: ${license}`);
    if (compatibility) lines.push(`compatibility: ${compatibility}`);
    if (allowedTools) lines.push(`allowed-tools: "${allowedTools}"`);
    if (Object.keys(metadata).length > 0) {
      lines.push("metadata:");
      for (const [k, v] of Object.entries(metadata)) {
        lines.push(`  ${k}: ${v}`);
      }
    }
    lines.push("---");
    return lines.join("\n");
  }, [skillName, fullDescription, license, compatibility, allowedTools, metadata]);

  // Full SKILL.md content
  const fullContent = useMemo(
    () =>
      generateSkillMd({
        name: skillName,
        description: fullDescription,
        license: license || undefined,
        compatibility: compatibility || undefined,
        allowedTools: allowedTools || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        body,
      }),
    [skillName, fullDescription, license, compatibility, allowedTools, metadata, body],
  );

  // Validation for the full skill
  const validationResult = useMemo(
    () =>
      validateSkill({
        name: skillName,
        description: fullDescription,
        content: fullContent,
      }),
    [skillName, fullDescription, fullContent],
  );

  const wordCount = useMemo(() => countWords(body), [body]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSelectCategory(catId: string) {
    setSelectedCategory(catId);
    setSelectedTemplate(null);
    // Pre-fill metadata category
    setMetaCategory(catId);
  }

  function handleSelectTemplate(template: SkillTemplate) {
    setSelectedTemplate(template);
    // Pre-fill fields from template
    setSkillName(template.frontmatter.name);
    setSkillNameManual(false);
    setMainDescription(template.frontmatter.description);
    if (template.frontmatter.license) setLicense(template.frontmatter.license);
    if (template.frontmatter.compatibility) setCompatibility(template.frontmatter.compatibility);
    if (template.frontmatter.allowedTools) setAllowedTools(template.frontmatter.allowedTools);
    if (template.frontmatter.metadata) {
      const m = template.frontmatter.metadata;
      if (m.author) setMetaAuthor(m.author);
      if (m.version) setMetaVersion(m.version);
      if (m["mcp-server"]) setMetaMcpServer(m["mcp-server"]);
      if (m.category) setMetaCategory(m.category);
      if (m.tags) setMetaTags(m.tags);
    }
    setBody(template.body);
  }

  function handleStartFromScratch() {
    setSelectedTemplate(null);
    setBody("# My Skill\n\n# Instructions\n\n## When to use\n\n## Steps\n\n## Examples\n\n## Troubleshooting\n");
  }

  function handleSkillTitleChange(value: string) {
    setSkillTitle(value);
    if (!skillNameManual) {
      setSkillName(slugify(value));
    }
  }

  function handleSkillNameChange(value: string) {
    setSkillNameManual(true);
    setSkillName(value);
  }

  function togglePlatform(platform: string) {
    setPlatformHints((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    );
  }

  function toggleCheckItem(id: string) {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const insertSection = useCallback(
    (content: string) => {
      setBody((prev) => prev + content);
    },
    [],
  );

  function handleCreate() {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const skillMetadata = Object.keys(metadata).length > 0 ? metadata : undefined;

    createMutation.mutate({
      name: skillTitle || skillName,
      slug: skillName,
      description: fullDescription,
      content: fullContent,
      projectId: projectId || undefined,
      tags,
      platformHints,
      license: license || undefined,
      compatibility: compatibility || undefined,
      allowedTools: allowedTools || undefined,
      skillMetadata,
      skillCategory: selectedCategory || undefined,
      pattern: selectedTemplate?.pattern || undefined,
      orgId: activeOrgId,
    });
  }

  // Can advance?
  function canAdvance(): boolean {
    switch (step) {
      case 0:
        return selectedCategory !== null;
      case 1:
        return mainDescription.trim().length > 0;
      case 2:
        return skillName.length > 0 && nameIssues.filter((i) => i.severity === "error").length === 0;
      case 3:
        return body.trim().length > 0;
      case 4:
        return validationResult.valid;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderIssueInline(issues: ValidationIssue[]) {
    if (issues.length === 0) return null;
    return (
      <div className="flex flex-col gap-1 mt-1.5">
        {issues.map((issue, i) => (
          <div
            key={i}
            className={`flex items-start gap-1.5 text-xs ${
              issue.severity === "error"
                ? "text-destructive"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {issue.severity === "error" ? (
              <X className="size-3 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="size-3 mt-0.5 shrink-0" />
            )}
            <span>{issue.message}</span>
          </div>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step indicator
  // ---------------------------------------------------------------------------

  function renderStepIndicator() {
    return (
      <div className="flex items-center gap-1">
        {STEP_LABELS.map((label, i) => {
          const isActive = i === step;
          const isCompleted = i < step;
          return (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => {
                  if (i < step) setStep(i);
                }}
                disabled={i > step}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-muted text-foreground cursor-pointer hover:bg-muted/80"
                      : "text-muted-foreground cursor-default"
                }`}
              >
                <span
                  className={`flex size-4 items-center justify-center rounded-full text-[10px] font-bold ${
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "bg-primary-foreground text-primary"
                        : "bg-muted-foreground/20 text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="size-2.5" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 1: Category & Template
  // ---------------------------------------------------------------------------

  function renderStep1() {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold">Choose a Category</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select the type of skill you want to create.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {skillCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                className={`group text-left rounded-xl p-5 ring-1 transition-all ${
                  isSelected
                    ? "ring-2 ring-primary bg-primary/5"
                    : "ring-foreground/10 bg-card hover:ring-foreground/20 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={`flex size-10 items-center justify-center rounded-lg ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {CATEGORY_ICONS[cat.id]}
                  </div>
                  {isSelected && (
                    <Check className="size-4 text-primary ml-auto" />
                  )}
                </div>
                <h3 className="font-medium text-sm">{cat.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{cat.description}</p>
                <p className="text-xs text-muted-foreground/70 mt-2 italic">{cat.examples}</p>
              </button>
            );
          })}
        </div>

        {selectedCategory && (
          <>
            <Separator />

            <div>
              <h2 className="text-lg font-semibold">Choose a Template</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start with a pre-built template or begin from scratch.
              </p>
            </div>

            {/* Patterns info */}
            <div className="flex flex-wrap gap-2">
              {skillPatterns
                .filter((p) => p.id !== "general")
                .map((pattern) => (
                  <div
                    key={pattern.id}
                    className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                  >
                    <GitBranch className="size-3 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <span className="font-medium">{pattern.name}:</span>{" "}
                      <span className="text-muted-foreground">{pattern.useWhen}</span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Start from scratch */}
              <button
                type="button"
                onClick={() => {
                  handleStartFromScratch();
                  setStep(1);
                }}
                className="group text-left rounded-xl p-4 ring-1 ring-foreground/10 bg-card hover:ring-foreground/20 hover:bg-muted/50 transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Plus className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">Start from Scratch</h3>
                    <p className="text-xs text-muted-foreground">Blank template with recommended structure</p>
                  </div>
                </div>
              </button>

              {categoryTemplates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      handleSelectTemplate(template);
                      setStep(1);
                    }}
                    className={`group text-left rounded-xl p-4 ring-1 transition-all ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/5"
                        : "ring-foreground/10 bg-card hover:ring-foreground/20 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`flex size-9 items-center justify-center rounded-lg ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {TEMPLATE_ICONS[template.icon] ?? <FileText className="size-5" />}
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">{template.name}</h3>
                        <Badge variant="secondary" className="mt-0.5">
                          {skillPatterns.find((p) => p.id === template.pattern)?.name ?? template.pattern}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{template.description}</p>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 2: Use Cases & Triggers
  // ---------------------------------------------------------------------------

  function renderStep2() {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <div>
          <h2 className="text-lg font-semibold">Define Use Cases & Triggers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Describe what the skill does and when it should activate.
          </p>
        </div>

        {/* Skill title */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="skill-title">Skill Title</Label>
          <Input
            id="skill-title"
            placeholder="e.g. Sprint Planning Assistant"
            value={skillTitle}
            onChange={(e) => handleSkillTitleChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            A human-readable name. The kebab-case slug will be auto-generated.
          </p>
        </div>

        {/* Main description */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="main-desc">What does this skill do?</Label>
            <span
              className={`text-xs ${
                mainDescription.length > 1024
                  ? "text-red-400"
                  : mainDescription.length > 250
                  ? "text-amber-400"
                  : "text-muted-foreground"
              }`}
            >
              {mainDescription.length}/250
            </span>
          </div>
          <Textarea
            id="main-desc"
            placeholder="Describe the core purpose. E.g. 'Automates sprint planning by breaking down epics into stories and tasks, estimating effort, and creating Linear issues.'"
            value={mainDescription}
            onChange={(e) => setMainDescription(e.target.value)}
            rows={3}
          />
          {mainDescription.length > 250 && (
            <p className="text-xs text-amber-400">
              Claude Code reads only the first 250 characters to decide when to trigger this skill. Front-load the key use case or use &quot;Optimize for Claude Code&quot; below.
            </p>
          )}
          {renderIssueInline(descriptionIssues)}
        </div>

        {/* Use cases */}
        <div className="flex flex-col gap-3">
          <Label>Concrete Use Cases</Label>
          <Input
            placeholder="Use case 1: e.g. 'Planning a 2-week sprint from a list of epics'"
            value={useCase1}
            onChange={(e) => setUseCase1(e.target.value)}
          />
          <Input
            placeholder="Use case 2: e.g. 'Breaking a large feature into smaller tasks'"
            value={useCase2}
            onChange={(e) => setUseCase2(e.target.value)}
          />
          <Input
            placeholder="Use case 3: e.g. 'Estimating story points for backlog items'"
            value={useCase3}
            onChange={(e) => setUseCase3(e.target.value)}
          />
        </div>

        {/* Trigger phrases */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="triggers">Trigger Phrases</Label>
          <Input
            id="triggers"
            placeholder="help me plan this sprint, create sprint tasks, break down this epic"
            value={triggerPhrases}
            onChange={(e) => setTriggerPhrases(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated phrases that should activate this skill.
          </p>
        </div>

        {/* AI Assist buttons */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Select value={aiModel} onValueChange={(v) => v && setAiModel(v)}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!mainDescription || improveDescMutation.isPending}
            onClick={() => {
              improveDescMutation.mutate(
                { currentDescription: mainDescription, skillName: skillTitle || skillName, model: aiModel },
                { onSuccess: (data) => { setMainDescription(data.description); toast.success("Description improved by AI"); } }
              );
            }}
          >
            <Sparkles className="mr-1 h-3 w-3" />
            {improveDescMutation.isPending ? "Improving..." : "AI Improve Description"}
          </Button>
          {mainDescription.length > 250 && (
            <Button
              variant="outline"
              size="sm"
              disabled={!mainDescription || optimizeDescMutation.isPending}
              onClick={() => {
                optimizeDescMutation.mutate(
                  { currentDescription: mainDescription, skillName: skillTitle || skillName, model: aiModel },
                  { onSuccess: (data) => { setMainDescription(data.description); toast.success(`Description optimized: ${data.description.length}/250 chars`); } }
                );
              }}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {optimizeDescMutation.isPending ? "Optimizing..." : "Optimize for Claude Code (250 chars)"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!mainDescription || suggestTriggersMutation.isPending}
            onClick={() => {
              suggestTriggersMutation.mutate(
                { skillName: skillTitle || skillName, description: mainDescription, model: aiModel },
                { onSuccess: (data) => { setTriggerPhrases(data.triggers.join(", ")); toast.success(`${data.triggers.length} triggers suggested`); } }
              );
            }}
          >
            <Sparkles className="mr-1 h-3 w-3" />
            {suggestTriggersMutation.isPending ? "Suggesting..." : "AI Suggest Triggers"}
          </Button>
        </div>

        {/* Tip box */}
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
          <Info className="size-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="text-xs text-blue-800 dark:text-blue-300">
            <p className="font-medium mb-1">Writing effective triggers</p>
            <p>
              Include specific tasks users might say. Good triggers:{" "}
              <span className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">
                &quot;help me plan this sprint&quot;
              </span>
              ,{" "}
              <span className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">
                &quot;create sprint tasks&quot;
              </span>
              . Bad triggers:{" "}
              <span className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">
                &quot;help with projects&quot;
              </span>{" "}
              (too vague).
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 3: YAML Frontmatter
  // ---------------------------------------------------------------------------

  function renderStep3() {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Form fields */}
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-semibold">YAML Frontmatter</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure the metadata that goes at the top of your SKILL.md file.
            </p>
          </div>

          {/* Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="fm-name">
              name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="fm-name"
              placeholder="my-skill-name"
              value={skillName}
              onChange={(e) => handleSkillNameChange(e.target.value)}
              className="font-mono text-sm"
            />
            {renderIssueInline(nameIssues)}
          </div>

          {/* Description (pre-filled) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="fm-desc">
              description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="fm-desc"
              value={fullDescription}
              onChange={(e) => setMainDescription(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Pre-filled from Step 2. Edit here to refine.
            </p>
            {renderIssueInline(descriptionIssues)}
          </div>

          {/* License */}
          <div className="flex flex-col gap-2">
            <Label>license (optional)</Label>
            <Select value={license} onValueChange={(v) => setLicense(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No license" />
              </SelectTrigger>
              <SelectContent>
                {LICENSE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value || "__none"} value={opt.value || "__none"}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Compatibility */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="fm-compat">compatibility (optional)</Label>
            <Input
              id="fm-compat"
              placeholder="e.g. Requires linear MCP server"
              value={compatibility}
              onChange={(e) => setCompatibility(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Allowed tools */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="fm-tools">allowed-tools (optional)</Label>
            <Input
              id="fm-tools"
              placeholder='e.g. Bash(python:*) WebFetch'
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <Separator />

          <h3 className="text-sm font-medium">Metadata (all optional)</h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-author" className="text-xs">author</Label>
              <Input
                id="meta-author"
                placeholder="Your Name"
                value={metaAuthor}
                onChange={(e) => setMetaAuthor(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-version" className="text-xs">version</Label>
              <Input
                id="meta-version"
                placeholder="1.0.0"
                value={metaVersion}
                onChange={(e) => setMetaVersion(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-mcp" className="text-xs">mcp-server</Label>
              <Input
                id="meta-mcp"
                placeholder="service-name"
                value={metaMcpServer}
                onChange={(e) => setMetaMcpServer(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-cat" className="text-xs">category</Label>
              <Input
                id="meta-cat"
                placeholder="workflow-automation"
                value={metaCategory}
                onChange={(e) => setMetaCategory(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meta-tags" className="text-xs">tags</Label>
            <Input
              id="meta-tags"
              placeholder="sprint-planning, agile, linear"
              value={metaTags}
              onChange={(e) => setMetaTags(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        {/* Right: YAML preview */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Live Frontmatter Preview</h3>
          <div className="rounded-lg border bg-muted/30 p-4 font-mono text-xs leading-relaxed overflow-auto max-h-[600px]">
            <pre className="whitespace-pre-wrap">{yamlPreview}</pre>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 4: Write Instructions
  // ---------------------------------------------------------------------------

  function renderStep4() {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Write Instructions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The main body of your SKILL.md. This is what Claude reads to understand your skill.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span
              className={
                wordCount > 5000
                  ? "text-amber-600 dark:text-amber-400 font-medium"
                  : ""
              }
            >
              {wordCount.toLocaleString()} words
            </span>
            {wordCount > 5000 && <AlertTriangle className="size-3" />}
          </div>
        </div>

        {/* Section badges */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground py-1">Insert section:</span>
          {SECTION_TEMPLATES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => insertSection(s.content)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Plus className="size-3" />
              {s.label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!body || improveSkillMutation.isPending}
            onClick={() => {
              const fullContent = generateSkillMd({
                name: skillName || "my-skill",
                description: fullDescription,
                license: license || undefined,
                compatibility: compatibility || undefined,
                allowedTools: allowedTools || undefined,
                metadata: Object.fromEntries(
                  Object.entries({ author: metaAuthor, version: metaVersion, "mcp-server": metaMcpServer }).filter(([, v]) => v)
                ),
                body,
              });
              improveSkillMutation.mutate(
                { content: fullContent, focusArea: "instructions, examples, and error handling", model: aiModel },
                {
                  onSuccess: (data) => {
                    // Extract body from improved content
                    const match = data.content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
                    if (match) { setBody(match[1].trim()); } else { setBody(data.content); }
                    toast.success("Instructions improved by AI");
                  },
                }
              );
            }}
          >
            <Sparkles className="mr-1 h-3 w-3" />
            {improveSkillMutation.isPending ? "AI improving..." : "AI Improve Instructions"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          {/* Editor */}
          <div className="rounded-lg border overflow-hidden min-h-[500px]">
            <Editor
              height="500px"
              defaultLanguage="markdown"
              value={body}
              onChange={(value) => setBody(value ?? "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                lineNumbers: "on",
                wordWrap: "on",
                fontSize: 13,
                padding: { top: 12 },
                scrollBeyondLastLine: false,
              }}
            />
          </div>

          {/* Tips panel */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h3 className="text-sm font-medium">Best Practices</h3>
            </div>
            <Separator />
            <div className="flex flex-col gap-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <CheckCircle className="size-3 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
                <span><span className="font-medium text-foreground">Be specific and actionable.</span> Tell Claude exactly what to do, not just what the skill is about.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="size-3 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
                <span><span className="font-medium text-foreground">Include error handling.</span> Add troubleshooting sections for common failure modes.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="size-3 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
                <span><span className="font-medium text-foreground">Reference bundled resources clearly.</span> Use relative paths like <code className="bg-muted px-1 rounded">references/style-guide.md</code>.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="size-3 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
                <span><span className="font-medium text-foreground">Keep SKILL.md under 5,000 words.</span> Move detailed references to separate files.</span>
              </div>
              <Separator />
              <div className="flex items-start gap-2">
                <Info className="size-3 mt-0.5 text-blue-500 shrink-0" />
                <span>Use headings (#, ##, ###) to structure your skill into clear sections.</span>
              </div>
              <div className="flex items-start gap-2">
                <Info className="size-3 mt-0.5 text-blue-500 shrink-0" />
                <span>Include at least one concrete example showing input and expected output.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Step 5: Review & Quality Checklist
  // ---------------------------------------------------------------------------

  function renderStep5() {
    const skillObj = { name: skillName, description: fullDescription, content: fullContent };

    const checklistGroups = [
      { key: "planning" as const, label: "Planning" },
      { key: "development" as const, label: "Development" },
      { key: "pre-upload" as const, label: "Pre-upload Testing" },
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: Preview */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">Review SKILL.md</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Review the complete file before creating your skill.
            </p>
          </div>

          <div className="rounded-lg border overflow-hidden min-h-[500px]">
            <Editor
              height="500px"
              defaultLanguage="yaml"
              value={fullContent}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                lineNumbers: "on",
                wordWrap: "on",
                fontSize: 13,
                padding: { top: 12 },
                scrollBeyondLastLine: false,
              }}
            />
          </div>

          {/* Validation summary */}
          {(validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
            <div className="flex flex-col gap-2">
              {validationResult.errors.map((e, i) => (
                <div
                  key={`e-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                >
                  <X className="size-3 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">{e.field}:</span> {e.message}
                  </span>
                </div>
              ))}
              {validationResult.warnings.map((w, i) => (
                <div
                  key={`w-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-amber-300/30 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-400"
                >
                  <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">{w.field}:</span> {w.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {validationResult.valid && validationResult.warnings.length === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-300/30 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-800/30 dark:bg-green-950/20 dark:text-green-400">
              <CheckCircle className="size-3.5 shrink-0" />
              <span className="font-medium">All validations pass.</span>
            </div>
          )}
        </div>

        {/* Right: Checklist + settings */}
        <ScrollArea className="max-h-[700px]">
          <div className="flex flex-col gap-5 pr-2">
            {/* Quality checklist */}
            <div>
              <h3 className="text-sm font-medium mb-3">Quality Checklist</h3>
              {checklistGroups.map((group) => {
                const items = qualityChecklist.filter((c) => c.category === group.key);
                return (
                  <div key={group.key} className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {items.map((item) => {
                        const autoResult = item.autoCheck ? item.autoCheck(skillObj) : null;
                        const isChecked = autoResult !== null ? autoResult : (checkedItems[item.id] ?? false);
                        const isAuto = autoResult !== null;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (!isAuto) toggleCheckItem(item.id);
                            }}
                            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
                              isAuto
                                ? "cursor-default"
                                : "cursor-pointer hover:bg-muted/50"
                            }`}
                          >
                            <span
                              className={`flex size-4 items-center justify-center rounded border shrink-0 ${
                                isChecked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border"
                              }`}
                            >
                              {isChecked && <Check className="size-2.5" />}
                            </span>
                            <span className={isChecked ? "text-foreground" : "text-muted-foreground"}>
                              {item.label}
                            </span>
                            {isAuto && (
                              <Badge variant="secondary" className="ml-auto text-[10px]">
                                auto
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            {/* Project */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Project (optional)</Label>
              <Select
                value={projectId ?? "__none"}
                onValueChange={(value) => setProjectId(value === "__none" ? null : value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <span
                        className="inline-block size-2 rounded-full mr-1.5"
                        style={{ backgroundColor: project.color ?? undefined }}
                      />
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="final-tags" className="text-xs">Tags</Label>
              <Input
                id="final-tags"
                placeholder="react, typescript (comma-separated)"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Platform hints */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Platform Hints</Label>
              <div className="flex flex-wrap gap-1.5">
                {PLATFORM_OPTIONS.map((platform) => {
                  const isSelected = platformHints.includes(platform);
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => togglePlatform(platform)}
                      className={`inline-flex h-7 items-center rounded-md border px-2 text-xs transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {platform}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  const steps = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/skills"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create New Skill
          </h1>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {STEP_LABELS.length}
          </p>
        </div>
      </div>

      <SkillLimitBanner />

      {/* Step indicator */}
      <div className="overflow-x-auto pb-1">
        {renderStepIndicator()}
      </div>

      <Separator />

      {/* Step content */}
      <div className="flex-1">{steps[step]()}</div>

      {/* Error */}
      {createMutation.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {createMutation.error.message}
        </div>
      )}

      {/* Navigation */}
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft className="size-4 mr-1.5" />
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/skills"
            className={buttonVariants({ variant: "ghost" })}
          >
            Cancel
          </Link>
          {step < STEP_LABELS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance()}
            >
              Next
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!validationResult.valid || createMutation.isPending}
            >
              {createMutation.isPending ? (
                "Creating..."
              ) : (
                <>
                  <Sparkles className="size-4 mr-1.5" />
                  Create Skill
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
