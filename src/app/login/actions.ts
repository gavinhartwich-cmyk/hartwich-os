"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null };

/**
 * A server action, not a client-side supabase.auth.signInWithPassword()
 * call — that distinction is the actual fix for "I have to keep logging
 * back in on my phone." A client-side call writes the session cookie via
 * document.cookie; Safari/WebKit's Intelligent Tracking Prevention caps
 * any cookie set that way to a 7-day lifetime, no matter what Max-Age
 * says — silently cutting @supabase/ssr's own 400-day default down to a
 * week on iOS. A cookie set via a real server Set-Cookie response header
 * (this action, through src/lib/supabase/server.ts) isn't script-written
 * at all, so that cap doesn't apply, and it can be marked httpOnly (see
 * server.ts) as a real security improvement besides.
 */
export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  redirect("/");
}
