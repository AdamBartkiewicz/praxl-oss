import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy initialization — the drizzle client is created on first use, not at
// module load. This is required because Next.js evaluates route modules
// during `npm run build` (page data collection), but DATABASE_URL isn't
// available at build time inside the Docker image — it's only injected
// at runtime by docker-compose. Throwing at module load broke the build.

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;
let _db: DrizzleClient | null = null;

function getClient(): DrizzleClient {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Add your PostgreSQL connection string to .env (or let docker-compose inject it).",
    );
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 5,
    idle_timeout: 30,
    connect_timeout: 10,
    connection: {
      application_name: "praxl",
    },
  });

  _db = drizzle(client, { schema });
  return _db;
}

// Proxy defers initialization until first property access. Build-time
// imports (collecting page data, type checks) don't trigger DB connection.
export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    const realDb = getClient();
    const value = Reflect.get(realDb as object, prop, receiver);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(realDb) : value;
  },
});

export type DB = DrizzleClient;
