import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { getSession } from "@/lib/auth";
import type { Context } from "@/server/trpc";

export const maxDuration = 60;

async function createContext(): Promise<Context> {
  try {
    const session = await getSession();
    if (!session) return { userId: null, orgId: null, isPro: true };

    // Open-source: everything unlocked
    return { userId: session.userId, orgId: null, isPro: true };
  } catch {
    return { userId: null, orgId: null, isPro: true };
  }
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });

export { handler as GET, handler as POST };
