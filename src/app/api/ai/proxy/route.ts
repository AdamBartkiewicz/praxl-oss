import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canUseAi, incrementAiUsage, type AiFeature } from "@/lib/ai-usage";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const userId = session.userId;

  const body = await request.json();
  const { feature, messages, system } = body as {
    feature: AiFeature;
    messages: Array<{ role: string; content: string }>;
    system?: string;
  };

  if (!feature || !messages) {
    return NextResponse.json({ error: "Missing feature or messages" }, { status: 400 });
  }

  const isPro = true; // Open-source: everything unlocked

  // Check limits
  const check = await canUseAi(userId, isPro, feature);
  if (!check.allowed) {
    return NextResponse.json({
      error: "AI limit reached",
      used: check.used,
      limit: check.limit,
      feature,
      upgrade: false,
    }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_SERVER_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured on server" }, { status: 503 });
  }

  try {
    const anthropicBody: Record<string, unknown> = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages,
    };
    if (system) anthropicBody.system = system;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", res.status, errText);
      return NextResponse.json({ error: `Anthropic API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();

    // Increment usage on success
    await incrementAiUsage(userId, feature);

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI request failed" }, { status: 500 });
  }
}
