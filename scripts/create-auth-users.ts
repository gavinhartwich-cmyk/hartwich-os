/**
 * One-time setup: creates a Supabase Auth (email/password) account for
 * each allow-listed Hartwich OS user. Run once per environment after
 * switching to email/password auth — see SETUP.md.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase dashboard →
 * Settings → API → service_role key). That key bypasses every auth
 * restriction — never expose it to the client or commit it; it's kept
 * out of src/lib/supabase entirely so it can't accidentally end up in a
 * browser bundle.
 *
 * Run with: npm run auth:create-users
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_EMAILS } from "../src/lib/auth/allowlist";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local " +
      "(the service_role key is on the Supabase dashboard under Settings -> API)."
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    throw listError;
  }

  const created: { email: string; password: string }[] = [];

  for (const email of ALLOWED_EMAILS) {
    const alreadyExists = existing.users.some(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (alreadyExists) {
      console.log(`${email} already has an account — skipping.`);
      continue;
    }

    const password = generatePassword();
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email verification — the allow-list is the trust boundary
    });

    if (error) {
      console.error(`Failed to create ${email}:`, error.message);
      continue;
    }

    created.push({ email, password });
  }

  if (created.length === 0) {
    console.log("Nothing to do — every allow-listed user already has an account.");
    return;
  }

  console.log("\nCreated accounts (share each password with its owner over a secure channel):");
  for (const { email, password } of created) {
    console.log(`  ${email}  →  ${password}`);
  }
  console.log(
    "\nThese are one-time passwords. Sign in at /login, then change the password from " +
      "the Supabase dashboard (Authentication → Users) until an in-app change-password " +
      "flow exists."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
