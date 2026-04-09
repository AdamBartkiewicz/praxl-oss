"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe,
  Download,
  Loader2,
  CheckCircle2,
  FileText,
  FolderOpen,
  ExternalLink,
  Terminal,
  Package,
  ClipboardPaste,
} from "lucide-react";
import { SecurityPanel } from "@/components/security-badge";
import { useWorkspace } from "@/lib/workspace-context";

interface InstallSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled?: () => void;
  defaultCommand?: string;
  defaultPaste?: { content: string; source: string };
}

interface FetchedSkill {
  name: string;
  slug: string;
  description: string;
  content: string;
  files: { folder: string; filename: string; content: string; mimeType: string; size: number }[];
  source: string;
}

export function InstallSkillDialog({ open, onOpenChange, onInstalled, defaultCommand, defaultPaste }: InstallSkillDialogProps) {
  const { activeOrgId } = useWorkspace();
  const [command, setCommand] = useState(defaultCommand ?? "");
  const [pasteContent, setPasteContent] = useState("");
  const [mode, setMode] = useState<"command" | "paste">(defaultPaste ? "paste" : "command");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultCommand) setCommand(defaultCommand);
  }, [defaultCommand]);

  // Auto-parse pasted ClawHub content
  const [autoParsePending, setAutoParsePending] = useState(false);
  useEffect(() => {
    if (defaultPaste?.content && open) {
      setMode("paste");
      setPasteContent(defaultPaste.content);
      setAutoParsePending(true);
    }
  }, [defaultPaste?.content, open]);
  useEffect(() => {
    if (autoParsePending && pasteContent) {
      setAutoParsePending(false);
      handlePaste();
    }
  }, [autoParsePending, pasteContent]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fetchedSkill, setFetchedSkill] = useState<FetchedSkill | null>(null);
  const [installed, setInstalled] = useState(false);

  const createSkill = trpc.skills.create.useMutation();
  const bulkAddFiles = trpc.files.bulkAdd.useMutation();

  function reset() {
    setCommand("");
    setPasteContent("");
    setFetchedSkill(null);
    setInstalled(false);
    setLoading(false);
  }

  function handlePaste() {
    const content = pasteContent.trim();
    if (!content || !content.includes("---")) {
      toast.error("Content must be a valid SKILL.md with YAML frontmatter (---)");
      return;
    }

    // Parse frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const yaml = fmMatch?.[1] || "";
    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    const descMatch = yaml.match(/^description:\s*(.+)$/m);
    const slug = nameMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "imported-skill";
    const description = descMatch?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
    const displayName = slug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    setFetchedSkill({
      name: displayName,
      slug,
      description,
      content,
      files: [],
      source: "Pasted from skills.sh",
    });
  }

  async function handleFetch() {
    const trimmed = command.trim();
    if (!trimmed) return;

    setLoading(true);
    setFetchedSkill(null);
    setInstalled(false);

    try {
      const res = await fetch("/api/install-skill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to fetch skill");
        setLoading(false);
        return;
      }

      setFetchedSkill(data.skill);
    } catch {
      toast.error("Failed to fetch skill from repository");
    }
    setLoading(false);
  }

  async function handleInstall() {
    if (!fetchedSkill) return;
    setLoading(true);

    try {
      const result = await createSkill.mutateAsync({
        name: fetchedSkill.name,
        slug: fetchedSkill.slug,
        description: fetchedSkill.description,
        content: fetchedSkill.content,
        orgId: activeOrgId,
      });

      // Save reference files
      if (fetchedSkill.files.length > 0 && result?.id) {
        await bulkAddFiles.mutateAsync({
          files: fetchedSkill.files.map((f) => ({
            skillId: result.id!,
            folder: f.folder,
            filename: f.filename,
            content: f.content,
            mimeType: f.mimeType,
            size: f.size,
          })),
        });
      }

      setInstalled(true);
      toast.success(`Skill "${fetchedSkill.name}" installed!`);
      onInstalled?.();
    } catch (err) {
      toast.error(`Install failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setLoading(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Package className="size-5 text-primary" />
            <DialogTitle>Install from Marketplace</DialogTitle>
          </div>
          <DialogDescription>
            Paste the install command from{" "}
            <a
              href="https://skills.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              skills.sh <ExternalLink className="size-3" />
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            <button
              onClick={() => { setMode("command"); setFetchedSkill(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "command" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Terminal className="size-3" /> Install command
            </button>
            <button
              onClick={() => { setMode("paste"); setFetchedSkill(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mode === "paste" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ClipboardPaste className="size-3" /> Paste SKILL.md
            </button>
          </div>

          {/* Command input */}
          {mode === "command" && (
            <div className="space-y-2">
              <Label>Install command</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="npx skills add ... or skills.sh URL or GitHub URL"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                    className="pl-9 font-mono text-sm"
                  />
                </div>
                <Button onClick={handleFetch} disabled={!command.trim() || loading}>
                  {loading && !fetchedSkill ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Fetch
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Example: <code className="bg-muted px-1 rounded text-[10px]">npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines</code>
              </p>
            </div>
          )}

          {/* Paste input */}
          {mode === "paste" && !fetchedSkill && (
            <div className="space-y-2">
              <Label>Paste SKILL.md content</Label>
              <Textarea
                placeholder={"---\nname: my-skill\ndescription: ...\n---\n\n# Instructions\n..."}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                className="font-mono text-xs min-h-[200px]"
                spellCheck={false}
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Copy skill content from <a href="https://skills.sh" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">skills.sh</a> or any source
                </p>
                <Button onClick={handlePaste} disabled={!pasteContent.trim()}>
                  <Download className="size-4" /> Preview
                </Button>
              </div>
            </div>
          )}

          {/* Preview */}
          {fetchedSkill && !installed && (
            <>
              <Separator />
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{fetchedSkill.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{fetchedSkill.description}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{fetchedSkill.slug}</Badge>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileText className="size-3" />
                    SKILL.md ({Math.round(fetchedSkill.content.length / 1024)}KB)
                  </div>
                  {fetchedSkill.files.length > 0 && (
                    <div className="flex items-center gap-1">
                      <FolderOpen className="size-3" />
                      {fetchedSkill.files.length} reference files
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Globe className="size-3" />
                    {fetchedSkill.source}
                  </div>
                </div>

                {/* Security scan */}
                <SecurityPanel content={fetchedSkill.content} compact />

                {/* Content preview */}
                <div className="rounded-md bg-muted/50 border border-border/50 p-2 max-h-32 overflow-y-auto">
                  <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono">
                    {fetchedSkill.content.slice(0, 500)}{fetchedSkill.content.length > 500 ? "..." : ""}
                  </pre>
                </div>

                <Button onClick={handleInstall} disabled={loading} className="w-full">
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Install to Praxl
                </Button>
              </div>
            </>
          )}

          {/* Success */}
          {installed && fetchedSkill && (
            <>
              <Separator />
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="size-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="size-6 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">{fetchedSkill.name} installed!</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    You can now edit, improve with AI, and deploy to your tools.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { reset(); }}>
                    Install another
                  </Button>
                  <Button size="sm" onClick={() => { onOpenChange(false); reset(); }}>
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
