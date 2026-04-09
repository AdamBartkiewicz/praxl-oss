// Shared AI utility functions - extracted from server/routers/ai.ts
// No server-only dependencies (no DB, no tRPC) so these can be used anywhere.

export type AnthropicMessage = { role: string; content: string };

// Direct fetch to Anthropic API - no SDK dependency, full control over error handling
export async function callAnthropicRaw(
  apiKey: string,
  model: string,
  system: string,
  messages: AnthropicMessage[],
  maxTokens: number
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
      signal: AbortSignal.timeout(45000), // 45s timeout
    });
  } catch (fetchErr: unknown) {
    if (fetchErr instanceof DOMException && fetchErr.name === "TimeoutError") {
      throw new Error("Anthropic API timed out after 45s. Try a faster model or shorter content.");
    }
    const msg = fetchErr instanceof Error ? fetchErr.message : "Network error";
    throw new Error(`Failed to reach Anthropic API: ${msg}`);
  }

  // Read as text first - handles HTML error pages from proxies
  const rawText = await res.text().catch(() => "");

  if (!res.ok) {
    // Try to parse JSON error, fall back to raw text
    let errMsg = `${res.status} ${res.statusText}`;
    try {
      const errBody = JSON.parse(rawText);
      errMsg = errBody?.error?.message || errMsg;
    } catch {
      // rawText might be HTML - show first 200 chars
      if (rawText.length > 0) errMsg = `${res.status}: ${rawText.slice(0, 200)}`;
    }

    const error = new Error(`Anthropic API error: ${errMsg}`) as Error & { status: number };
    error.status = res.status;
    throw error;
  }

  // Parse successful response
  let body: { content?: { type: string; text?: string }[] };
  try {
    body = JSON.parse(rawText);
  } catch {
    throw new Error(`Anthropic returned invalid JSON (got ${rawText.slice(0, 100)}...)`);
  }

  if (!body?.content) {
    throw new Error("Empty response from Anthropic API");
  }

  const textBlock = body.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

// Safe JSON extraction from AI text - handles markdown code blocks, preamble, etc.
export function extractJson(text: string, type: "object" | "array"): unknown | null {
  // Strip markdown code fences
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const pattern = type === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = cleaned.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
