// Marketplace creators and their GitHub repos
// Skills are loaded dynamically from GitHub API
// Only repos with actual SKILL.md files are included (verified)

export interface Creator {
  id: string;
  name: string;
  description: string;
  github: string; // owner/repo
  url: string;
  category: CreatorCategory;
  featured?: boolean;
  skillCount?: string; // approximate, for display
  nested?: boolean; // if true, skills are in skills/username/skillname/ structure
}

export type CreatorCategory =
  | "official"
  | "curated"
  | "tools";

export const CATEGORY_LABELS: Record<CreatorCategory, string> = {
  official: "Official",
  curated: "Curated Collections",
  tools: "Tools & Workflows",
};

export const CREATORS: Creator[] = [
  // ─── Official (verified: all have SKILL.md files) ───────────────────────
  { id: "anthropic", name: "Anthropic", description: "Official Claude Code and Claude.ai skills: docx, pdf, pptx, xlsx, frontend-design, mcp-builder, canvas-design and more", github: "anthropics/skills", url: "https://github.com/anthropics/skills", category: "official", featured: true, skillCount: "18" },
  { id: "openai", name: "OpenAI", description: "Official Codex skills catalog: skill-creator, concise planning, deploy, imagegen, linear, jupyter-notebook", github: "openai/skills", url: "https://github.com/openai/skills", category: "official", featured: true, skillCount: "45" },
  { id: "microsoft", name: "Microsoft", description: "Skills for Azure, Bot Framework, Cognitive Services across .NET, Python, TypeScript, Go, Rust, Java", github: "microsoft/skills", url: "https://github.com/microsoft/skills", category: "official", featured: true, skillCount: "176" },
  { id: "google-gemini", name: "Google Gemini", description: "Official Gemini skills for Gemini API, SDK and model interactions", github: "google-gemini/gemini-skills", url: "https://github.com/google-gemini/gemini-skills", category: "official", skillCount: "4" },
  { id: "vercel", name: "Vercel Labs", description: "React best practices, Next.js patterns, web design guidelines. Home of npx skills CLI", github: "vercel-labs/skills", url: "https://github.com/vercel-labs/skills", category: "official", featured: true },
  { id: "vercel-agent", name: "Vercel Agent Skills", description: "Vercel's official collection: React performance (40+ rules), UI code review (100+ rules), web design guidelines, deploy to Vercel", github: "vercel-labs/agent-skills", url: "https://github.com/vercel-labs/agent-skills", category: "official", featured: true, skillCount: "7" },
  { id: "huggingface", name: "Hugging Face", description: "13 skills for AI/ML workflows: fine-tuning, transformers, datasets, spaces. Give agents Hugging Face ecosystem power", github: "huggingface/skills", url: "https://github.com/huggingface/skills", category: "official", skillCount: "13" },
  { id: "remotion", name: "Remotion", description: "Video generation best practices with Remotion - programmatic video creation in React", github: "remotion-dev/skills", url: "https://github.com/remotion-dev/skills", category: "official", skillCount: "1" },
  { id: "supabase", name: "Supabase", description: "Postgres best practices and Supabase development skills", github: "supabase/agent-skills", url: "https://github.com/supabase/agent-skills", category: "official" },

  // ─── Curated Collections (verified: all have installable SKILL.md) ──────
  { id: "sickn33", name: "Antigravity Awesome Skills", description: "Largest installable library: 4200+ skills with CLI installer, bundles, workflows. Claude Code / Cursor / Codex / Gemini CLI", github: "sickn33/antigravity-awesome-skills", url: "https://github.com/sickn33/antigravity-awesome-skills", category: "curated", featured: true, skillCount: "4200+" },
  { id: "composio", name: "ComposioHQ", description: "860+ skills with integrations to external apps: artifacts-builder, brand-guidelines, canvas-design, composio-skills and more", github: "ComposioHQ/awesome-claude-skills", url: "https://github.com/ComposioHQ/awesome-claude-skills", category: "curated", featured: true, skillCount: "860+" },
  { id: "alirezarezvani", name: "alirezarezvani", description: "220+ skills with 268 Python scripts. Engineering, marketing, PM, compliance, C-level advisory", github: "alirezarezvani/claude-skills", url: "https://github.com/alirezarezvani/claude-skills", category: "curated", skillCount: "220+" },
  { id: "rmyndharis", name: "rmyndharis", description: "300+ Enterprise skills: Python, TypeScript, DevOps, security, DeFi, AI engineering", github: "rmyndharis/antigravity-skills", url: "https://github.com/rmyndharis/antigravity-skills", category: "curated", skillCount: "300+" },
  { id: "kdense", name: "K-Dense AI", description: "134 scientific skills for research, science, engineering, analysis, finance and writing", github: "K-Dense-AI/claude-scientific-skills", url: "https://github.com/K-Dense-AI/claude-scientific-skills", category: "curated", skillCount: "134" },
  { id: "orchestra", name: "Orchestra Research", description: "92 AI research and ML engineering skills: fine-tuning, interpretability, distributed training, autoresearch, safety-alignment", github: "Orchestra-Research/AI-Research-SKILLs", url: "https://github.com/Orchestra-Research/AI-Research-SKILLs", category: "curated", skillCount: "92" },
  { id: "jeffallan", name: "Jeffallan / claude-skills", description: "66 specialized skills for full-stack developers. Transform Claude Code into your expert pair programmer", github: "Jeffallan/claude-skills", url: "https://github.com/Jeffallan/claude-skills", category: "curated", skillCount: "66" },
  { id: "bonnguyenitc", name: "bonnguyenitc", description: "60 skills for indie hackers: SEO, legal, analytics, auth, pricing, mobile UI/UX", github: "bonnguyenitc/antigravity-superpowers", url: "https://github.com/bonnguyenitc/antigravity-superpowers", category: "curated", skillCount: "60" },
  { id: "guanyang", name: "guanyang", description: "59 modular skills with upstream sync. Full-stack dev, multimedia, complex logic planning", github: "guanyang/antigravity-skills", url: "https://github.com/guanyang/antigravity-skills", category: "curated", skillCount: "59" },
  { id: "mxyhi", name: "mxyhi / ok-skills", description: "55 curated skills: GSAP animations, Remotion, Impeccable frontend (18 design skills), minimax docs", github: "mxyhi/ok-skills", url: "https://github.com/mxyhi/ok-skills", category: "curated", skillCount: "55" },
  { id: "daymade", name: "daymade / claude-code-skills", description: "47 production-ready skills for enhanced development workflows", github: "daymade/claude-code-skills", url: "https://github.com/daymade/claude-code-skills", category: "curated", skillCount: "47" },
  { id: "zebbern", name: "zebbern", description: "29 security skills: pentesting, OWASP, ethical hacking, AWS security, dependency auditor", github: "zebbern/claude-code-guide", url: "https://github.com/zebbern/claude-code-guide", category: "curated", skillCount: "29" },
  { id: "dimillian", name: "Dimillian", description: "16 skills for Apple platforms: SwiftUI, iOS debugger, Xcode, app-store-changelog, Liquid Glass", github: "Dimillian/Skills", url: "https://github.com/Dimillian/Skills", category: "curated", skillCount: "16" },
  { id: "gmh5225", name: "gmh5225 / awesome-skills", description: "8 skills for AWS, LangChain, Vercel, Cloudflare, MongoDB, OWASP", github: "gmh5225/awesome-skills", url: "https://github.com/gmh5225/awesome-skills", category: "curated", skillCount: "8" },
  { id: "aiskillstore", name: "AI Skill Store Marketplace", description: "4000+ security-audited skills for Claude, Codex & Claude Code. Quality verified with one-click install", github: "aiskillstore/marketplace", url: "https://github.com/aiskillstore/marketplace", category: "curated", featured: true, skillCount: "4000+", nested: true },
  { id: "inference-sh", name: "Inference.sh", description: "80 skills for inference.sh API - gives agents access to hundreds of apps and other agents", github: "inference-sh/skills", url: "https://github.com/inference-sh/skills", category: "curated", skillCount: "80" },
  { id: "mhattingpete", name: "Claude Skills Marketplace", description: "18 skills for software engineering: Git automation, testing, code review, visual documentation", github: "mhattingpete/claude-skills-marketplace", url: "https://github.com/mhattingpete/claude-skills-marketplace", category: "curated", skillCount: "18" },

  // ─── Tools & Workflows (verified: have installable skills) ──────────────
  { id: "obra", name: "obra / Superpowers", description: "Complete dev workflow: brainstorming > spec > plan > TDD > subagent-driven dev > review > merge. 94k+ stars", github: "obra/superpowers", url: "https://github.com/obra/superpowers", category: "tools", featured: true, skillCount: "14" },
  { id: "moiz", name: "Ai-Agent-Skills", description: "18 skills with CLI for managing skill libraries: shelves, collections, catalog and auto-curation", github: "MoizIbnYousaf/Ai-Agent-Skills", url: "https://github.com/MoizIbnYousaf/Ai-Agent-Skills", category: "tools", skillCount: "18" },
  { id: "yusufkaraaslan", name: "Skill Seekers", description: "6 skills + converter: turns docs, GitHub repos, PDFs, videos into SKILL.md. AI-powered generation", github: "yusufkaraaslan/Skill_Seekers", url: "https://github.com/yusufkaraaslan/Skill_Seekers", category: "tools", skillCount: "6" },
  { id: "diet103", name: "diet103 / Infrastructure", description: "5 skills: auto-activation, hooks, agents, dev docs pattern. From 6 months of production use", github: "diet103/claude-code-infrastructure-showcase", url: "https://github.com/diet103/claude-code-infrastructure-showcase", category: "tools", skillCount: "5" },
];

export function getCreatorsByCategory(): Record<CreatorCategory, Creator[]> {
  const result: Record<CreatorCategory, Creator[]> = {
    official: [], curated: [], tools: [],
  };
  for (const c of CREATORS) {
    result[c.category].push(c);
  }
  return result;
}

export function getFeaturedCreators(): Creator[] {
  return CREATORS.filter(c => c.featured);
}
