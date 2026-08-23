import { NextResponse } from "next/server";
import { computeAvailability, getBookingSettings } from "@/lib/booking/availability";

/**
 * GET /api/public/booking/availability
 * Public — the list of open days/times for the /book page. Computed live
 * against Google Calendar on every request (no caching) so it's never
 * stale enough to double-book someone.
 */
export async function GET() {
  const settings = await getBookingSettings();
  const days = await computeAvailability(settings);

  if (days === null) {
    return NextResponse.json(
      { configured: false, days: [], error: "Booking isn't connected to a calendar yet." },
      { status: 200 }
    );
  }

  return NextResponse.json({ configured: true, days });
}
