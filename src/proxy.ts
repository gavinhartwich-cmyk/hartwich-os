import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowlist";

// Routes reachable without a session. /api/inngest is called server-to-server
// by Inngest itself (verified by its own signing key, not our session cookie).
// /api/cron/* is called server-to-server by a Zo background loop (verified
// by a CRON_SECRET bearer token inside the route, not our session cookie).
// /book and /api/public/booking/* are the prospect-facing booking page
// (Phase 6) — no login for prospects, obviously.
const PUBLIC_PATHS = [
  "/login",
  "/auth/error",
  "/api/inngest",
  "/api/cron/",
  "/book",
  "/api/public/booking",
];

/**
 * Runs on every request. Refreshes the Supabase session, then enforces
 * the two-person allow-list (architecture doc §4) — anyone authenticated
 * with an email/password account that isn't on the list is signed out
 * and sent to /login with an explanation, regardless of how they got a
 * session.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isAllowedEmail(user.email) && !isPublicPath) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "not_allowed");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimization
     * files, so auth is enforced on pages and API/route handlers alike.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
