import { NextRequest, NextResponse } from "next/server";

// Proxies GitHub API requests with server-side token to avoid rate limits
// GET /api/github-proxy?url=https://api.github.com/repos/...
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url || !url.startsWith("https://api.github.com/")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "X-RateLimit-Remaining": res.headers.get("X-RateLimit-Remaining") || "",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json({ error: "GitHub API unavailable" }, { status: 502 });
  }
}
