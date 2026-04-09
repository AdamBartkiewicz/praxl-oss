const CLAWHUB_API = "https://clawhub.ai/api/v1";

export interface ClawHubSkill {
  slug: string;
  name: string;
  description: string;
  readme: string;
  version: string;
  author?: string;
  installs?: number;
  stars?: number;
  updatedAt?: string;
  tags?: string[];
}

/** Search ClawHub registry for skills */
export async function searchClawHub(query: string, limit = 20): Promise<ClawHubSkill[]> {
  const res = await fetch(`${CLAWHUB_API}/search?q=${encodeURIComponent(query)}&limit=${limit * 2}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.skills || data.results || data || [])
    .map(normalizeSkill)
    .filter((s: ClawHubSkill) => isLikelyEnglish(s.name + " " + s.description))
    .slice(0, limit);
}

/** Get trending/popular skills from ClawHub (uses search since /skills returns empty without auth) */
export async function trendingClawHub(limit = 20): Promise<ClawHubSkill[]> {
  // /skills endpoint requires auth, so search for popular categories instead
  const queries = ["code review", "testing", "documentation", "deployment", "refactoring"];
  const all: ClawHubSkill[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    if (all.length >= limit) break;
    const results = await searchClawHub(q, 5);
    for (const s of results) {
      if (!seen.has(s.slug)) { seen.add(s.slug); all.push(s); }
    }
  }
  return all.slice(0, limit);
}

/** Get latest skills from ClawHub */
export async function latestClawHub(limit = 20): Promise<ClawHubSkill[]> {
  const res = await fetch(`${CLAWHUB_API}/skills?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || data.skills || []).map(normalizeSkill);
}

/** Get a single skill from ClawHub by slug */
export async function getClawHubSkill(slug: string): Promise<ClawHubSkill | null> {
  const res = await fetch(`${CLAWHUB_API}/skills/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  const data = await res.json();
  const raw = data.skill || data;
  const skill = normalizeSkill(raw);

  // Enrich with owner info
  if (data.owner?.handle) skill.author = data.owner.handle;
  if (raw.stats?.installsAllTime) skill.installs = raw.stats.installsAllTime;
  if (raw.stats?.stars) skill.stars = raw.stats.stars;

  // Try to download the actual SKILL.md content
  if (!skill.readme) {
    const content = await downloadSkillContent(slug);
    if (content) skill.readme = content;
  }

  return skill;
}

/** Download SKILL.md content from ClawHub (downloads ZIP and extracts) */
async function downloadSkillContent(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${CLAWHUB_API}/download?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return null;

    const JSZip = (await import("jszip")).default;
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    // Find SKILL.md in the zip (could be at root or nested)
    const skillFile = zip.file("SKILL.md") || zip.file(/SKILL\.md$/i)[0];
    if (!skillFile) return null;

    return skillFile.async("string");
  } catch {
    return null;
  }
}

/** Check if text is primarily English (simple heuristic) */
function isLikelyEnglish(text: string): boolean {
  if (!text || text.length < 10) return true;
  // Check for high ratio of ASCII characters (English text)
  const ascii = text.replace(/[^\x20-\x7E]/g, "").length;
  return ascii / text.length > 0.85;
}

function normalizeSkill(raw: any): ClawHubSkill {
  return {
    slug: raw.slug || raw.name || "",
    name: raw.displayName || raw.name || raw.slug || "",
    description: raw.summary || raw.description || "",
    readme: raw.readme || raw.content || raw.skillMd || "",
    version: raw.version || raw.latestVersion || "1.0.0",
    author: raw.author || raw.publisher || raw.createdBy || undefined,
    installs: raw.installs || raw.downloads || 0,
    stars: raw.stars || raw.score || 0,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags : Array.isArray(raw.categories) ? raw.categories : [],
  };
}
