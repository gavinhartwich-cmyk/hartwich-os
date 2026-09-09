import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The `ai-workforce` repo's own database — separate from this app's
 * DATABASE_URL on purpose (see src/db/agent-workforce/schema.ts's header).
 * Lazily constructed so importing this module never fails just because
 * AGENT_DATABASE_URL isn't set — the AI Workforce dashboard checks
 * `isAgentDbConfigured()` and renders a "not connected yet" state instead
 * of crashing when this hasn't been wired up.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isAgentDbConfigured(): boolean {
  return !!process.env.AGENT_DATABASE_URL;
}

export function getAgentDb() {
  if (_db) return _db;
  const connectionString = process.env.AGENT_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "AGENT_DATABASE_URL is not set — required to read AI Workforce data. See .env.example."
    );
  }
  const client = postgres(connectionString, { prepare: false });
  _db = drizzle(client, { schema });
  return _db;
}
