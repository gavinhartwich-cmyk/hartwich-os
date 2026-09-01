import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getBookingSettings } from "@/lib/booking/availability";
import { sendBookingReminders } from "@/lib/booking/reminders";

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return constantTimeEqual(auth.slice(7), secret);
}

// Same shape as /api/cron/sync-replies: public path (proxy.ts exempts
// /api/cron/*) but bearer-secret protected, polled by a Zo background
// loop (scripts/send-booking-reminders-loop.sh).
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getBookingSettings();
    const { emailsSent, smsSent, errors } = await sendBookingReminders(settings.timezone);
    return NextResponse.json({
      success: true,
      emailsSent,
      smsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error in cron send-reminders:", error);
    return NextResponse.json(
      { error: "Failed to send reminders", details: String(error) },
      { status: 500 }
    );
  }
}
