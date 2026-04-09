import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const SALT_ROUNDS = 12;
const COOKIE_NAME = "praxl_session";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is required");
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(userId: string): string {
  return jwt.sign({ userId }, getSecret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, getSecret()) as { userId: string };
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

/**
 * Read session from cookie. Works in Server Components / Route Handlers.
 * Returns { userId } or null.
 */
export async function getSession(): Promise<{ userId: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Read session from a raw Request object (for use in middleware / edge).
 */
export function getSessionFromRequest(request: Request): { userId: string } | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifyToken(match[1]);
}

/** Check if app is running on HTTPS (for secure cookie flag) */
export function isSecureContext(): boolean {
  const url = process.env.NEXT_PUBLIC_APP_URL || "";
  return url.startsWith("https://");
}

export { COOKIE_NAME };
