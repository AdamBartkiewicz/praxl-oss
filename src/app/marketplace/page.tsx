"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InstallSkillDialog } from "@/components/install-skill-dialog";
import {
  Globe,
  Search,
  Download,
  Package,
  Loader2,
  ExternalLink,
  ChevronDown,
  Users,
  Star,
  ArrowLeft,
  FolderOpen,
  Sparkles,
  Plus,
  Bot,
} from "lucide-react";
import { CREATORS, CATEGORY_LABELS, getCreatorsByCategory, getFeaturedCreators, type Creator, type CreatorCategory } from "@/lib/marketplace-data";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BetaBadge } from "@/components/beta-badge";
import { SkillLimitBanner } from "@/components/skill-limit-banner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillEntry {
  name: string;
  type: string;
  path: string;
  creator: Creator;
}

// ---------------------------------------------------------------------------
// Skill fetching from GitHub
// ---------------------------------------------------------------------------

function humanize(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function githubFetch(url: string) {
  // Use server-side proxy to avoid GitHub rate limits
  const proxyUrl = `/api/github-proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) return null;
  return res.json();
}

async function fetchSkillsFromRepo(creator: Creator): Promise<SkillEntry[]> {
  const [owner, repo] = creator.github.split("/");
  const paths = ["skills", ".", "src/skills", "agent-skills"];

  for (const basePath of paths) {
    try {
      const url = basePath === "."
        ? `https://api.github.com/repos/${owner}/${repo}/contents`
        : `https://api.github.com/repos/${owner}/${repo}/contents/${basePath}`;
      const items = await githubFetch(url);
      if (!Array.isArray(items)) continue;

      const dirs = items.filter((item: { type: string; name: string }) => item.type === "dir" && !item.name.startsWith("."));

      // Nested structure: skills/username/skillname/ - go one level deeper
      if (creator.nested && dirs.length > 0) {
        // Fetch skills from each user dir (limited to first 30 users to avoid rate limits)
        const nestedSkills: SkillEntry[] = [];
        const userDirs = dirs.slice(0, 30);
        for (const userDir of userDirs) {
          try {
            const userUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${userDir.path}`;
            const userItems = await githubFetch(userUrl);
            if (!Array.isArray(userItems)) continue;
            const userSkills = userItems
              .filter((item: { type: string; name: string }) => item.type === "dir" && !item.name.startsWith("."))
              .map((item: { name: string; path: string }) => ({
                name: `${humanize(item.name)} (${userDir.name})`,
                type: "dir",
                path: item.path,
                creator,
              }));
            nestedSkills.push(...userSkills);
          } catch { continue; }
        }
        if (nestedSkills.length > 0) return nestedSkills;
      }

      const skills = dirs.map((item: { name: string; path: string }) => ({
        name: humanize(item.name),
        type: "dir",
        path: item.path,
        creator,
      }));

      if (skills.length > 0) return skills;
    } catch { continue; }
  }
  return [];
}

async function fetchSkillDescription(creator: Creator, skillPath: string): Promise<{ desc: string; blocked: boolean } | null> {
  const [owner, repo] = creator.github.split("/");
  for (const filename of ["SKILL.md", "skill.md", "README.md"]) {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillPath}/${filename}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();

      // Security scan: block if any flag
      const scanRes = await fetch("/api/github-proxy?url=" + encodeURIComponent(url)).catch(() => null);
      // Simple inline check (avoid importing server util)
      const hasCritical = /\b(exec|eval|system|spawn|popen|shell_exec)\s*\(|\brm\s+-rf\s+[\/~]|\b(curl|wget|fetch)\s+https?:.*\|\s*(bash|sh|zsh)|(API_KEY|SECRET_KEY|PRIVATE_KEY|PASSWORD)\s*[:=]\s*['"][^'"]{3,}['"]|base64[_-]?(decode|encode)\s*\(|\beval\s*\(\s*atob/i.test(text);
      const hasWarning = /\bsudo\b|\b(chmod|chown)\s+[0-7]{3,4}|\b\.env\b|\bprivate[_-]?key\b|\bDROP\s+(TABLE|DATABASE)\b|\bnetcat\b|\breverse[_-]?shell\b/i.test(text);
      if (hasCritical || hasWarning) return { desc: "", blocked: true };
      void scanRes;

      let desc = "";
      const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const descMatch = fmMatch[1].match(/description:\s*["']?(.*?)["']?\s*$/m);
        if (descMatch) desc = descMatch[1].trim();
      }
      if (!desc) {
        for (const line of text.split("\n")) {
          const t = line.trim();
          if (t && !t.startsWith("#") && !t.startsWith("---") && t.length > 10) { desc = t.slice(0, 200); break; }
        }
      }

      // Language filter: reject if >15% non-Latin in description
      const checkText = desc.slice(0, 500);
      if (checkText.length > 20) {
        const nonLatin = (checkText.match(/[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]/g) || []).length;
        if (nonLatin / checkText.length > 0.15) return { desc: "", blocked: true };
      }

      return { desc, blocked: false };
    } catch { continue; }
  }
  return { desc: "", blocked: false };
}

// ---------------------------------------------------------------------------
// Creator Card
// ---------------------------------------------------------------------------

function CreatorCard({ creator, onClick }: { creator: Creator; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-sm transition-shadow" onClick={onClick}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{creator.name}</p>
              <Badge variant="outline" className="text-[9px] mt-0.5">{CATEGORY_LABELS[creator.category]}</Badge>
            </div>
          </div>
          {creator.skillCount && (
            <Badge variant="secondary" className="text-[10px]">{creator.skillCount}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{creator.description}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Creator Detail View (skills list)
// ---------------------------------------------------------------------------

function CreatorDetailView({ creator, onBack, onInstall }: { creator: Creator; onBack: () => void; onInstall: (cmd: string) => void }) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    fetchSkillsFromRepo(creator).then(async (s) => {
      setSkills(s);
      setLoading(false);
      const blockedPaths = new Set<string>();
      // Auto-load descriptions for all skills (batch, 5 at a time)
      for (let i = 0; i < s.length; i += 5) {
        const batch = s.slice(i, i + 5);
        const results = await Promise.all(batch.map(async (skill) => {
          const result = await fetchSkillDescription(creator, skill.path);
          return { path: skill.path, desc: result?.desc || "", blocked: result?.blocked || false };
        }));
        for (const r of results) {
          if (r.blocked) blockedPaths.add(r.path);
        }
        setDescriptions((prev) => {
          const next = { ...prev };
          for (const r of results) if (!r.blocked) next[r.path] = r.desc;
          return next;
        });
        // Remove blocked skills from display
        if (blockedPaths.size > 0) {
          setSkills((prev) => prev.filter((sk) => !blockedPaths.has(sk.path)));
        }
      }
    });
  }, [creator]);

  const [owner, repo] = creator.github.split("/");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{creator.name}</h2>
            <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[creator.category]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{creator.description}</p>
        </div>
        <a href={creator.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-4" />
        </a>
      </div>

      {/* Skills list */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 space-y-2">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-3 w-48 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <FolderOpen className="size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No skills found in this repository.</p>
            <p className="text-xs text-muted-foreground">The skills may be structured differently. Try browsing on GitHub.</p>
            <a href={creator.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
              Open on GitHub <ExternalLink className="size-3" />
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {skills.map((skill) => {
            const skillName = skill.path.split("/").pop() || skill.path;
            const desc = descriptions[skill.path];
            // For nested paths, include --path flag so install knows where to look
            const needsPath = skill.path.split("/").length > 2;
            const installCmd = needsPath
              ? `npx skills add https://github.com/${owner}/${repo} --skill ${skillName} --path ${skill.path}`
              : `npx skills add https://github.com/${owner}/${repo} --skill ${skillName}`;
            return (
              <Card key={skill.path} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="size-4 text-primary shrink-0" />
                      <span className="text-sm font-semibold">{skill.name}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => onInstall(installCmd)}
                    >
                      <Download className="size-3 mr-1" /> Install
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                    {desc === undefined
                      ? <span className="flex items-center gap-1 text-muted-foreground/50"><Loader2 className="size-3 animate-spin" /> Loading description...</span>
                      : desc || <span className="italic">No description</span>
                    }
                  </p>
                  <a
                    href={`https://github.com/${owner}/${repo}/tree/main/${skill.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    View source <ExternalLink className="size-2.5" />
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error boundary wrapper
// ---------------------------------------------------------------------------

import React from "react";

class ErrorBoundaryWrapper extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return null; // Silently hide broken component
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// AI Skill Finder (client-side search across all creators)
// ---------------------------------------------------------------------------

interface AISearchResult {
  name: string;
  slug: string;
  description: string;
  creator: string;
  repo: string;
  path: string;
  category: string;
  installCommand: string;
}

function AISkillFinder({ onInstall, onCreateNew }: { onInstall: (cmd: string) => void; onCreateNew: (prompt: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AISearchResult[] | null>(null);
  const [noResults, setNoResults] = useState(false);
  const [aiPowered, setAiPowered] = useState(false);

  const statusQuery = trpc.ai.marketplaceStatus.useQuery();
  const indexMutation = trpc.ai.indexMarketplace.useMutation();
  const searchMutation = trpc.ai.searchMarketplace.useMutation();

  const totalIndexed = statusQuery.data?.totalSkills ?? 0;
  const searching = searchMutation.isPending;
  const isIndexing = indexMutation.isPending;

  async function handleIndex() {
    await indexMutation.mutateAsync();
    statusQuery.refetch();
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setResults(null);
    setNoResults(false);
    setAiPowered(false);

    try {
      const data = await searchMutation.mutateAsync({ query });
      setResults(data.results);
      setNoResults(data.results.length === 0);
      setAiPowered(data.aiPowered);
    } catch {
      setResults([]);
      setNoResults(true);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="size-4 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2"><p className="text-sm font-semibold">AI Skill Finder</p><BetaBadge size="xs" /></div>
          <p className="text-xs text-muted-foreground">
            Describe what you need - AI searches {totalIndexed > 0 ? `${totalIndexed.toLocaleString()} indexed skills` : `across ${CREATORS.length} creators`}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="e.g. TDD testing, frontend design, deploy to Vercel..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={!query.trim() || searching}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
      </div>

      {/* Empty index notice */}
      {totalIndexed === 0 && (
        <p className="text-xs text-muted-foreground text-center">AI search is being set up. Browse creators below in the meantime.</p>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {results.length} skills found for &quot;{query}&quot;
            {aiPowered && <Badge variant="outline" className="ml-2 text-[10px] border-primary/30 text-primary">AI-ranked</Badge>}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {results.map((skill) => (
              <div key={`${skill.repo}-${skill.path}`} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                <Package className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-medium">{skill.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{skill.description || "No description"}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{skill.creator}</Badge>
                    <a href={`https://github.com/${skill.repo}/tree/main/${skill.path}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                      Source <ExternalLink className="size-2" />
                    </a>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => onInstall(skill.installCommand)}
                >
                  <Download className="size-3 mr-1" /> Install
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No results - suggest creating */}
      {noResults && (
        <div className="flex flex-col items-center gap-3 py-4 rounded-lg border border-dashed">
          <Search className="size-8 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-sm font-medium">No matching skills found</p>
            <p className="text-xs text-muted-foreground mt-1">Want to create a custom skill for &quot;{query}&quot;?</p>
          </div>
          <Button onClick={() => onCreateNew(query)}>
            <Plus className="size-4 mr-2" /> Create with AI
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browse All Skills View
// ---------------------------------------------------------------------------

function AllSkillsView({ onBack, onInstall }: { onBack: () => void; onInstall: (cmd: string) => void }) {
  const [allSkills, setAllSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [skillSearch, setSkillSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const results: SkillEntry[] = [];
      for (let i = 0; i < CREATORS.length; i++) {
        if (cancelled) return;
        try {
          const skills = await fetchSkillsFromRepo(CREATORS[i]);
          results.push(...skills);
          if (!cancelled) {
            setAllSkills([...results]);
            setLoadedCount(i + 1);
          }
        } catch { /* skip failed repos */ }
      }
      if (!cancelled) setLoading(false);

      // Load descriptions in background (batch by 10)
      const blockedKeys = new Set<string>();
      for (let i = 0; i < results.length; i += 10) {
        if (cancelled) return;
        const batch = results.slice(i, i + 10);
        const descs = await Promise.all(batch.map(async (skill) => {
          const result = await fetchSkillDescription(skill.creator, skill.path);
          return { key: `${skill.creator.id}:${skill.path}`, path: skill.path, creatorId: skill.creator.id, desc: result?.desc || "", blocked: result?.blocked || false };
        }));
        for (const d of descs) if (d.blocked) blockedKeys.add(d.key);
        if (!cancelled) {
          setDescriptions((prev) => {
            const next = { ...prev };
            for (const d of descs) if (!d.blocked) next[d.key] = d.desc;
            return next;
          });
          if (blockedKeys.size > 0) {
            setAllSkills((prev) => prev.filter((s) => !blockedKeys.has(`${s.creator.id}:${s.path}`)));
          }
        }
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  const filtered = skillSearch
    ? allSkills.filter((s) => {
        const q = skillSearch.toLowerCase();
        const desc = descriptions[`${s.creator.id}:${s.path}`] || "";
        return s.name.toLowerCase().includes(q) || s.creator.name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
      })
    : allSkills;

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6 lg:p-8 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">All Skills</h2>
          <p className="text-xs text-muted-foreground">
            {loading
              ? `Loading from ${loadedCount}/${CREATORS.length} creators... (${allSkills.length} skills found)`
              : `${allSkills.length} skills from ${CREATORS.length} creators`}
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search all skills by name, creator, or description..."
          value={skillSearch}
          onChange={(e) => setSkillSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading && allSkills.length === 0 ? (
        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">Loading skills from all creators...</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <Search className="size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No skills found for &quot;{skillSearch}&quot;</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((skill) => {
            const [owner, repo] = skill.creator.github.split("/");
            const skillName = skill.path.split("/").pop() || skill.path;
            const descKey = `${skill.creator.id}:${skill.path}`;
            const desc = descriptions[descKey];
            const needsPath = skill.path.split("/").length > 2;
            const installCmd = needsPath
              ? `npx skills add https://github.com/${owner}/${repo} --skill ${skillName} --path ${skill.path}`
              : `npx skills add https://github.com/${owner}/${repo} --skill ${skillName}`;
            return (
              <Card key={`${skill.creator.id}-${skill.path}`} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="size-4 text-primary shrink-0" />
                      <span className="text-sm font-semibold truncate">{skill.name}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => onInstall(installCmd)}
                    >
                      <Download className="size-3 mr-1" /> Install
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                    {desc === undefined
                      ? <span className="flex items-center gap-1 text-muted-foreground/50"><Loader2 className="size-3 animate-spin" /> Loading...</span>
                      : desc || <span className="italic">No description</span>
                    }
                  </p>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-[10px]">{skill.creator.name}</Badge>
                    <a
                      href={`https://github.com/${owner}/${repo}/tree/main/${skill.path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      Source <ExternalLink className="size-2.5" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {loading && allSkills.length > 0 && (
        <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-xs">Loading more... ({loadedCount}/{CREATORS.length} creators)</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClawHub Integration
// ---------------------------------------------------------------------------

interface ClawHubSkillEntry {
  slug: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  installs?: number;
  stars?: number;
  tags?: string[];
}

function ClawHubSection({ onPreview }: { onPreview: (content: string, source: string) => void }) {
  const [skills, setSkills] = useState<ClawHubSkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<"trending" | "search">("trending");
  const [fetching, setFetching] = useState<string | null>(null);

  async function handlePreview(slug: string) {
    setFetching(slug);
    try {
      const res = await fetch(`/api/clawhub?action=get&slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      const content = data.skill?.readme;
      if (content) {
        onPreview(content, `clawhub.ai/${slug}`);
      } else {
        toast.error("Could not load skill content from ClawHub");
      }
    } catch {
      toast.error("Failed to fetch skill from ClawHub");
    }
    setFetching(null);
  }

  useEffect(() => {
    fetch("/api/clawhub?action=trending&limit=8")
      .then(r => r.json())
      .then(d => { setSkills(d.skills || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setMode("search");
    try {
      const res = await fetch(`/api/clawhub?action=search&q=${encodeURIComponent(searchQuery)}&limit=12`);
      const data = await res.json();
      setSkills(data.skills || []);
    } catch {}
    setSearching(false);
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg" style={{ background: "#ef4444" }}>
            <span className="text-white text-sm">🦞</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">ClawHub</p>
              <Badge variant="outline" className="text-[9px]">13,700+ skills</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Import skills from the OpenClaw community registry
            </p>
          </div>
        </div>
        {mode === "search" && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setMode("trending"); setSearchQuery(""); fetch("/api/clawhub?action=trending&limit=8").then(r => r.json()).then(d => setSkills(d.skills || [])); }}>
            Show trending
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search ClawHub skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={!searchQuery.trim() || searching} variant="outline">
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Search
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : skills.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          {mode === "search" ? "No skills found on ClawHub" : "Could not load ClawHub skills"}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {skills.map((skill) => (
            <div key={skill.slug} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
              <Package className="size-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium">{skill.name || skill.slug}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{skill.description || "No description"}</p>
                <div className="flex items-center gap-2">
                  {skill.author && <Badge variant="secondary" className="text-[10px]">{skill.author}</Badge>}
                  {skill.installs ? <span className="text-[10px] text-muted-foreground">{skill.installs} installs</span> : null}
                  <Badge variant="outline" className="text-[9px] border-red-200 text-red-600">ClawHub</Badge>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                disabled={fetching === skill.slug}
                onClick={() => handlePreview(skill.slug)}
              >
                {fetching === skill.slug ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3 mr-1" />}
                Preview
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MarketplacePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CreatorCategory | "all">("all");
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [browseAll, setBrowseAll] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installCmd, setInstallCmd] = useState("");
  const [installPaste, setInstallPaste] = useState<{ content: string; source: string } | undefined>();

  const creatorsByCategory = getCreatorsByCategory();
  const featured = getFeaturedCreators();

  // Filter creators
  const filtered = CREATORS.filter((c) => {
    if (selectedCategory !== "all" && c.category !== selectedCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    }
    return true;
  });

  const handleInstall = (cmd: string) => {
    setInstallCmd(cmd);
    setInstallOpen(true);
  };

  // Show browse all skills
  if (browseAll) {
    return (
      <>
        <AllSkillsView onBack={() => setBrowseAll(false)} onInstall={handleInstall} />
        <InstallSkillDialog open={installOpen} onOpenChange={(v) => { setInstallOpen(v); if (!v) setInstallPaste(undefined); }} defaultCommand={installCmd} defaultPaste={installPaste} />
      </>
    );
  }

  // Show creator detail
  if (selectedCreator) {
    return (
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6 lg:p-8">
        <CreatorDetailView
          creator={selectedCreator}
          onBack={() => setSelectedCreator(null)}
          onInstall={handleInstall}
        />
        <InstallSkillDialog open={installOpen} onOpenChange={(v) => { setInstallOpen(v); if (!v) setInstallPaste(undefined); }} defaultCommand={installCmd} defaultPaste={installPaste} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <Globe className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
          <p className="text-sm text-muted-foreground">Browse {CREATORS.length} creators and thousands of skills</p>
        </div>
      </div>

      <SkillLimitBanner />

      {/* Search + Install */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search creators and skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={() => setBrowseAll(true)}>
          <Package className="size-4 mr-2" /> Browse All Skills
        </Button>
        <Button variant="outline" onClick={() => { setInstallCmd(""); setInstallOpen(true); }}>
          <Download className="size-4 mr-2" /> Install skill
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          All ({CREATORS.length})
        </button>
        {(Object.keys(CATEGORY_LABELS) as CreatorCategory[]).map((cat) => {
          const count = creatorsByCategory[cat].length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {/* AI Skill Finder - wrapped to prevent crash from breaking page */}
      <ErrorBoundaryWrapper>
        <AISkillFinder
          onInstall={handleInstall}
          onCreateNew={(prompt) => router.push(`/ai-studio?prompt=${encodeURIComponent(prompt)}`)}
        />
      </ErrorBoundaryWrapper>

      {/* ClawHub Integration */}
      {!search && selectedCategory === "all" && (
        <ClawHubSection onPreview={(content, source) => {
          setInstallPaste({ content, source });
          setInstallCmd("");
          setInstallOpen(true);
        }} />
      )}

      {/* Featured (only when no search and "all" selected) */}
      {!search && selectedCategory === "all" && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star className="size-4 text-amber-500" />
            <p className="text-sm font-medium">Featured</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((c) => (
              <CreatorCard key={c.id} creator={c} onClick={() => setSelectedCreator(c)} />
            ))}
          </div>
        </div>
      )}

      {/* All creators */}
      <div>
        {!search && selectedCategory === "all" && (
          <div className="flex items-center gap-2 mb-3">
            <Users className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium">All Creators</p>
          </div>
        )}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8">
              <Search className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No creators found for &quot;{search}&quot;</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <CreatorCard key={c.id} creator={c} onClick={() => setSelectedCreator(c)} />
            ))}
          </div>
        )}
      </div>

      <InstallSkillDialog open={installOpen} onOpenChange={(v) => { setInstallOpen(v); if (!v) setInstallPaste(undefined); }} defaultCommand={installCmd} defaultPaste={installPaste} />
    </div>
  );
}
