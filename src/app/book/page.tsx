import { Suspense } from "react";
import BookClient from "./book-client";

export const metadata = { title: "Book a call — Hartwich Labs" };

/**
 * Public booking page (Phase 6) — Calendly-style flow: pick a slot from
 * Gavin's real availability, fill out the questionnaire, done. Lives
 * outside the (app) route group (no nav chrome, no auth) and is listed
 * in proxy.ts PUBLIC_PATHS. Optional ?company=&contact=&deal= query
 * params link the booking back to a CRM record when the link came from
 * an outreach email; the page works fine as a bare public link too.
 */
export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookClient />
    </Suspense>
  );
}
