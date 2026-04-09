import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceSkills } from "@/db/schema";
import { sql, ilike, or } from "drizzle-orm";
import { callAnthropicRaw } from "@/lib/ai-utils";

// AI-powered skill search
// POST /api/marketplace/search { query: "I want to build a landing page" }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = (body.query || "").trim();
  if (!query) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  // Step 1: Get total count
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(marketplaceSkills);
  const totalIndexed = Number(countResult[0]?.count || 0);

  if (totalIndexed === 0) {
    return NextResponse.json({
      results: [],
      totalIndexed: 0,
      suggestion: "Marketplace index is empty. Run POST /api/marketplace/index to populate.",
    });
  }

  // Step 2: Keyword search - split query into words, search across searchText
  const words = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
  const conditions = words.map((word: string) => ilike(marketplaceSkills.searchText, `%${word}%`));

  let keywordResults = await db
    .select()
    .from(marketplaceSkills)
    .where(conditions.length > 0 ? or(...conditions) : undefined)
    .limit(50);

  // Step 3: If we have enough keyword results, rank them with AI
  if (keywordResults.length > 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const skillList = keywordResults.map((s, i) =>
          `${i + 1}. "${s.name}" by ${s.creatorName} - ${s.description || "no description"}`
        ).join("\n");

        const rankingResult = await callAnthropicRaw(
          apiKey,
          "claude-haiku-4-5-20251001",
          "You rank skills by relevance. Return ONLY a JSON array of numbers (1-indexed positions from the list). Most relevant first. Max 10.",
          [{
            role: "user",
            content: `User wants: "${query}"\n\nSkills:\n${skillList}\n\nReturn JSON array of the most relevant skill numbers, e.g. [3, 1, 7]. Max 10.`,
          }],
          256
        );

        // Parse ranking
        const match = rankingResult.match(/\[[\d,\s]+\]/);
        if (match) {
          const indices: number[] = JSON.parse(match[0]);
          const ranked = indices
            .filter(i => i >= 1 && i <= keywordResults.length)
            .map(i => keywordResults[i - 1])
            .filter(Boolean);
          if (ranked.length > 0) {
            keywordResults = ranked;
          }
        }
      } catch {
        // AI ranking failed, use keyword order
      }
    }
  }

  // Step 4: Format response
  const results = keywordResults.slice(0, 10).map(s => ({
    name: s.name,
    slug: s.slug,
    description: s.description,
    creator: s.creatorName,
    repo: s.repo,
    path: s.path,
    category: s.category,
    installCommand: `npx skills add https://github.com/${s.repo} --skill ${s.path.split("/").pop()}`,
  }));

  return NextResponse.json({
    results,
    totalIndexed,
    query,
    found: results.length > 0,
    suggestion: results.length === 0
      ? "No matching skills found. Would you like to create a custom skill for this?"
      : null,
  });
}
