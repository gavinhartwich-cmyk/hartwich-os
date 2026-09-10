import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and
 * Route Handlers. Reads/writes the session via Next.js's cookie store.
 *
 * Server Components can't write cookies, so the `setAll` call is
 * wrapped in a try/catch — session refresh in that case is handled by
 * proxy.ts instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // httpOnly: real security hardening (JS can no longer read the
      // session token, so XSS can't steal it) now that sign-in/sign-out
      // are server actions instead of client-side supabase-js calls —
      // see src/app/login/actions.ts's header comment for the other half
      // of why that move matters (Safari's 7-day cap on script-written
      // cookies).
      cookieOptions: { httpOnly: true },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore because
            // proxy.ts refreshes the session on every request.
          }
        },
      },
    }
  );
}
