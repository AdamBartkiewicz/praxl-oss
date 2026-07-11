import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { db } from "@/db";
import { cliTokens } from "@/db/schema";

export const CLI_TOKEN_HEADER = "x-praxl-token";
export const CLI_TOKEN_PREFIX = "praxl_cli_";
export const DEFAULT_CLI_SCOPES = ["cli"] as const;

export type CliAuthResult =
  | { ok: true; userId: string; tokenId: string; scopes: string[] }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "revoked" | "insufficient_scope" };

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

export async function authenticateCliRequest(
  request: Request,
  requiredScope = "cli",
): Promise<CliAuthResult> {
  const token = request.headers.get(CLI_TOKEN_HEADER)?.trim();
  if (!token) return { ok: false, reason: "missing" };
  if (!token.startsWith(CLI_TOKEN_PREFIX)) return { ok: false, reason: "invalid" };

  const now = new Date();
  const tokenRow = await db.query.cliTokens.findFirst({
    where: and(
      eq(cliTokens.tokenHash, hashCliToken(token)),
      isNull(cliTokens.revokedAt),
      or(isNull(cliTokens.expiresAt), gt(cliTokens.expiresAt, now)),
    ),
  });

  if (!tokenRow) {
    const inactiveToken = await db.query.cliTokens.findFirst({
      where: eq(cliTokens.tokenHash, hashCliToken(token)),
      columns: { revokedAt: true, expiresAt: true },
    });
    if (inactiveToken?.revokedAt) return { ok: false, reason: "revoked" };
    if (inactiveToken?.expiresAt && inactiveToken.expiresAt <= now) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }

  if (!tokenRow.scopes.includes(requiredScope)) {
    return { ok: false, reason: "insufficient_scope" };
  }

  await db.update(cliTokens).set({ lastUsedAt: now }).where(eq(cliTokens.id, tokenRow.id));

  return {
    ok: true,
    userId: tokenRow.userId,
    tokenId: tokenRow.id,
    scopes: tokenRow.scopes,
  };
}
