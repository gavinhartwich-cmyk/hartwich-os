import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import BookingSettingsClient from "./settings-client";

/**
 * Booking admin (Phase 6) — Gavin-only (see lib/auth/allowlist.ts
 * isBookingAdmin). The nav already hides this link from Noah; this
 * redirect is the defensive server-side check, same pattern as
 * (app)/layout.tsx's own auth fallback.
 */
export default async function BookingSettingsPage() {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    redirect("/calendar");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Booking</h1>
        <p className="text-sm text-neutral-500">
          Your public booking link, availability rules, and the questionnaire prospects fill out.
        </p>
      </div>
      <BookingSettingsClient />
    </div>
  );
}
