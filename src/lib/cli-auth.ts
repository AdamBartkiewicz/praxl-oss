import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";

export const CLI_TOKEN_HEADER = "x-praxl-token";
export const CLI_TOKEN_PREFIX = "praxl_cli_";
export const DEFAULT_CLI_SCOPES = ["cli"] as const;

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
  if (!isValidCliTokenFormat(token)) return { ok: false, reason: "invalid" };

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
    },
  });

  if (!tokenRow) return { ok: false, reason: "invalid" };

  const rejection = validateCliTokenState(tokenRow, requiredScope, now);
  if (rejection) return { ok: false, reason: rejection };

  await db.update(cliTokens).set({ lastUsedAt: now }).where(eq(cliTokens.id, tokenRow.id));

  return {
    ok: true,
    userId: tokenRow.userId,
    tokenId: tokenRow.id,
    scopes: tokenRow.scopes,
  };
}
