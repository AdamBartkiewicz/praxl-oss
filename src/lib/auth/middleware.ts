import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "praxl_session";

const PUBLIC_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/share/",
  "/api/trpc/",
  "/api/public/",
  "/api/cli/",
  "/api/health",
  "/api/install-skill",
  "/api/ai/chat",
  "/api/export/",
  "/api/marketplace/",
  "/api/github-proxy",
  "/api/errors",
  "/api/waitlist",
  "/api/cron/",
  "/api/auth/",
  "/api/clawhub",
  "/terms",
  "/privacy",
  "/changelog",
  "/help",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Middleware auth check. Does NOT verify JWT signature (jsonwebtoken
 * doesn't work in Next.js proxy/edge runtime). Just checks cookie exists
 * and has a plausible JWT shape. Full verification happens in API routes
 * via getSession() which runs in Node.js runtime.
 */
export function authMiddleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return undefined;
  }

  // Check if session cookie exists and looks like a JWT (3 base64 parts)
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const hasValidShape = token && token.split(".").length === 3;

  if (!hasValidShape) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return undefined;
}
