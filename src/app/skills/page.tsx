"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus,
  Search,
  Sparkles,
  FolderOpen,
  FileArchive,
  Globe,
  CheckSquare,
  Square,
  Trash2,
  Tag,
  X,
  Loader2,
  MoreHorizontal,
  List,
  LayoutGrid,
  ArrowUpDown,
  Share2,
  Download,
  Check,
} from "lucide-react";
import { ImportDialog } from "@/components/import-dialog";
import { InstallSkillDialog } from "@/components/install-skill-dialog";
import { SecurityBadge } from "@/components/security-badge";
import { toast } from "sonner";
import { SkillLimitBanner } from "@/components/skill-limit-banner";
import { SkillTagEditor } from "@/components/skill-tag-editor";
import { useWorkspace } from "@/lib/workspace-context";
import { useConfirm } from "@/components/confirm-dialog";

function formatRelativeDate(date: Date | string): string {
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function getContentPreview(content: string): string {
  let c = content.replace(/^---[\s\S]*?---\s*\n?/, "").trim();
  // Skip first heading line
  if (c.startsWith("#")) c = c.split("\n").slice(1).join("\n").trim();
  return c.slice(0, 150);
}

export default function SkillsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeOrgId } = useWorkspace();
  const [search, setSearch] = useState("");
  const projectParam = searchParams.get("project");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Resolve project param (could be UUID or slug) after projects load
  const projectsQuery2 = trpc.projects.list.useQuery({ orgId: activeOrgId });
  useEffect(() => {
    if (!projectParam || !projectsQuery2.data) return;
    // Try UUID match first, then slug match
    const match = projectsQuery2.data.find(p => p.id === projectParam)
      || projectsQuery2.data.find(p => p.name.toLowerCase().replace(/\s+/g, "-") === projectParam);
    if (match) setSelectedProjectId(match.id);
  }, [projectParam, projectsQuery2.data]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "versions">("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterShared, setFilterShared] = useState(false);
  const utils = trpc.useUtils();

  const planQuery = trpc.settings.getMyPlan.useQuery();
  const isPro = planQuery.data?.plan === "pro";

  const bulkDelete = trpc.skills.bulkDelete.useMutation({
    onSuccess: (r) => {
      toast.success(`Deleted ${r.deleted} skill${r.deleted === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      setSelectMode(false);
      utils.skills.list.invalidate();
      utils.skills.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkAddTag = trpc.skills.bulkAddTag.useMutation({
    onSuccess: (r) => { toast.success(`Added tag to ${r.updated} skill${r.updated === 1 ? "" : "s"}`); setBulkTagInput(""); utils.skills.list.invalidate(); utils.skills.allTags.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkRemoveTag = trpc.skills.bulkRemoveTag.useMutation({
    onSuccess: (r) => { toast.success(`Removed tag from ${r.updated} skill${r.updated === 1 ? "" : "s"}`); setBulkTagInput(""); utils.skills.list.invalidate(); utils.skills.allTags.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); setBulkTagInput(""); };

  const skillsQuery = trpc.skills.list.useQuery({
    search: search || undefined,
    projectId: selectedProjectId || undefined,
    tag: selectedTag || undefined,
    orgId: activeOrgId,
  });

  const tagsQuery = trpc.skills.allTags.useQuery({ orgId: activeOrgId });
  const projectsQuery = trpc.projects.list.useQuery({ orgId: activeOrgId });

  // Org sharing
  const orgsQuery = trpc.org.list.useQuery();
  const orgs = orgsQuery.data || [];
  const sharedIdsQuery = trpc.skills.orgSharedIds.useQuery(
    { orgId: activeOrgId! },
    { enabled: !!activeOrgId }
  );
  const sharedSkillIds = new Set((sharedIdsQuery.data || []).map(s => s.skillId));

  // In personal view: which of my skills are shared to which orgs
  const mySharedQuery = trpc.skills.mySharedSkills.useQuery(undefined, { enabled: !activeOrgId && orgs.length > 0 });
  const mySharedMap = mySharedQuery.data || {};

  const shareToOrg = trpc.skills.shareToOrg.useMutation({
    onSuccess: () => { toast.success("Skill shared to workspace"); utils.skills.list.invalidate(); sharedIdsQuery.refetch(); mySharedQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unshareFromOrg = trpc.skills.unshareFromOrg.useMutation({
    onSuccess: () => { toast.success("Removed from workspace"); utils.skills.list.invalidate(); sharedIdsQuery.refetch(); mySharedQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const copyToPersonal = trpc.skills.copyToPersonal.useMutation({
    onSuccess: () => { toast.success("Skill copied to your personal skills"); utils.skills.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSkill = trpc.skills.delete.useMutation({
    onSuccess: () => { toast.success("Skill deleted"); utils.skills.list.invalidate(); utils.skills.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const confirm = useConfirm();
  const isOrgWorkspace = !!activeOrgId;

  const skills = skillsQuery.data ?? [];
  const tags = tagsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  // Sort skills
  const filtered = filterShared && !isOrgWorkspace
    ? skills.filter((s) => (mySharedMap[s.id] || []).length > 0)
    : skills;

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "versions") return (b.currentVersion || 1) - (a.currentVersion || 1);
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* 1. Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isOrgWorkspace ? `Shared Skills` : "Skills"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isOrgWorkspace
              ? "Skills shared by team members in this workspace"
              : "Browse and manage your AI skill definitions"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 cursor-pointer"
            >
              <MoreHorizontal className="size-4" />
              More
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <FileArchive className="size-4" />
                Import ZIP
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setInstallOpen(true)}>
                <Globe className="size-4" />
                Marketplace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isPro && skills.length > 0 && !selectMode && (
            <Button variant="outline" onClick={() => setSelectMode(true)}>
              <CheckSquare className="size-4" />
              Select
            </Button>
          )}
          {!isPro && skills.length > 0 && (
            <Link href="/settings#billing" className={buttonVariants({ variant: "outline" })} title="Bulk operations are a Pro feature">
              <CheckSquare className="size-4" />
              Select
              <Badge variant="outline" className="ml-1 border-primary/50 text-primary text-[9px]">Pro</Badge>
            </Link>
          )}
          <Link href="/skills/new" className={buttonVariants()}>
            <Plus className="size-4" data-icon="inline-start" />
            New Skill
          </Link>
        </div>
      </div>

      {/* 2. SkillLimitBanner */}
      <SkillLimitBanner />

      {/* 5. Stats bar */}
      {!skillsQuery.isLoading && skills.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{skills.length} skills</span>
          <span className="size-1 rounded-full bg-border" />
          <span>{skills.filter(s => s.isActive).length} active</span>
          <span className="size-1 rounded-full bg-border" />
          <span>{tags.length} tags</span>
          <span className="size-1 rounded-full bg-border" />
          <span>{projects.length} projects</span>
        </div>
      )}

      {/* Search + Sort + View toggle */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* 3. Sort dropdown */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "recent" | "name" | "versions")}>
            <SelectTrigger className="w-[160px]">
              <ArrowUpDown className="size-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recently edited</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="versions">Most versions</SelectItem>
            </SelectContent>
          </Select>

          {/* 4. Grid/list toggle */}
          <div className="flex items-center border rounded-md">
            <button onClick={() => setViewMode("grid")} className={`p-1.5 ${viewMode === "grid" ? "bg-muted" : ""}`}>
              <LayoutGrid className="size-3.5" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 ${viewMode === "list" ? "bg-muted" : ""}`}>
              <List className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project filter */}
          <Select
            value={selectedProjectId}
            onValueChange={(value) => setSelectedProjectId(value)}
          >
            <SelectTrigger>
              {selectedProjectId
                ? (projects.find(p => p.id === selectedProjectId)?.name || "All projects")
                : "All projects"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null as unknown as string}>
                All projects
              </SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: project.color ?? undefined }}
                  />
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 7. Tag filter - popover if >6 tags, inline badges otherwise */}
          {tags.length > 0 && tags.length <= 6 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Tags:</span>
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant={selectedTag === tag ? "default" : "outline"}
                  className="cursor-pointer"
                  render={
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTag(selectedTag === tag ? null : tag)
                      }
                    />
                  }
                >
                  {tag}
                </Badge>
              ))}
              {selectedTag && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedTag(null)}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {tags.length > 6 && (
            <Popover>
              <PopoverTrigger
                className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 cursor-pointer"
              >
                <Tag className="size-3" />
                Tags {selectedTag ? `(${selectedTag})` : `(${tags.length})`}
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2">
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {tags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded ${selectedTag === tag ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Clear all filters */}
          {/* Shared filter */}
          {!isOrgWorkspace && orgs.length > 0 && (
            <button
              onClick={() => setFilterShared(!filterShared)}
              className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterShared ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Share2 className="size-3" />
              Shared
            </button>
          )}

          {(search || selectedTag || selectedProjectId || filterShared) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => {
                setSearch("");
                setSelectedTag(null);
                setSelectedProjectId(null);
                setFilterShared(false);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 backdrop-blur">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground ml-2"
            onClick={() => setSelectedIds(new Set(skills.map((s) => s.id)))}
          >
            Select all
          </button>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Input
                placeholder="tag name"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                className="h-8 w-32 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!bulkTagInput || selectedIds.size === 0 || bulkAddTag.isPending}
                onClick={() => bulkAddTag.mutate({ skillIds: [...selectedIds], tag: bulkTagInput })}
              >
                <Tag className="size-3" /> Add
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!bulkTagInput || selectedIds.size === 0 || bulkRemoveTag.isPending}
                onClick={() => bulkRemoveTag.mutate({ skillIds: [...selectedIds], tag: bulkTagInput })}
              >
                Remove
              </Button>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0 || bulkDelete.isPending}
              onClick={async () => {
                const ok = await confirm({ title: "Delete skills", description: `Delete ${selectedIds.size} skill${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`, confirmLabel: "Delete", variant: "destructive" });
                if (!ok) return;
                bulkDelete.mutate({ skillIds: [...selectedIds] });
              }}
            >
              {bulkDelete.isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={exitSelectMode}>
              <X className="size-3" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Skills grid / list */}
      {skillsQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading skills...</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-16">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            {isOrgWorkspace ? <Share2 className="size-6 text-muted-foreground" /> : <Sparkles className="size-6 text-muted-foreground" />}
          </div>
          <div className="text-center">
            <p className="font-medium">{isOrgWorkspace ? "No skills shared yet" : "No skills found"}</p>
            <p className="text-sm text-muted-foreground">
              {search || selectedTag || selectedProjectId
                ? "Try adjusting your filters"
                : isOrgWorkspace
                ? "Switch to 'My skills' and share skills to this workspace"
                : "Create your first skill to get started"}
            </p>
          </div>
          {!search && !selectedTag && !selectedProjectId && !isOrgWorkspace && (
            <Link href="/skills/new" className={buttonVariants()}>
              <Plus className="size-4" data-icon="inline-start" />
              Create Skill
            </Link>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* 4. List view */
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {selectMode && <th className="px-4 py-2 font-medium w-8" />}
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Tags</th>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Last edited</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((skill) => {
                const selected = selectedIds.has(skill.id);
                const isStale = (Date.now() - new Date(skill.updatedAt).getTime()) > 30 * 86400000;
                const listSharedToOrgs = !isOrgWorkspace ? (mySharedMap[skill.id] || []) : [];
                const listIsShared = listSharedToOrgs.length > 0;
                return (
                  <tr
                    key={skill.id}
                    className={`border-b last:border-0 hover:bg-muted/50 cursor-pointer ${selectMode && selected ? "bg-primary/5" : ""}`}
                    onClick={() => selectMode ? toggleSelect(skill.id) : router.push(`/skills/${skill.slug}`)}
                  >
                    {selectMode && (
                      <td className="px-4 py-2">
                        {selected ? <CheckSquare className="size-4 text-primary fill-primary/20" /> : <Square className="size-4 text-muted-foreground" />}
                      </td>
                    )}
                    <td className="px-4 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        {skill.name}
                        {isStale && <span className="size-2 rounded-full bg-amber-500 shrink-0" title="Not edited in 30+ days" />}
                        {!isStale && skill.currentVersion > 1 && <span className="size-2 rounded-full bg-green-500 shrink-0" title="Reviewed / multi-version" />}
                        {listIsShared && (
                          <Badge variant="outline" className="text-[9px] gap-0.5 border-primary/30 text-primary py-0 h-4">
                            <Share2 className="size-2" />
                            Shared
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <SkillTagEditor
                        skillId={skill.id}
                        currentTags={skill.tags}
                        allTags={tags}
                        onUpdated={() => { utils.skills.list.invalidate(); utils.skills.allTags.invalidate(); }}
                      />
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">v{skill.currentVersion}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatRelativeDate(skill.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grid view */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((skill) => {
            const selected = selectedIds.has(skill.id);
            const isStale = (Date.now() - new Date(skill.updatedAt).getTime()) > 30 * 86400000;
            const preview = getContentPreview(skill.content);
            const skillSharedToOrgs = !isOrgWorkspace ? (mySharedMap[skill.id] || []) : [];
            const isShared = skillSharedToOrgs.length > 0;
            const hasMenu = true; // always show: has delete + share options
            return (
              <div
                key={skill.id}
                className="group/card cursor-pointer"
                onClick={() => selectMode ? toggleSelect(skill.id) : router.push(`/skills/${skill.slug}`)}
              >
              <Card className={`h-full flex flex-col transition-colors ${selectMode ? (selected ? "border-primary bg-primary/5" : "hover:border-primary/40") : "hover:bg-muted/50"} relative`}>
                {selectMode && (
                  <div className="absolute top-2 right-2 z-10 text-muted-foreground pointer-events-none">
                    {selected ? <CheckSquare className="size-5 text-primary fill-primary/20" /> : <Square className="size-5" />}
                  </div>
                )}

                {/* Three-dot menu - top right, visible on hover */}
                {!selectMode && hasMenu && (
                  <div className="absolute top-3 right-3 z-10 opacity-0 group-hover/card:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="p-1.5 rounded-md bg-card border border-border/60 shadow-sm hover:bg-muted transition-colors cursor-pointer">
                        <MoreHorizontal className="size-3.5 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {/* Personal workspace: share/unshare to orgs */}
                        {!isOrgWorkspace && orgs.map((org) => {
                          const alreadyShared = skillSharedToOrgs.includes(org.id);
                          return (
                            <DropdownMenuItem
                              key={org.id}
                              onClick={() => alreadyShared
                                ? unshareFromOrg.mutate({ skillId: skill.id, orgId: org.id })
                                : shareToOrg.mutate({ skillId: skill.id, orgId: org.id })
                              }
                            >
                              {alreadyShared
                                ? <><X className="size-3.5" /> Remove from {org.name}</>
                                : <><Share2 className="size-3.5" /> Share to {org.name}</>
                              }
                            </DropdownMenuItem>
                          );
                        })}
                        {/* Org workspace: copy to personal */}
                        {isOrgWorkspace && (
                          <DropdownMenuItem onClick={() => copyToPersonal.mutate({ skillId: skill.id, orgId: activeOrgId! })}>
                            <Download className="size-3.5" /> Copy to my skills
                          </DropdownMenuItem>
                        )}
                        {/* Delete */}
                        {!isOrgWorkspace && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={async () => {
                              const ok = await confirm({ title: `Delete "${skill.name}"`, description: "This cannot be undone. All versions and files will be permanently deleted.", confirmLabel: "Delete", variant: "destructive" });
                              if (ok) deleteSkill.mutate(skill.id);
                            }}
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="flex-1 min-w-0 truncate">{skill.name}</CardTitle>
                    {isShared && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary shrink-0">
                        <Share2 className="size-2.5" />
                        Shared
                      </Badge>
                    )}
                  </div>
                  {skill.description && (
                    <CardDescription className="line-clamp-2">
                      {skill.description}
                    </CardDescription>
                  )}
                  {preview && (
                    <p className="text-xs text-muted-foreground/70 line-clamp-2 font-mono">
                      {preview}
                    </p>
                  )}
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                  {(skill.skillCategory || skill.pattern) && (
                    <div className="flex flex-wrap gap-1">
                      {skill.skillCategory && (
                        <Badge variant="default" className="text-xs">
                          {skill.skillCategory === "document-creation" ? "Document" :
                           skill.skillCategory === "workflow-automation" ? "Workflow" :
                           skill.skillCategory === "mcp-enhancement" ? "MCP" : skill.skillCategory}
                        </Badge>
                      )}
                      {skill.pattern && (
                        <Badge variant="outline" className="text-xs">
                          {skill.pattern}
                        </Badge>
                      )}
                    </div>
                  )}

                  {skill.project && (
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="size-3 text-muted-foreground" />
                      <Badge variant="secondary" className="gap-1.5">
                        <span className="inline-block size-2 rounded-full" style={{ backgroundColor: skill.project.color ?? undefined }} />
                        {skill.project.name}
                      </Badge>
                    </div>
                  )}

                  <div onClick={(e) => e.stopPropagation()}>
                    <SkillTagEditor
                      skillId={skill.id}
                      currentTags={skill.tags}
                      allTags={tags}
                      onUpdated={() => { utils.skills.list.invalidate(); utils.skills.allTags.invalidate(); }}
                    />
                  </div>

                  {skill.platformHints.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {skill.platformHints.map((platform) => (
                        <Badge key={platform} variant="secondary" className="text-xs font-normal">
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="text-xs text-muted-foreground mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span>v{skill.currentVersion}</span>
                    <span className="mx-1.5">&middot;</span>
                    <span>{formatRelativeDate(skill.updatedAt)}</span>
                    {isStale && <span className="size-2 rounded-full bg-amber-500" title="Not edited in 30+ days" />}
                    {!isStale && skill.currentVersion > 1 && <span className="size-2 rounded-full bg-green-500" title="Reviewed / multi-version" />}
                  </div>
                  <SecurityBadge content={skill.content} size="xs" />
                </CardFooter>
              </Card>
              </div>
            );
          })}
        </div>
      )}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          utils.skills.list.invalidate();
          utils.skills.allTags.invalidate();
        }}
      />
      <InstallSkillDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        onInstalled={() => {
          utils.skills.list.invalidate();
          utils.skills.allTags.invalidate();
        }}
      />
    </div>
  );
}
