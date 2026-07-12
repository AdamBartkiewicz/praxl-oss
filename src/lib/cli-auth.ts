import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens, users } from "@/db/schema";

export const CLI_TOKEN_HEADER = "x-praxl-token";
export const CLI_TOKEN_PREFIX = "praxl_cli_";
export const DEFAULT_CLI_SCOPES = ["cli"] as const;

// Only write last_used_at when it is this stale. A CLI heartbeats every ~15s, so
// updating on every request would turn read-only endpoints (config, sync) into
// writes and multiply DB write load for no added signal.
const LAST_USED_THROTTLE_MS = 10 * 60 * 1000;

// Throttle the legacy-token deprecation log to at most once per hour per user.
// A plain Map (not the shared rate-limiter) keeps this module free of timers, so
// importing it — e.g. from a `tsx` script or test — never keeps the event loop
// alive. The map stays small: it only holds users still on legacy tokens.
const LEGACY_WARN_INTERVAL_MS = 60 * 60 * 1000;
const legacyWarnedAt = new Map<string, number>();

export type CliAuthResult =
  | { ok: true; userId: string; tokenId: string; scopes: string[] }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "revoked" | "insufficient_scope" };

type CliTokenRecordState = {
  revokedAt: Date | null;
  expiresAt: Date | null;
  scopes: string[];
};

type CliTokenStateRejection = "expired" | "revoked" | "insufficient_scope";

export function hashCliToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateCliToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${CLI_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashCliToken(token),
    tokenPrefix: `${token.slice(0, CLI_TOKEN_PREFIX.length + 8)}...`,
  };
}

export function isValidCliTokenFormat(token: string): boolean {
  const secret = token.slice(CLI_TOKEN_PREFIX.length);
  return token.startsWith(CLI_TOKEN_PREFIX) && /^[A-Za-z0-9_-]{43}$/.test(secret);
}

// Legacy migration window: older CLI builds authenticated with the raw user ID
// as the token. Accepting those is opt-in so it stays off by default (the whole
// point of hashed tokens). Enable ALLOW_LEGACY_CLI_TOKENS=true to keep existing
// installs working until their users regenerate a real token, then remove it.
function legacyCliTokensEnabled(): boolean {
  return process.env.ALLOW_LEGACY_CLI_TOKENS === "true";
}

export function validateCliTokenState(
  token: CliTokenRecordState,
  requiredScope: string,
  now = new Date(),
): CliTokenStateRejection | null {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt && token.expiresAt <= now) return "expired";
  if (!token.scopes.includes(requiredScope)) return "insufficient_scope";
  return null;
}

export async function authenticateCliRequest(
  request: Request,
  requiredScope = "cli",
): Promise<CliAuthResult> {
  const token = request.headers.get(CLI_TOKEN_HEADER)?.trim();
  if (!token) return { ok: false, reason: "missing" };

  // Modern opaque tokens: looked up by hash, never stored in plaintext.
  if (isValidCliTokenFormat(token)) {
    const now = new Date();
    const tokenHash = hashCliToken(token);
    const tokenRow = await db.query.cliTokens.findFirst({
      where: eq(cliTokens.tokenHash, tokenHash),
      columns: {
        id: true,
        userId: true,
        scopes: true,
        revokedAt: true,
        expiresAt: true,
        lastUsedAt: true,
      },
    });

    if (!tokenRow) return { ok: false, reason: "invalid" };

    const rejection = validateCliTokenState(tokenRow, requiredScope, now);
    if (rejection) return { ok: false, reason: rejection };

    if (!tokenRow.lastUsedAt || now.getTime() - tokenRow.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
      await db.update(cliTokens).set({ lastUsedAt: now }).where(eq(cliTokens.id, tokenRow.id));
    }

    return {
      ok: true,
      userId: tokenRow.userId,
      tokenId: tokenRow.id,
      scopes: tokenRow.scopes,
    };
  }

  // The token is not in the modern format. During the migration window it may be
  // a raw user ID from an old CLI build; accept it only when explicitly allowed.
  if (legacyCliTokensEnabled()) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, token),
      columns: { id: true },
    });
    if (user) {
      const rejection = validateCliTokenState(
        { revokedAt: null, expiresAt: null, scopes: [...DEFAULT_CLI_SCOPES] },
        requiredScope,
      );
      if (rejection) return { ok: false, reason: rejection };

      // Surface the deprecation once per hour per user instead of on every
      // heartbeat, so the migration signal is visible without flooding logs.
      const nowMs = Date.now();
      if (nowMs - (legacyWarnedAt.get(user.id) ?? 0) > LEGACY_WARN_INTERVAL_MS) {
        legacyWarnedAt.set(user.id, nowMs);
        console.warn(
          `[cli-auth] legacy CLI token (raw user id) accepted for user ${user.id}; ` +
            "ask them to regenerate a token in Settings and disable ALLOW_LEGACY_CLI_TOKENS once migrated",
        );
      }

      return {
        ok: true,
        userId: user.id,
        tokenId: "legacy",
        scopes: [...DEFAULT_CLI_SCOPES],
      };
    }
  }

  return { ok: false, reason: "invalid" };
}

// Resolve the acting user for endpoints that accept EITHER a CLI token or a
// browser session (heartbeat GET, change-request GET, disconnect POST). Presence
// of the token header selects token auth; otherwise the cookie session is used.
// `source` lets callers both pick the right failure response (a bad CLI token is
// a hard 401, while an absent session is often a benign default) and branch on
// how the request arrived. getSession is imported lazily so this module stays
// free of next/headers — importing it from a tsx script or test must not fail.
export type CliOrSessionAuth =
  | { ok: true; userId: string; source: "cli" | "session" }
  | { ok: false; source: "cli" | "session" };

export async function authenticateCliOrSession(request: Request): Promise<CliOrSessionAuth> {
  if (request.headers.get(CLI_TOKEN_HEADER)) {
    const auth = await authenticateCliRequest(request);
    return auth.ok
      ? { ok: true, userId: auth.userId, source: "cli" }
      : { ok: false, source: "cli" };
  }

  try {
    const { getSession } = await import("@/lib/auth");
    const session = await getSession();
    if (session) return { ok: true, userId: session.userId, source: "session" };
  } catch (e) {
    console.error("[cli-auth] session resolution failed", e);
  }
  return { ok: false, source: "session" };
}
