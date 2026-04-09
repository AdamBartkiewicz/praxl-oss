import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set. Add your Supabase PostgreSQL connection string to .env.local");
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

export const db = drizzle(client, { schema });
export type DB = typeof db;
