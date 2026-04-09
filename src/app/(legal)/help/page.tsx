import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { HelpToc } from "@/components/help-toc";

export const metadata: Metadata = {
  title: "Help & Documentation - Praxl",
  description: "Learn how to use Praxl to manage, version, and deploy AI skills",
};

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 pl-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>;
}

function Code({ children }: { children: string }) {
  return <code className="block rounded-lg bg-muted px-4 py-3 font-mono text-xs whitespace-pre overflow-x-auto">{children}</code>;
}

const toc = [
  { id: "getting-started", label: "Getting Started" },
  { id: "skills", label: "Skills" },
  { id: "editor", label: "Skill Editor" },
  { id: "ai", label: "AI Features" },
  { id: "cli", label: "CLI (praxl-app)" },
  { id: "sync", label: "Sync & Deploy" },
  { id: "marketplace", label: "Marketplace" },
  { id: "security", label: "Security" },
  { id: "projects", label: "Projects" },
  { id: "faq", label: "FAQ" },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Help & Documentation</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything you need to know about using Praxl</p>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[200px_1fr]">
        {/* Table of contents - sticky with active section highlight */}
        <HelpToc items={toc} />

        {/* Content */}
        <div className="space-y-12">
          <Section title="Getting Started" id="getting-started">
            <P>Praxl is an AI skill manager that lets you create, edit, version, and deploy skills across all your AI coding tools - Claude Code, Cursor, Codex, Windsurf, and more.</P>

            <SubSection title="1. Sign up">
              <P>Create an account at <Link href="/sign-up" className="text-primary hover:underline">/sign-up</Link>. You can sign in with email or GitHub.</P>
            </SubSection>

            <SubSection title="2. Set up your API key">
              <P>Go to <Link href="/settings" className="text-primary hover:underline">Settings</Link> and add your Anthropic API key. This enables AI features like skill review, description optimization, and the AI assistant.</P>
            </SubSection>

            <SubSection title="3. Create or import skills">
              <P>You can create a skill from scratch, import from a ZIP file, paste SKILL.md content, or install from the Marketplace. You can also connect the CLI to sync local skills.</P>
            </SubSection>
          </Section>

          <Section title="Skills" id="skills">
            <P>A skill is a SKILL.md file that teaches AI coding tools how to handle specific tasks. Each skill has:</P>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li><strong>Frontmatter</strong> - YAML metadata (name, description, allowed-tools, etc.)</li>
              <li><strong>Body</strong> - Markdown instructions, examples, and troubleshooting</li>
              <li><strong>Reference files</strong> - Optional supporting docs, scripts, templates</li>
            </ul>

            <SubSection title="Skill structure">
              <Code>{`---
name: my-skill
description: Use when user asks to do X. Helps with Y and Z.
allowed-tools: Bash(npm *) Read Grep
---

# Instructions
Step-by-step guidance for the AI...

## Examples
Concrete usage scenarios...

## Troubleshooting
Common errors and fixes...`}</Code>
            </SubSection>

            <SubSection title="Description best practices">
              <P>Claude Code reads only the first <strong>250 characters</strong> of the description to decide when to trigger a skill. Front-load the key use case. Praxl warns you when you exceed 250 characters and offers an AI optimizer.</P>
            </SubSection>
          </Section>

          <Section title="Skill Editor" id="editor">
            <P>The editor provides a full IDE experience for skills:</P>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li><strong>Code/Visual mode</strong> - Edit raw SKILL.md or use the structured form</li>
              <li><strong>Details panel</strong> - Edit frontmatter fields individually</li>
              <li><strong>Quality panel</strong> - Validation issues with AI auto-fix</li>
              <li><strong>Security panel</strong> - Real-time security scanning as you type</li>
              <li><strong>History panel</strong> - Version history with diff viewer and rollback</li>
              <li><strong>Files panel</strong> - Manage reference files (scripts, docs, templates)</li>
              <li><strong>AI Assistant</strong> - Chat with AI about your skill, get fixes, suggestions</li>
            </ul>
            <P>The top badge shows overall status: green &quot;All clear&quot; when validation and security pass, or warnings/errors to fix.</P>
          </Section>

          <Section title="AI Features" id="ai">
            <P>Praxl uses the Anthropic API (Claude) for several features. You need an API key in Settings.</P>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li><strong>AI Assistant</strong> - Chat with AI in the skill editor. It can directly edit your skill.</li>
              <li><strong>AI Auto-fix</strong> - Click &quot;AI Auto-fix&quot; on any quality issue to fix it automatically</li>
              <li><strong>AI Improve Description</strong> - Rewrites your description to be better</li>
              <li><strong>Optimize for Claude Code</strong> - Shortens description to 250 chars</li>
              <li><strong>AI Skill Finder</strong> - Describe what you need, AI searches 2000+ marketplace skills</li>
              <li><strong>AI Review</strong> - Get a quality score and improvement suggestions</li>
              <li><strong>Generate Skill</strong> - Create a complete skill from a text prompt</li>
            </ul>
          </Section>

          <Section title="CLI (praxl-app)" id="cli">
            <P>The Praxl CLI syncs skills between the cloud and your local machine.</P>

            <SubSection title="Install">
              <Code>npm install -g praxl-app</Code>
            </SubSection>

            <SubSection title="Commands">
              <Code>{`praxl connect               # Connect & sync (recommended)
praxl scan                  # Quality score + security check
praxl scan --ai             # Deep AI review
praxl scan --json           # Machine-readable output
praxl login                 # Save auth token
praxl sync                  # One-time download
praxl sync --watch          # Watch mode (poll every 30s)
praxl import --path ~/.cursor/skills  # Import local skills
praxl status                # Show your skills
praxl --version             # Check version`}</Code>
            </SubSection>

            <SubSection title="How sync works">
              <P>When you run <code className="bg-muted px-1 rounded text-xs">praxl connect</code>, the CLI polls the Praxl API every 15 seconds. It only downloads skills when you explicitly Deploy in the web app - saving a draft does NOT trigger sync.</P>
            </SubSection>
          </Section>

          <Section title="Sync & Deploy" id="sync">
            <P>Praxl separates <strong>saving</strong> (draft) from <strong>deploying</strong> (live):</P>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li><strong>Save</strong> - Creates a new version in the database. Does NOT sync to CLI.</li>
              <li><strong>Deploy</strong> - Marks a version as deployed. CLI picks it up on next poll.</li>
            </ul>
            <P>Sync targets define which platforms receive your skills (Claude Code, Cursor, Codex, etc.). Configure them in <Link href="/sync" className="text-primary hover:underline">Sync settings</Link>.</P>
          </Section>

          <Section title="Marketplace" id="marketplace">
            <P>Browse and install skills from 24 verified GitHub repositories with 2000+ skills. Use the <strong>AI Skill Finder</strong> to describe what you need - AI will find the best match.</P>
            <P>If no existing skill matches, Praxl offers to create a custom one with AI in the skill creator.</P>
            <P>You can install skills via:</P>
            <ul className="list-disc pl-6 text-sm text-muted-foreground space-y-1">
              <li>Click &quot;Install&quot; on any skill card</li>
              <li>Paste an install command from skills.sh</li>
              <li>Paste raw SKILL.md content</li>
            </ul>
          </Section>

          <Section title="Security" id="security">
            <P>Praxl scans all skills for common security risks:</P>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-3 space-y-1">
                <Badge variant="destructive" className="text-[10px]">Critical</Badge>
                <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                  <li>Shell command execution (exec, eval)</li>
                  <li>Remote code execution (curl | bash)</li>
                  <li>Hardcoded credentials</li>
                  <li>Recursive file deletion (rm -rf)</li>
                  <li>Content obfuscation (base64)</li>
                </ul>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-500">Warning</Badge>
                <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                  <li>Elevated privileges (sudo)</li>
                  <li>Permission changes (chmod)</li>
                  <li>Environment file references (.env)</li>
                  <li>Database destruction (DROP TABLE)</li>
                  <li>Network tools (netcat, reverse shell)</li>
                </ul>
              </div>
            </div>
            <P>Critical flags block marketplace installation. Security badges are visible on skill cards, in the editor, and during install preview.</P>
          </Section>

          <Section title="Projects" id="projects">
            <P>Organize skills into projects. Each project can have its own context, template, and color. Skills can be assigned to a project from the skill editor or the projects page.</P>
          </Section>

          <Section title="FAQ" id="faq">
            <SubSection title="Where are skills stored?">
              <P>Skills are stored in Praxl&apos;s cloud database (Supabase PostgreSQL). When synced via CLI, they&apos;re written to local directories like ~/.claude/skills/ for Claude Code.</P>
            </SubSection>
            <SubSection title="Is my data safe?">
              <P>Yes. All connections use SSL/TLS. Security headers (HSTS, CSP, X-Frame-Options) are configured. API keys are stored per-user. CLI tokens have restricted file permissions.</P>
            </SubSection>
            <SubSection title="Can I use Praxl with multiple AI tools?">
              <P>Yes. Configure sync targets in Settings for each platform (Claude Code, Cursor, Codex, Windsurf, etc.). Each skill can be deployed to specific platforms.</P>
            </SubSection>
            <SubSection title="What happens if I delete a skill?">
              <P>The skill and all its versions are deleted from Praxl. Local copies on your machine are not deleted - the CLI doesn&apos;t remove files.</P>
            </SubSection>
            <SubSection title="How do I get support?">
              <P>Contact us at hello@praxl.app or open an issue on GitHub.</P>
            </SubSection>
          </Section>
        </div>
      </div>
    </div>
  );
}
