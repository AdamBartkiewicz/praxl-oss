"use client";

import { useState, useEffect, useMemo } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, FolderOpen } from "lucide-react";

type Folder = "references" | "scripts" | "assets";

function languageForFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    md: "markdown", markdown: "markdown",
    json: "json", jsonc: "json",
    yaml: "yaml", yml: "yaml",
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    py: "python",
    sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql",
    html: "html", htm: "html",
    css: "css", scss: "scss",
    xml: "xml", svg: "xml",
    txt: "plaintext", log: "plaintext", env: "plaintext",
    toml: "ini", ini: "ini",
    rs: "rust", go: "go", java: "java", rb: "ruby", php: "php", kt: "kotlin",
  };
  return map[ext] || "plaintext";
}

export function FileEditorDialog({
  open,
  onOpenChange,
  skillId,
  fileId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillId: string;
  fileId: string | null; // null = create new file
  onSaved?: () => void;
}) {
  const isNew = fileId === null;
  const utils = trpc.useUtils();
  const { resolvedTheme } = useTheme();

  const fileQuery = trpc.files.get.useQuery(fileId ?? "", {
    enabled: !!fileId && open,
    refetchOnWindowFocus: false,
  });

  const [filename, setFilename] = useState("");
  const [folder, setFolder] = useState<Folder>("references");
  const [content, setContent] = useState("");
  const [initial, setInitial] = useState({ filename: "", folder: "references" as Folder, content: "" });

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (isNew) {
      setFilename("");
      setFolder("references");
      setContent("");
      setInitial({ filename: "", folder: "references", content: "" });
    }
  }, [open, isNew]);

  // Hydrate when file loads
  useEffect(() => {
    if (!fileQuery.data || !open) return;
    const f = fileQuery.data;
    setFilename(f.filename);
    setFolder(((["references", "scripts", "assets"] as const).includes(f.folder as Folder) ? f.folder : "references") as Folder);
    setContent(f.content);
    setInitial({ filename: f.filename, folder: f.folder as Folder, content: f.content });
  }, [fileQuery.data, open]);

  const updateMutation = trpc.files.update.useMutation({
    onSuccess: () => {
      toast.success("File saved");
      utils.files.list.invalidate(skillId);
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const addMutation = trpc.files.add.useMutation({
    onSuccess: () => {
      toast.success("File created");
      utils.files.list.invalidate(skillId);
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const isBinary = fileQuery.data?.mimeType?.startsWith("image/") ||
    (fileQuery.data?.mimeType && !fileQuery.data.mimeType.startsWith("text/") &&
     fileQuery.data.mimeType !== "application/json" &&
     !fileQuery.data.mimeType.includes("yaml") &&
     !fileQuery.data.mimeType.includes("javascript") &&
     !fileQuery.data.mimeType.includes("xml"));

  const dirty = !isNew && (
    filename !== initial.filename ||
    folder !== initial.folder ||
    content !== initial.content
  );
  const canCreate = isNew && filename.trim().length > 0;
  const language = useMemo(() => languageForFilename(filename), [filename]);
  const saving = updateMutation.isPending || addMutation.isPending;

  const handleSave = () => {
    if (isNew) {
      if (!canCreate) return;
      addMutation.mutate({
        skillId,
        folder,
        filename: filename.trim(),
        content,
        mimeType: "text/plain",
        size: new TextEncoder().encode(content).length,
      });
    } else {
      if (!fileId || !dirty) return;
      updateMutation.mutate({
        id: fileId,
        content,
        filename: filename.trim() || undefined,
        folder,
      });
    }
  };

  const title = isNew ? "Create file" : fileQuery.data?.filename || "Edit file";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && dirty && !confirm("Discard unsaved changes?")) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden sm:max-w-none" style={{ width: "95vw", maxWidth: "1400px", height: "90vh" }}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/20 shrink-0">
          <Select value={folder} onValueChange={(v) => v && setFolder(v as Folder)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <FolderOpen className="size-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="references">references/</SelectItem>
              <SelectItem value="scripts">scripts/</SelectItem>
              <SelectItem value="assets">assets/</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder={isNew ? "filename.md" : ""}
            className="h-8 flex-1 text-xs font-mono"
          />
          {language !== "plaintext" && (
            <span className="text-[10px] text-muted-foreground px-2 py-1 rounded bg-muted uppercase tracking-wider">
              {language}
            </span>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 relative">
          {fileQuery.isLoading && !isNew ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : isBinary ? (
            <div className="flex items-center justify-center h-full p-8 text-center">
              <div>
                <p className="text-sm font-medium">Binary file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This file can&apos;t be edited as text. Delete and re-upload to replace it.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile: textarea fallback. Desktop: Monaco. */}
              <textarea
                className="lg:hidden block w-full h-full p-3 font-mono text-xs bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring border-0"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
              />
              <div className="hidden lg:block h-full">
                <Editor
                  height="100%"
                  language={language}
                  value={content}
                  onChange={(v) => setContent(v ?? "")}
                  theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                  options={{
                    fontSize: 13,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: language === "markdown" || language === "plaintext" ? "on" : "off",
                    lineNumbers: "on",
                    renderLineHighlight: "line",
                    tabSize: 2,
                    automaticLayout: true,
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-muted/20 shrink-0">
          <div className="text-[11px] text-muted-foreground">
            {dirty && !isNew && <span className="text-amber-500">● Unsaved changes</span>}
            {!dirty && !isNew && fileQuery.data && <span>Saved</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (dirty && !confirm("Discard unsaved changes?")) return;
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isBinary || saving || (isNew ? !canCreate : !dirty)}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
