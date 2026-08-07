import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL comes from the Supabase project's connection string
// (Settings → Database → Connection string → "Transaction" pooler URI
// for serverless functions). See SETUP.md.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in " +
      "your Supabase connection string — see SETUP.md."
  );
}

// A single prepared connection, reused across invocations in the same
// serverless instance. `prepare: false` is required for Supabase's
// transaction pooler (pgbouncer), which doesn't support prepared statements.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
