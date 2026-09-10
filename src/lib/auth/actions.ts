"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * A server action, same reasoning as src/app/login/actions.ts's signIn —
 * once the session cookie is httpOnly (src/lib/supabase/server.ts),
 * client-side JS can no longer read OR clear it via document.cookie, so
 * sign-out has to go through the server too.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
