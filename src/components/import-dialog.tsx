"use client";

import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspace } from "@/lib/workspace-context";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Upload,
  FileArchive,
  Check,
  X,
  Loader2,
  FileText,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface ParsedFile {
  folder: string;
  filename: string;
  content: string;
  mimeType: string;
  size: number;
}

interface ParsedSkill {
  name: string;
  slug: string;
  description: string;
  content: string;
  folderName: string;
  license: string | null;
  compatibility: string | null;
  allowedTools: string | null;
  skillCategory: string | null;
  pattern: string | null;
  tags: string[];
  platformHints: string[];
  skillMetadata: Record<string, string>;
  files: ParsedFile[];
}

type ImportStatus = "idle" | "uploading" | "reviewing" | "importing" | "done" | "error";

interface ImportResult {
  name: string;
  success: boolean;
  error?: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const { activeOrgId } = useWorkspace();
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [parsedSkills, setParsedSkills] = useState<ParsedSkill[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projectsQuery = trpc.projects.list.useQuery({ orgId: activeOrgId });
  const createSkill = trpc.skills.create.useMutation();
  const bulkAddFiles = trpc.files.bulkAdd.useMutation();

  const projects = projectsQuery.data ?? [];

  const reset = useCallback(() => {
    setStatus("idle");
    setParsedSkills([]);
    setSelectedIndices(new Set());
    setProjectId(null);
    setImportResults([]);
    setImportProgress(0);
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        reset();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset],
  );

  const handleFileUpload = useCallback(async (file: File) => {
    setStatus("uploading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await response.json();
      const skills: ParsedSkill[] = data.skills;

      if (skills.length === 0) {
        setErrorMessage("No SKILL.md files found in the ZIP archive.");
        setStatus("error");
        return;
      }

      setParsedSkills(skills);
      setSelectedIndices(new Set(skills.map((_, i) => i)));
      setStatus("reviewing");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to process ZIP file");
      setStatus("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".zip")) {
        handleFileUpload(file);
      } else {
        setErrorMessage("Please drop a .zip file");
        setStatus("error");
      }
    },
    [handleFileUpload],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload],
  );

  const toggleSkill = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedIndices.size === parsedSkills.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedSkills.map((_, i) => i)));
    }
  }, [selectedIndices.size, parsedSkills.length]);

  const handleImport = useCallback(async () => {
    const selected = parsedSkills.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;

    setStatus("importing");
    setImportProgress(0);
    const results: ImportResult[] = [];

    for (let i = 0; i < selected.length; i++) {
      const skill = selected[i];
      try {
        const createdSkill = await createSkill.mutateAsync({
          name: skill.name,
          slug: skill.slug,
          description: skill.description,
          content: skill.content,
          projectId: projectId || null,
          tags: skill.tags,
          platformHints: skill.platformHints,
          license: skill.license,
          compatibility: skill.compatibility,
          allowedTools: skill.allowedTools,
          skillMetadata: skill.skillMetadata,
          skillCategory: skill.skillCategory,
          pattern: skill.pattern,
          orgId: activeOrgId,
        });

        if (createdSkill && skill.files.length > 0) {
          await bulkAddFiles.mutateAsync({
            files: skill.files.map((f) => ({
              skillId: createdSkill.id!,
              folder: f.folder,
              filename: f.filename,
              content: f.content,
              mimeType: f.mimeType,
              size: f.size,
            })),
          });
        }

        results.push({ name: skill.name, success: true });
      } catch (err) {
        results.push({
          name: skill.name,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
      setImportProgress(i + 1);
    }

    setImportResults(results);
    setStatus("done");
    onImported?.();
  }, [parsedSkills, selectedIndices, projectId, createSkill, bulkAddFiles, onImported]);

  const successCount = importResults.filter((r) => r.success).length;
  const failCount = importResults.filter((r) => !r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FileArchive className="mr-2 inline-block size-5 align-text-bottom" />
            Import Skills from ZIP
          </DialogTitle>
          <DialogDescription>
            Upload a ZIP file containing skill folders, each with a SKILL.md file.
          </DialogDescription>
        </DialogHeader>

        {/* Idle: File upload area */}
        {status === "idle" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-foreground/25"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Upload className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Drop a ZIP file here</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>
        )}

        {/* Uploading */}
        {status === "uploading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Processing ZIP file...</p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
            <p className="text-sm text-destructive">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={reset}>
              Try Again
            </Button>
          </div>
        )}

        {/* Reviewing: Show found skills */}
        {status === "reviewing" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Found {parsedSkills.length} skill{parsedSkills.length !== 1 ? "s" : ""} in ZIP
              </p>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selectedIndices.size === parsedSkills.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <ScrollArea className="max-h-64">
              <div className="flex flex-col gap-1">
                {parsedSkills.map((skill, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toggleSkill(index)}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <div
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        selectedIndices.has(index)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {selectedIndices.has(index) && <Check className="size-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{skill.name}</span>
                      </div>
                      {skill.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {skill.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {skill.folderName}
                        </Badge>
                        {skill.files.length > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {skill.files.length} file{skill.files.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        {skill.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>

            <Separator />

            {/* Project assignment */}
            {projects.length > 0 && (
              <div className="flex items-center gap-3">
                <Label className="shrink-0 text-xs">Assign to project:</Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => v && setProjectId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedIndices.size === 0}
              >
                <Upload className="size-4" />
                Import {selectedIndices.size} Skill{selectedIndices.size !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Importing: Progress */}
        {status === "importing" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                Importing skills... {importProgress}/{Array.from(selectedIndices).length}
              </p>
              <div className="mx-auto mt-2 h-2 w-48 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${(importProgress / Array.from(selectedIndices).length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Done: Results */}
        {status === "done" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle className="size-6 text-green-600" />
              </div>
              <p className="text-sm font-medium">Import Complete</p>
              <p className="text-xs text-muted-foreground">
                {successCount} imported successfully
                {failCount > 0 && `, ${failCount} failed`}
              </p>
            </div>

            {failCount > 0 && (
              <ScrollArea className="max-h-32">
                <div className="flex flex-col gap-1">
                  {importResults
                    .filter((r) => !r.success)
                    .map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded px-3 py-1.5 text-xs text-destructive"
                      >
                        <X className="size-3 shrink-0" />
                        <span className="font-medium">{r.name}:</span>
                        <span className="truncate text-muted-foreground">
                          {r.error}
                        </span>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
