/**
 * Applies pending drizzle migrations over Supabase's transaction pooler.
 *
 * `drizzle-kit migrate` hangs against the pooler (port 6543) because it needs
 * session-level state the pooler doesn't keep. Production silently fell four
 * migrations behind that way, so the LinkedIn tables never got created.
 *
 * Statements that fail purely because the object already exists are skipped
 * rather than fatal — earlier `db:push` runs left some columns present but
 * unrecorded, and the migration history has to be able to catch up over them.
 */
import fs from "fs";
import crypto from "crypto";
import postgres from "postgres";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — see SETUP.md.");
  process.exit(1);
}

const ALREADY_EXISTS = new Set([
  "42701", // duplicate_column
  "42P07", // duplicate_table
  "42710", // duplicate_object (constraints, types)
  "42P06", // duplicate_schema
]);

const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const [last] = await sql`
  SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`;

// drizzle sequences migrations by the journal timestamp, not by hash — older
// files drift in content (line endings) without meaning they need replaying.
const pending = journal.entries
  .filter((entry) => BigInt(entry.when) > BigInt(last?.created_at ?? 0))
  .sort((a, b) => a.when - b.when);

if (pending.length === 0) {
  console.log("Up to date — nothing pending.");
  await sql.end();
  process.exit(0);
}

console.log(`Pending: ${pending.map((p) => p.tag).join(", ")}\n`);

for (const entry of pending) {
  const raw = fs.readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const statements = raw
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`${entry.tag} (${statements.length} statements)`);

  await sql.begin(async (tx) => {
    for (const [i, statement] of statements.entries()) {
      try {
        await tx.savepoint(async (sp) => sp.unsafe(statement));
        console.log(`  ${i + 1}. applied`);
      } catch (error) {
        if (!ALREADY_EXISTS.has(error.code)) throw error;
        console.log(`  ${i + 1}. skipped — already exists (${error.code})`);
      }
    }
    await tx`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})`;
  });

  console.log(`  recorded\n`);
}

await sql.end();
console.log("Done.");
