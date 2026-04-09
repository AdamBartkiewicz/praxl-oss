"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconPicker, getIconComponent } from "@/components/icon-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  Trash2,
  Pencil,
  Layers,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "@/lib/project-templates";
import { useWorkspace } from "@/lib/workspace-context";

const PRESET_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16", "#6b7280"];

export default function ProjectsPage() {
  const utils = trpc.useUtils();
  const { activeOrgId } = useWorkspace();
  const projectsQuery = trpc.projects.list.useQuery({ orgId: activeOrgId });
  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Project created"); setCreateOpen(false); resetForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Project updated"); setEditProject(null); },
  });
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Project deleted"); },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  const [icon, setIcon] = useState("");
  const [color, setColor] = useState("#3b82f6");

  function resetForm() {
    setName(""); setDescription(""); setContext(""); setIcon(""); setColor("#3b82f6"); setSelectedTemplate(null);
  }

  function applyTemplate(t: ProjectTemplate) {
    setSelectedTemplate(t);
    setName(t.name); setDescription(t.description); setContext(t.context); setIcon(t.icon); setColor(t.color);
  }

  const projects = projectsQuery.data || [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Group skills with shared context for your AI tools.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="size-4 mr-2" /> New Project
        </Button>
      </div>

      {projectsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse"><CardContent className="p-5 space-y-3"><div className="h-5 w-40 rounded bg-muted" /><div className="h-3 w-64 rounded bg-muted" /></CardContent></Card>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted">
              <FolderKanban className="size-7 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-medium">No projects yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Projects group skills with shared context. AI understands your stack across all skills in a project.
            </p>
            <Button className="mt-4" onClick={() => { resetForm(); setCreateOpen(true); }}>Create your first project</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((project) => {
            const skillCount = project.skills?.length || 0;
            const activeCount = project.skills?.filter((s: { isActive: boolean }) => s.isActive).length || 0;
            return (
              <Card key={project.id} className="hover:shadow-sm transition-shadow group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <Link href={`/skills?project=${project.name.toLowerCase().replace(/\s+/g, "-")}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex size-10 items-center justify-center rounded-lg shrink-0"
                        style={{ backgroundColor: (project.color || "#3b82f6") + "15", color: project.color || "#3b82f6" }}>
                        {(() => { const I = getIconComponent(project.icon || ""); return I ? <I className="size-5" /> : <span className="text-lg">{project.icon || "📁"}</span>; })()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{project.name}</h3>
                        {project.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{project.description}</p>}
                      </div>
                    </Link>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                        setEditProject(project.id); setName(project.name);
                        setDescription(project.description || ""); setContext(project.context || "");
                        setIcon(project.icon || ""); setColor(project.color || "#3b82f6");
                      }}><Pencil className="size-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteConfirm(project.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><Layers className="size-3" />{skillCount} skill{skillCount !== 1 ? "s" : ""}</div>
                    {activeCount > 0 && <div className="flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-500" />{activeCount} active</div>}
                  </div>
                  {project.context && (
                    <div className="mt-3 rounded-md bg-muted/50 px-2.5 py-1.5">
                      <p className="text-[10px] text-muted-foreground line-clamp-2"><span className="font-medium">Context:</span> {project.context}</p>
                    </div>
                  )}
                  {skillCount > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {project.skills?.slice(0, 5).map((s: { id: string; slug: string }) => (
                        <Badge key={s.id} variant="secondary" className="text-[10px]">{s.slug}</Badge>
                      ))}
                      {skillCount > 5 && <Badge variant="outline" className="text-[10px]">+{skillCount - 5}</Badge>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Group skills with shared context.</DialogDescription>
          </DialogHeader>
          {!selectedTemplate ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Start from template</Label>
              <div className="grid grid-cols-2 gap-2">
                {PROJECT_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t)} className="flex items-center gap-2 rounded-lg border p-2.5 text-left hover:bg-muted/50 transition-colors">
                    <span className="text-lg">{t.icon}</span>
                    <div><p className="text-xs font-medium">{t.name}</p><p className="text-[10px] text-muted-foreground">{t.description}</p></div>
                  </button>
                ))}
                <button onClick={() => setSelectedTemplate({ id: "blank", name: "", icon: "📁", color: "#3b82f6", description: "", context: "", suggestedSkills: [] })}
                  className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-left hover:bg-muted/50 transition-colors">
                  <span className="text-lg">✨</span>
                  <div><p className="text-xs font-medium">Blank project</p><p className="text-[10px] text-muted-foreground">Start from scratch</p></div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="My Project" /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this project is about" /></div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><Label>Project Context</Label><Badge variant="outline" className="text-[9px]">Shared with AI</Badge></div>
                <Textarea value={context} onChange={e => setContext(e.target.value)} placeholder="Tech stack, coding standards, preferences..." rows={4} className="text-xs" />
                <p className="text-[10px] text-muted-foreground">AI uses this when editing skills in this project.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1.5"><Label>Icon</Label><IconPicker value={icon} onChange={setIcon} /></div>
                <div className="flex-1 space-y-1.5"><Label>Color</Label>
                  <div className="flex gap-1.5">{PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)} className={`size-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`} style={{ backgroundColor: c }} />
                  ))}</div>
                </div>
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate({ name, description: description || null, context, icon: icon || null, color, orgId: activeOrgId })} disabled={!name.trim() || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create Project
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editProject !== null} onOpenChange={open => { if (!open) setEditProject(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>Project Context</Label><Badge variant="outline" className="text-[9px]">Shared with AI</Badge></div>
              <Textarea value={context} onChange={e => setContext(e.target.value)} rows={4} className="text-xs" />
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1.5"><Label>Icon</Label><Input value={icon} onChange={e => setIcon(e.target.value)} className="w-16 text-center" /></div>
              <div className="flex-1 space-y-1.5"><Label>Color</Label>
                <div className="flex gap-1.5">{PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} className={`size-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "hover:scale-105"}`} style={{ backgroundColor: c }} />
                ))}</div>
              </div>
            </div>
            <Button className="w-full" onClick={() => editProject && updateMutation.mutate({ id: editProject, name, description: description || null, context, icon: icon || null, color })} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteConfirm !== null} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete Project</DialogTitle><DialogDescription>Skills will be unassigned, not deleted.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteConfirm) { deleteMutation.mutate(deleteConfirm); setDeleteConfirm(null); } }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
