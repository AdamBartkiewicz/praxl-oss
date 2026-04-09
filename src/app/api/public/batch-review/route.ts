import { NextRequest, NextResponse } from "next/server";
import { callAnthropicRaw, extractJson } from "@/lib/ai-utils";
import { SKILL_EXPERT_SYSTEM_PROMPT, FAST_MODEL } from "@/lib/ai-config";
import { rateLimiter, getClientIp } from "@/lib/rate-limit";
import { securityScan } from "@/lib/security-scan";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders();

  let body: { skills?: Array<{ name: string; content: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }

  const skills = body.skills;
  if (!Array.isArray(skills) || skills.length === 0) {
    return NextResponse.json({ error: "invalid_input", message: "Provide 'skills' array" }, { status: 400, headers });
  }
  if (skills.length > 10) {
    return NextResponse.json({ error: "invalid_input", message: "Max 10 skills per batch" }, { status: 400, headers });
  }

  // Rate limit: 1 batch per IP per 24h
  const ip = getClientIp(request);
  const limit = rateLimiter.check(`batch:${ip}`, 1, 24 * 60 * 60 * 1000);

  const rateLimitHeaders = {
    ...headers,
    "X-RateLimit-Remaining": String(limit.remaining),
    "X-RateLimit-Reset": limit.resetAt.toISOString(),
  };

  if (!limit.allowed) {
    return NextResponse.json({
      error: "rate_limit",
      message: "1 batch review per day. Sign up for unlimited.",
      signupUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-up`,
    }, { status: 429, headers: rateLimitHeaders });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "server_error", message: "AI service not configured" }, { status: 500, headers: rateLimitHeaders });
  }

  // Process in chunks of 5
  const results: Array<{ name: string; score: number; issues: string[]; security: { safe: boolean; criticalCount: number; warningCount: number } }> = [];

  for (let i = 0; i < skills.length; i += 5) {
    const chunk = skills.slice(i, i + 5);

    // Build batch prompt
    const skillsList = chunk.map((s, idx) => `### Skill ${idx + 1}: ${s.name}\n\`\`\`\n${s.content.slice(0, 3000)}\n\`\`\``).join("\n\n");

    const prompt = `Rate each skill 1-5 and list up to 2 issues per skill.

Return ONLY a JSON array. No markdown, no code fences. Each item:
{"name": "skill-name", "score": 3.5, "issues": ["issue 1", "issue 2"]}

${skillsList}`;

    try {
      const result = await callAnthropicRaw(apiKey, FAST_MODEL, SKILL_EXPERT_SYSTEM_PROMPT, [{ role: "user", content: prompt }], 2048);
      const parsed = extractJson(result, "array") as Array<{ name?: string; score?: number; issues?: string[] }> | null;

      for (let j = 0; j < chunk.length; j++) {
        const sec = securityScan(chunk[j].content);
        const aiResult = parsed?.[j];
        results.push({
          name: chunk[j].name,
          score: aiResult?.score ?? 0,
          issues: aiResult?.issues ?? ["Review failed"],
          security: { safe: sec.safe, criticalCount: sec.criticalCount, warningCount: sec.warningCount },
        });
      }
    } catch {
      // Fallback: add all chunk skills with score 0
      for (const s of chunk) {
        const sec = securityScan(s.content);
        results.push({
          name: s.name,
          score: 0,
          issues: ["AI review unavailable"],
          security: { safe: sec.safe, criticalCount: sec.criticalCount, warningCount: sec.warningCount },
        });
      }
    }
  }

  return NextResponse.json({ reviews: results }, { headers: rateLimitHeaders });
}
