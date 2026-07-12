import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq, and, isNull, or, gt } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { cliTokens, users } from "@/db/schema";
import { DEFAULT_CLI_SCOPES, generateCliToken } from "@/lib/cli-auth";

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(100).default("CLI token"),
  expiresAt: z.string().datetime().nullable().optional(),
});

const MAX_ACTIVE_TOKENS = 10;
const MAX_TOKEN_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;

async function requireSession() {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

// List token metadata. Raw tokens are never persisted and cannot be revealed again.
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tokens = await db.query.cliTokens.findMany({
    where: and(
      eq(cliTokens.userId, session.userId),
      isNull(cliTokens.revokedAt),
      or(isNull(cliTokens.expiresAt), gt(cliTokens.expiresAt, new Date())),
    ),
    columns: {
      id: true,
      name: true,
      tokenPrefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: desc(cliTokens.createdAt),
  });

  return NextResponse.json({ tokens });
}

// Create a token. The raw value is returned exactly once.
export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Validate input before opening a transaction so we never hold a lock across it.
  const parsed = createTokenSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token settings" }, { status: 400 });
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    return NextResponse.json({ error: "Expiration must be in the future" }, { status: 400 });
  }
  if (expiresAt && expiresAt.getTime() - Date.now() > MAX_TOKEN_LIFETIME_MS) {
    return NextResponse.json({ error: "Expiration cannot be more than one year in the future" }, { status: 400 });
  }

  const generated = generateCliToken();

  // Enforce the active-token cap under a per-user lock: locking the owner's users
  // row serializes concurrent token creation, so two requests can't both read
  // count == MAX - 1 and each insert (which would overshoot MAX_ACTIVE_TOKENS).
  const created = await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, session.userId)).for("update");

    const active = await tx.query.cliTokens.findMany({
      where: and(
        eq(cliTokens.userId, session.userId),
        isNull(cliTokens.revokedAt),
        or(isNull(cliTokens.expiresAt), gt(cliTokens.expiresAt, new Date())),
      ),
      columns: { id: true },
    });
    if (active.length >= MAX_ACTIVE_TOKENS) return null;

    const [row] = await tx.insert(cliTokens).values({
      userId: session.userId,
      name: parsed.data.name,
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      scopes: [...DEFAULT_CLI_SCOPES],
      expiresAt,
    }).returning({
      id: cliTokens.id,
      name: cliTokens.name,
      tokenPrefix: cliTokens.tokenPrefix,
      scopes: cliTokens.scopes,
      createdAt: cliTokens.createdAt,
      expiresAt: cliTokens.expiresAt,
    });
    return row;
  });

  if (!created) {
    return NextResponse.json({ error: "Revoke an existing CLI token before creating another" }, { status: 409 });
  }

  return NextResponse.json({ token: generated.token, metadata: created }, { status: 201 });
}

// Revoke one token owned by the signed-in user.
export async function DELETE(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Token id is required" }, { status: 400 });
  }

  const [revoked] = await db.update(cliTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(cliTokens.id, parsed.data.id), eq(cliTokens.userId, session.userId), isNull(cliTokens.revokedAt)))
    .returning({ id: cliTokens.id });

  if (revoked) return NextResponse.json({ revoked: true });

  // Nothing was updated: the token is either already revoked or not this user's.
  // Revoking is idempotent, so a second revoke of the same token still succeeds —
  // only a genuinely missing/foreign token is a 404.
  const existing = await db.query.cliTokens.findFirst({
    where: and(eq(cliTokens.id, parsed.data.id), eq(cliTokens.userId, session.userId)),
    columns: { id: true },
  });
  if (existing) return NextResponse.json({ revoked: true });

  return NextResponse.json({ error: "Token not found" }, { status: 404 });
}
