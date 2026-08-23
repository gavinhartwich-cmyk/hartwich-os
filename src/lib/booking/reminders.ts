import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { sendEmailViaGmail } from "@/lib/integrations/gmail-multi";
import { sendSms } from "@/lib/integrations/twilio";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function whenLabel(scheduledAt: Date, timezone: string): string {
  return scheduledAt.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  });
}

/**
 * Sends 24-hour and 1-hour email + SMS reminders for upcoming bookings.
 * Idempotent (each column is only ever set once) so it's safe to call on
 * a timer (scripts/send-booking-reminders-loop.sh, every ~15 min) — a
 * missed run just catches up on the next tick since the trigger is
 * "time until the meeting", not a fixed clock time.
 */
export async function sendBookingReminders(timezone: string) {
  const now = new Date();
  let emailsSent = 0;
  let smsSent = 0;
  const errors: string[] = [];

  const due24h = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.emailReminder24hSentAt),
        gt(bookings.scheduledAt, now)
      )
    );

  const due1h = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.emailReminder1hSentAt),
        gt(bookings.scheduledAt, now)
      )
    );

  for (const booking of due24h) {
    if (booking.scheduledAt.getTime() - now.getTime() > DAY_MS) continue;
    const label = whenLabel(booking.scheduledAt, timezone);
    try {
      await sendEmailViaGmail({
        to: booking.prospectEmail,
        subject: `Reminder: your call with Hartwich Labs tomorrow — ${label}`,
        body: `Hi ${booking.prospectName},\n\nJust a reminder — you're booked for ${label}.\n\nSee you then,\nHartwich Labs`,
        accountIndex: 0,
      });
      emailsSent++;
    } catch (error) {
      errors.push(`24h email for booking ${booking.id}: ${error}`);
    }

    let smsWasSent = false;
    if (booking.prospectPhone) {
      smsWasSent = await sendSms(
        booking.prospectPhone,
        `Reminder: your call with Hartwich Labs is tomorrow, ${label}.`
      );
      if (smsWasSent) smsSent++;
    }

    // Only stamp the SMS column when it actually sent — if there's no
    // phone number, or Twilio isn't configured yet, leave it null so a
    // future run can retry once TWILIO_* is set (email is stamped
    // unconditionally since that channel is always live).
    await db
      .update(bookings)
      .set({
        emailReminder24hSentAt: now,
        ...(smsWasSent ? { smsReminder24hSentAt: now } : {}),
      })
      .where(eq(bookings.id, booking.id));
  }

  for (const booking of due1h) {
    if (booking.scheduledAt.getTime() - now.getTime() > HOUR_MS) continue;
    const label = whenLabel(booking.scheduledAt, timezone);
    try {
      await sendEmailViaGmail({
        to: booking.prospectEmail,
        subject: `Starting soon: your call with Hartwich Labs — ${label}`,
        body: `Hi ${booking.prospectName},\n\nYour call with Hartwich Labs starts in about an hour (${label}).\n\nTalk soon,\nHartwich Labs`,
        accountIndex: 0,
      });
      emailsSent++;
    } catch (error) {
      errors.push(`1h email for booking ${booking.id}: ${error}`);
    }

    let smsWasSent = false;
    if (booking.prospectPhone) {
      smsWasSent = await sendSms(
        booking.prospectPhone,
        `Reminder: your call with Hartwich Labs starts in about an hour (${label}).`
      );
      if (smsWasSent) smsSent++;
    }

    await db
      .update(bookings)
      .set({
        emailReminder1hSentAt: now,
        ...(smsWasSent ? { smsReminder1hSentAt: now } : {}),
      })
      .where(eq(bookings.id, booking.id));
  }

  return { emailsSent, smsSent, errors };
}
