import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Changelog - Praxl",
  description: "What's new in Praxl",
};

const entries = [
  {
    date: "April 4, 2026",
    version: "1.8",
    tag: "latest" as const,
    changes: [
      { type: "new" as const, text: "Admin panel with user management, error tracking, and system health" },
      { type: "new" as const, text: "AI Skill Finder - describe what you need, AI finds the right skill from 2000+ indexed" },
      { type: "new" as const, text: "Marketplace expanded to 24 verified creators with Browse All Skills view" },
      { type: "new" as const, text: "Dashboard redesign - personalized greeting, status pills, quick action cards" },
      { type: "new" as const, text: "Changelog and Help/Documentation pages" },
      { type: "improved" as const, text: "Design unification - warm palette matching landing page, Plus Jakarta Sans font" },
      { type: "improved" as const, text: "Security scan visible everywhere: skill cards, editor panel, install dialog" },
      { type: "improved" as const, text: "AI fix issues - 45s timeout, better error messages, issues shown in AI chat" },
      { type: "fixed" as const, text: "CLI sync only triggers on deploy, not every save" },
      { type: "fixed" as const, text: "Validation uses live editor state instead of stale DB values" },
      { type: "fixed" as const, text: "Sync log deduplication - no more spam entries" },
    ],
  },
  {
    date: "April 3, 2026",
    version: "1.7",
    changes: [
      { type: "new" as const, text: "Security hardening of CLI: path traversal fix, command injection prevention" },
      { type: "new" as const, text: "250-character description warning with AI optimize for Claude Code" },
      { type: "new" as const, text: "Production readiness: error pages, legal pages, SEO, error tracking" },
      { type: "improved" as const, text: "CLI token stored with chmod 600, size limits on skills" },
      { type: "fixed" as const, text: "CLI --version and --help flags were being ignored" },
    ],
  },
  {
    date: "April 2, 2026",
    version: "1.6",
    changes: [
      { type: "new" as const, text: "CSP headers: allow Monaco CDN, Clerk blob workers, jsdelivr fonts" },
      { type: "fixed" as const, text: "tRPC routes blocked by middleware" },
      { type: "fixed" as const, text: "Skill cards footer alignment with flex + mt-auto" },
    ],
  },
  {
    date: "March 31, 2026",
    version: "1.5",
    changes: [
      { type: "new" as const, text: "Redesign to Claude/Anthropic warm color palette" },
      { type: "new" as const, text: "Security hardening: fix all CRITICAL, HIGH, and MEDIUM issues" },
      { type: "new" as const, text: "Personalized CLI connect command with token in Settings" },
      { type: "new" as const, text: "Projects rebuild: context, templates, rich dashboard, AI integration" },
    ],
  },
  {
    date: "March 30, 2026",
    version: "1.4",
    changes: [
      { type: "new" as const, text: "Marketplace with 31 creators, categories, and skill browser" },
      { type: "new" as const, text: "Onboarding wizard for new users" },
      { type: "new" as const, text: "Inline diff editor with contextual suggestions and Fix All" },
      { type: "new" as const, text: "Version control: true rollback, diff viewer, file versioning" },
      { type: "new" as const, text: "Skill Playground: test scenarios, A/B version comparison" },
    ],
  },
  {
    date: "March 29, 2026",
    version: "1.0 – 1.3",
    changes: [
      { type: "new" as const, text: "AI Chat with tool use - AI directly edits skills" },
      { type: "new" as const, text: "Real-time streaming AI chat with token-by-token display" },
      { type: "new" as const, text: "Change requests system (like PRs for skills)" },
      { type: "new" as const, text: "Skill Distribution matrix with per-platform deployment" },
      { type: "new" as const, text: "CLI published on npm as praxl-app" },
      { type: "new" as const, text: "Praxl v1.0 - initial release" },
    ],
  },
];

const typeBadge = {
  new: { label: "New", className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
  improved: { label: "Improved", className: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  fixed: { label: "Fixed", className: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Changelog</h1>
        <p className="mt-1 text-sm text-muted-foreground">What&apos;s new and improved in Praxl</p>
      </div>

      <div className="space-y-10">
        {entries.map((entry) => (
          <div key={entry.version} className="relative">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold">v{entry.version}</h2>
              <span className="text-xs text-muted-foreground">{entry.date}</span>
              {entry.tag === "latest" && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">latest</Badge>
              )}
            </div>
            <div className="space-y-2 pl-1">
              {entry.changes.map((change, i) => {
                const badge = typeBadge[change.type];
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <Badge variant="outline" className={`shrink-0 text-[10px] mt-0.5 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                    <p className="text-sm text-muted-foreground">{change.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
