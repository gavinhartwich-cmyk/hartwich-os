import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { bookings, bookingSettings } from "@/db/schema";
import { getBusyPeriods, isCalendarSyncConfigured, type BusyPeriod } from "@/lib/integrations/google-calendar";
import { localDateKey, utcToLocalParts, zonedTimeToUtc } from "./timezone";

export type BookingSettingsRow = typeof bookingSettings.$inferSelect;

/** There's always exactly one row — seeded by `npm run db:seed`. */
export async function getBookingSettings(): Promise<BookingSettingsRow> {
  const [row] = await db.select().from(bookingSettings).limit(1);
  if (!row) {
    throw new Error("booking_settings has no row — run `npm run db:seed`.");
  }
  return row;
}

export type TimeSlot = { startIso: string; label: string };
export type AvailabilityDay = { date: string; label: string; slots: TimeSlot[] };

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Computes open booking slots for the next `settings.bookingWindowDays`
 * days: working-hours slots on working days, minus real Google Calendar
 * busy time, minus already-confirmed bookings (belt and suspenders in
 * case a Calendar sync is delayed). Returns null when Google Calendar
 * sync isn't configured yet — we fail closed rather than show slots we
 * can't guarantee are actually free.
 */
export async function computeAvailability(
  settings: BookingSettingsRow
): Promise<AvailabilityDay[] | null> {
  if (!isCalendarSyncConfigured()) return null;

  const now = new Date();
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + settings.bookingWindowDays * 24 * 60 * 60 * 1000);

  const [busy, existingBookings] = await Promise.all([
    getBusyPeriods(windowStart, windowEnd),
    db
      .select({ scheduledAt: bookings.scheduledAt, durationMinutes: bookings.durationMinutes })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "confirmed"),
          gte(bookings.scheduledAt, windowStart),
          lt(bookings.scheduledAt, windowEnd)
        )
      ),
  ]);

  if (busy === null) return null;

  const busyPeriods: BusyPeriod[] = [
    ...busy,
    ...existingBookings.map((b) => ({
      start: new Date(b.scheduledAt),
      end: new Date(b.scheduledAt.getTime() + b.durationMinutes * 60_000),
    })),
  ];

  const earliestBookable = new Date(now.getTime() + settings.minNoticeHours * 60 * 60 * 1000);
  const duration = settings.meetingDurationMinutes;
  const [startHour, startMinute] = settings.workingHoursStart.split(":").map(Number);
  const [endHour, endMinute] = settings.workingHoursEnd.split(":").map(Number);

  const days: AvailabilityDay[] = [];

  for (let dayOffset = 0; dayOffset <= settings.bookingWindowDays; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const local = utcToLocalParts(probe, settings.timezone);
    if (!settings.workingDays.includes(local.weekday)) continue;

    const dayStart = zonedTimeToUtc(
      local.year,
      local.month,
      local.day,
      startHour,
      startMinute,
      settings.timezone
    );
    const dayEnd = zonedTimeToUtc(
      local.year,
      local.month,
      local.day,
      endHour,
      endMinute,
      settings.timezone
    );
    if (dayEnd <= dayStart) continue;

    const slots: TimeSlot[] = [];
    for (
      let slotStart = new Date(dayStart);
      new Date(slotStart.getTime() + duration * 60_000) <= dayEnd;
      slotStart = new Date(slotStart.getTime() + duration * 60_000)
    ) {
      const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
      if (slotStart < earliestBookable) continue;
      if (slotStart >= windowEnd) continue;
      const blocked = busyPeriods.some((b) => overlaps(slotStart, slotEnd, b.start, b.end));
      if (blocked) continue;

      slots.push({
        startIso: slotStart.toISOString(),
        label: slotStart.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: settings.timezone,
        }),
      });
    }

    if (slots.length > 0) {
      days.push({
        date: localDateKey(local),
        label: probe.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: settings.timezone,
        }),
        slots,
      });
    }
  }

  return days;
}

/**
 * Re-validates a specific slot right before booking (race guard against
 * two prospects grabbing the same time, or Gavin's calendar filling up
 * between page load and submit).
 */
export async function isSlotStillAvailable(
  settings: BookingSettingsRow,
  slotStart: Date
): Promise<boolean> {
  const slotEnd = new Date(slotStart.getTime() + settings.meetingDurationMinutes * 60_000);
  const earliestBookable = new Date(Date.now() + settings.minNoticeHours * 60 * 60 * 1000);
  if (slotStart < earliestBookable) return false;

  const busy = await getBusyPeriods(slotStart, slotEnd);
  if (busy === null) return false;
  if (busy.some((b) => overlaps(slotStart, slotEnd, b.start, b.end))) return false;

  // Narrow to bookings within a day of the slot, then do the real overlap
  // check in JS (duration varies per booking, so it can't be pushed fully
  // into the SQL WHERE).
  const nearby = await db
    .select({ scheduledAt: bookings.scheduledAt, durationMinutes: bookings.durationMinutes })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.scheduledAt, new Date(slotStart.getTime() - 24 * 60 * 60 * 1000)),
        lt(bookings.scheduledAt, new Date(slotEnd.getTime() + 24 * 60 * 60 * 1000))
      )
    );

  for (const c of nearby) {
    const cEnd = new Date(c.scheduledAt.getTime() + c.durationMinutes * 60_000);
    if (overlaps(slotStart, slotEnd, c.scheduledAt, cEnd)) return false;
  }

  return true;
}
