"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Target,
  ListOrdered,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  Tag,
  Monitor,
  Shield,
  Info,
  Hash,
  ArrowRight,
} from "lucide-react";

interface SkillVisualViewProps {
  content: string;
}

interface ParsedSection {
  type: "frontmatter" | "heading" | "instructions" | "examples" | "troubleshooting" | "other";
  title: string;
  level: number;
  content: string;
  subsections?: { title: string; content: string }[];
}

function parseSkillSections(content: string): {
  frontmatter: Record<string, string>;
  sections: ParsedSection[];
  completeness: { score: number; has: string[]; missing: string[] };
} {
  const fm: Record<string, string> = {};
  let body = content;

  // Parse frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    const yaml = fmMatch[1];
    body = fmMatch[2];
    let currentKey = "";
    let multiline = false;
    let multiVal = "";

    for (const line of yaml.split("\n")) {
      if (multiline) {
        if (line.startsWith("  ")) {
          multiVal += (multiVal ? " " : "") + line.trim();
          continue;
        } else {
          fm[currentKey] = multiVal;
          multiline = false;
        }
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (val === ">" || val === "|") {
        currentKey = key;
        multiVal = "";
        multiline = true;
      } else if (key === "metadata") {
        continue;
      } else if (val.startsWith("  ")) {
        // metadata sub-key, skip
      } else {
        fm[key] = val.replace(/^["']|["']$/g, "");
      }
    }
    if (multiline) fm[currentKey] = multiVal;
  }

  // Parse body into sections by headings
  const sections: ParsedSection[] = [];
  const lines = body.split("\n");
  let currentSection: ParsedSection | null = null;
  let buffer: string[] = [];

  function flushSection() {
    if (currentSection) {
      currentSection.content = buffer.join("\n").trim();
      // Parse subsections (### headings)
      const subs: { title: string; content: string }[] = [];
      const subParts = currentSection.content.split(/^###\s+/m);
      if (subParts.length > 1) {
        for (let i = 1; i < subParts.length; i++) {
          const subLines = subParts[i].split("\n");
          subs.push({ title: subLines[0].trim(), content: subLines.slice(1).join("\n").trim() });
        }
        currentSection.subsections = subs;
      }
      sections.push(currentSection);
    }
  }

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);

    if (h1 || h2) {
      flushSection();
      const title = (h1 || h2)![1].trim();
      const level = h1 ? 1 : 2;
      const lower = title.toLowerCase();
      let type: ParsedSection["type"] = "other";
      if (lower.includes("instruction") || lower.includes("step") || lower.includes("workflow") || lower.includes("how to")) type = "instructions";
      else if (lower.includes("example")) type = "examples";
      else if (lower.includes("troubleshoot") || lower.includes("error") || lower.includes("issue") || lower.includes("common")) type = "troubleshooting";
      else if (lower.includes("when to use") || lower.includes("trigger")) type = "instructions";

      currentSection = { type, title, level, content: "", subsections: [] };
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flushSection();

  // Completeness check
  const has: string[] = [];
  const missing: string[] = [];

  if (fm.name) has.push("Name"); else missing.push("Name");
  if (fm.description && fm.description.length > 30) has.push("Description"); else missing.push("Description");
  if (sections.some((s) => s.type === "instructions")) has.push("Instructions"); else missing.push("Instructions");
  if (sections.some((s) => s.type === "examples")) has.push("Examples"); else missing.push("Examples");
  if (sections.some((s) => s.type === "troubleshooting")) has.push("Troubleshooting"); else missing.push("Troubleshooting");
  if (body.length > 200) has.push("Sufficient content"); else missing.push("Sufficient content");

  const score = Math.round((has.length / (has.length + missing.length)) * 100);

  return { frontmatter: fm, sections, completeness: { score, has, missing } };
}

function SectionIcon({ type }: { type: ParsedSection["type"] }) {
  switch (type) {
    case "instructions": return <ListOrdered className="size-4" />;
    case "examples": return <BookOpen className="size-4" />;
    case "troubleshooting": return <AlertTriangle className="size-4" />;
    default: return <FileText className="size-4" />;
  }
}

function sectionColor(type: ParsedSection["type"]) {
  switch (type) {
    case "instructions": return { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-500", dot: "bg-blue-500" };
    case "examples": return { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-500", dot: "bg-violet-500" };
    case "troubleshooting": return { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-500", dot: "bg-amber-500" };
    default: return { bg: "bg-muted/50", border: "border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" };
  }
}

function MarkdownPreview({ text }: { text: string }) {
  // Simple inline markdown: bold, code, lists
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return null;
        const isBullet = /^[-*]\s/.test(line.trim());
        const isNumbered = /^\d+\.\s/.test(line.trim());
        const isCheckbox = /^-\s*\[[ x]\]/.test(line.trim());

        let content = line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").replace(/^-\s*\[[ x]\]\s*/, "");
        // Bold
        content = content.replace(/\*\*(.+?)\*\*/g, "⟨b⟩$1⟨/b⟩");

        const parts = content.split(/⟨\/?b⟩/);
        const isBold = content.includes("⟨b⟩");

        return (
          <div key={i} className={`text-xs leading-relaxed ${isBullet || isNumbered ? "flex gap-2" : ""}`}>
            {isBullet && <span className="text-muted-foreground shrink-0">•</span>}
            {isNumbered && <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{line.trim().match(/^\d+/)?.[0]}.</span>}
            {isCheckbox && (
              <span className="shrink-0">
                {line.includes("[x]") ? <CheckCircle2 className="size-3 text-emerald-500 inline" /> : <span className="inline-block size-3 rounded border border-border" />}
              </span>
            )}
            <span className="text-muted-foreground">
              {parts.map((part, j) => (
                j % 2 === 1 && isBold
                  ? <strong key={j} className="text-foreground font-medium">{part}</strong>
                  : <span key={j}>{part}</span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SectionCard({ section }: { section: ParsedSection }) {
  const [expanded, setExpanded] = React.useState(true);
  const colors = sectionColor(section.type);

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden transition-all`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className={`flex items-center justify-center size-6 rounded-md ${colors.bg} ${colors.text}`}>
          <SectionIcon type={section.type} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{section.title}</span>
          {section.subsections && section.subsections.length > 0 && (
            <span className="ml-2 text-[10px] text-muted-foreground">{section.subsections.length} sub-sections</span>
          )}
        </div>
        <Badge variant="outline" className={`text-[10px] ${colors.text} border-current/20`}>{section.type}</Badge>
        {expanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <Separator />
          {section.subsections && section.subsections.length > 0 ? (
            <div className="space-y-2">
              {section.subsections.map((sub, i) => (
                <div key={i} className="rounded-md bg-background/50 border border-border/50 p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={`size-1.5 rounded-full ${colors.dot}`} />
                    <span className="text-xs font-medium">{sub.title}</span>
                  </div>
                  <MarkdownPreview text={sub.content} />
                </div>
              ))}
            </div>
          ) : (
            <MarkdownPreview text={section.content} />
          )}
        </div>
      )}
    </div>
  );
}

export function SkillVisualView({ content }: SkillVisualViewProps) {
  const { frontmatter, sections, completeness } = React.useMemo(
    () => parseSkillSections(content),
    [content]
  );

  if (!content || content.trim().length < 10) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="size-8 mb-2 opacity-40" />
        <p className="text-sm">Start writing your skill to see the visual view</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Completeness bar */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Skill Completeness</span>
          <span className={`text-xs font-bold ${completeness.score >= 80 ? "text-emerald-500" : completeness.score >= 50 ? "text-amber-500" : "text-red-500"}`}>
            {completeness.score}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              completeness.score >= 80 ? "bg-emerald-500" : completeness.score >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${completeness.score}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {completeness.has.map((item) => (
            <div key={item} className="flex items-center gap-1 text-[10px] text-emerald-500">
              <CheckCircle2 className="size-3" />{item}
            </div>
          ))}
          {completeness.missing.map((item) => (
            <div key={item} className="flex items-center gap-1 text-[10px] text-red-400">
              <XCircle className="size-3" />{item}
            </div>
          ))}
        </div>
      </div>

      {/* Frontmatter card */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <div className="flex items-center justify-center size-6 rounded-md bg-primary/10 text-primary">
            <Zap className="size-4" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-medium">{frontmatter.name || "Unnamed Skill"}</span>
          </div>
          <Badge variant="outline" className="text-[10px] text-primary border-primary/20">frontmatter</Badge>
        </div>
        <Separator />
        <div className="px-3 py-2.5 space-y-2">
          {/* Description */}
          {frontmatter.description && (
            <div className="flex gap-2">
              <Target className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">{frontmatter.description}</p>
            </div>
          )}
          {/* Meta row */}
          <div className="flex flex-wrap gap-2">
            {frontmatter.license && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Shield className="size-3" />{frontmatter.license}
              </div>
            )}
            {frontmatter.compatibility && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Monitor className="size-3" />{frontmatter.compatibility}
              </div>
            )}
            {frontmatter["allowed-tools"] && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Info className="size-3" />{frontmatter["allowed-tools"]}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sections flow */}
      {sections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Hash className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sections ({sections.length})</span>
          </div>
          {/* Flow connector */}
          <div className="relative space-y-2">
            {sections.map((section, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowRight className="size-3 text-muted-foreground/30 rotate-90" />
                  </div>
                )}
                <SectionCard section={section} />
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-xs text-muted-foreground">No sections found. Add headings (## Section Name) to structure your skill.</p>
        </div>
      )}
    </div>
  );
}
