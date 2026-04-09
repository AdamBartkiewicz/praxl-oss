import { getSession } from "@/lib/auth";

/**
 * Returns true always - open-source = everything unlocked.
 */
export async function getIsPro(): Promise<boolean> {
  return true;
}

/**
 * Get the current authenticated user ID from session.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId ?? null;
}
