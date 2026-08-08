import "server-only";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth/allowlist";

export type AppUser = typeof users.$inferSelect;

/**
 * Bridges Supabase Auth (who signed in) to our own `users` table (what
 * the rest of the schema's foreign keys point at — see architecture doc
 * §3/§4). Called from Server Components/Actions, never from the client.
 *
 * On every call, upserts the signed-in Google identity into `users` by
 * email, so the domain row always reflects the latest name/avatar/Google
 * subject without a separate "onboarding" step. Returns null if there's
 * no session or the session isn't on the allow-list — proxy.ts and the
 * OAuth callback already guard against this, this is the defensive
 * third check for anything that calls it directly.
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser?.email || !isAllowedEmail(authUser.email)) {
    return null;
  }

  const name =
    (authUser.user_metadata?.full_name as string | undefined) ??
    (authUser.user_metadata?.name as string | undefined) ??
    authUser.email;
  const avatarUrl = authUser.user_metadata?.avatar_url as string | undefined;

  const [appUser] = await db
    .insert(users)
    .values({
      email: authUser.email,
      name,
      googleSub: authUser.id,
      avatarUrl,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name, avatarUrl, googleSub: authUser.id },
    })
    .returning();

  return appUser;
}

/** Convenience export of just the app-scoped user list, for owner/assignee pickers. */
export async function listAppUsers(): Promise<AppUser[]> {
  return db.select().from(users).orderBy(users.name);
}
