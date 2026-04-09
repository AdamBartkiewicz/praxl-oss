import { NextRequest, NextResponse } from "next/server";
import { callAnthropicRaw, extractJson } from "@/lib/ai-utils";
import { SKILL_EXPERT_SYSTEM_PROMPT, PUBLIC_REVIEW_PROMPT, FAST_MODEL } from "@/lib/ai-config";
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

  // Parse body
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "Request body must be valid JSON" }, { status: 400, headers });
  }

  const content = body.content;

  // Validate
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "invalid_content", message: "Missing 'content' field" }, { status: 400, headers });
  }
  if (content.length < 50) {
    return NextResponse.json({ error: "invalid_content", message: "Content too short (min 50 characters)" }, { status: 400, headers });
  }
  if (content.length > 50000) {
    return NextResponse.json({ error: "invalid_content", message: "Content too large (max 50KB)" }, { status: 400, headers });
  }
  if (!content.includes("---")) {
    return NextResponse.json({ error: "invalid_content", message: "Content must be a valid SKILL.md with YAML frontmatter (---)" }, { status: 400, headers });
  }

  // Rate limit by IP
  const ip = getClientIp(request);
  const limit = rateLimiter.check(ip, 3, 24 * 60 * 60 * 1000); // 3 per 24h

  const rateLimitHeaders = {
    ...headers,
    "X-RateLimit-Remaining": String(limit.remaining),
    "X-RateLimit-Reset": limit.resetAt.toISOString(),
  };

  if (!limit.allowed) {
    return NextResponse.json({
      error: "rate_limit",
      message: "3 free reviews per day. Sign up for unlimited reviews.",
      signupUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign-up`,
    }, { status: 429, headers: rateLimitHeaders });
  }

  // API key from env (backend key, not user key)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "server_error", message: "AI service not configured" }, { status: 500, headers: rateLimitHeaders });
  }

  // Security scan (instant, no AI)
  const security = securityScan(content);

  // AI review
  try {
    const prompt = PUBLIC_REVIEW_PROMPT.replace("{CONTENT}", content);
    const result = await callAnthropicRaw(apiKey, FAST_MODEL, SKILL_EXPERT_SYSTEM_PROMPT, [{ role: "user", content: prompt }], 2048);

    const parsed = extractJson(result, "object") as {
      score?: number;
      scores?: Record<string, number>;
      summary?: string;
      issues?: Array<{ severity: string; category: string; title: string; description: string; fix: string }>;
      suggestedTriggers?: string[];
    } | null;

    if (!parsed || !parsed.score) {
      return NextResponse.json({
        error: "ai_error",
        message: "AI returned invalid response. Try again.",
      }, { status: 500, headers: rateLimitHeaders });
    }

    return NextResponse.json({
      score: parsed.score,
      scores: parsed.scores || {},
      summary: parsed.summary || "",
      issues: parsed.issues || [],
      suggestedTriggers: parsed.suggestedTriggers || [],
      security: {
        safe: security.safe,
        flags: security.flags,
      },
    }, { headers: rateLimitHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "ai_error", message: msg }, { status: 500, headers: rateLimitHeaders });
  }
}
