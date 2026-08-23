import "server-only";
import { asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { bookingQuestions, bookingSettings, bookings } from "@/db/schema";
import { createCalendarEvent, deleteCalendarEvent } from "@/lib/integrations/google-calendar";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type BookingSettingsInput = Partial<{
  bookingWindowDays: number;
  meetingDurationMinutes: number;
  minNoticeHours: number;
  timezone: string;
  workingDays: number[];
  workingHoursStart: string;
  workingHoursEnd: string;
}>;

export async function updateBookingSettings(input: BookingSettingsInput) {
  const [existing] = await db.select({ id: bookingSettings.id }).from(bookingSettings).limit(1);
  if (!existing) throw new Error("booking_settings has no row — run `npm run db:seed`.");

  const [updated] = await db
    .update(bookingSettings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(bookingSettings.id, existing.id))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Questionnaire
// ---------------------------------------------------------------------------

export async function listBookingQuestions() {
  return db.query.bookingQuestions.findMany({
    orderBy: (q, { asc }) => asc(q.position),
  });
}

export type BookingQuestionInput = {
  label: string;
  fieldType: "text" | "textarea" | "email" | "phone" | "select";
  options?: string[] | null;
  required?: boolean;
  position?: number;
};

export async function createBookingQuestion(input: BookingQuestionInput) {
  const [{ maxPos } = { maxPos: -1 }] = await db
    .select({ maxPos: bookingQuestions.position })
    .from(bookingQuestions)
    .orderBy(desc(bookingQuestions.position))
    .limit(1);

  const [question] = await db
    .insert(bookingQuestions)
    .values({
      label: input.label,
      fieldType: input.fieldType,
      options: input.options || null,
      required: input.required ?? true,
      isCore: false,
      position: input.position ?? maxPos + 1,
    })
    .returning();
  return question;
}

export async function updateBookingQuestion(
  id: string,
  input: Partial<BookingQuestionInput>
) {
  const [updated] = await db
    .update(bookingQuestions)
    .set(input)
    .where(eq(bookingQuestions.id, id))
    .returning();
  return updated;
}

/** Core fields (name/email/phone) can't be deleted — reminders depend on them. */
export async function deleteBookingQuestion(id: string) {
  const [existing] = await db.select().from(bookingQuestions).where(eq(bookingQuestions.id, id));
  if (!existing) return { ok: false as const, error: "Not found" };
  if (existing.isCore) return { ok: false as const, error: "Can't delete a core field" };

  await db.delete(bookingQuestions).where(eq(bookingQuestions.id, id));
  return { ok: true as const };
}

export async function reorderBookingQuestions(orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, position) =>
      db.update(bookingQuestions).set({ position }).where(eq(bookingQuestions.id, id))
    )
  );
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export type CreateBookingInput = {
  scheduledAt: Date;
  durationMinutes: number;
  prospectName: string;
  prospectEmail: string;
  prospectPhone?: string | null;
  answers: Record<string, string>;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  companyName?: string | null;
};

export async function createBooking(input: CreateBookingInput) {
  const description = [
    `Booked via Hartwich OS booking page.`,
    input.companyName ? `Company: ${input.companyName}` : null,
    `Email: ${input.prospectEmail}`,
    input.prospectPhone ? `Phone: ${input.prospectPhone}` : null,
    "",
    ...Object.entries(input.answers).map(([label, value]) => `${label}: ${value}`),
  ]
    .filter((line) => line !== null)
    .join("\n");

  const googleEventId = await createCalendarEvent({
    title: `${input.prospectName}${input.companyName ? ` (${input.companyName})` : ""} — Hartwich Labs call`,
    description,
    startTime: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    attendeeEmail: input.prospectEmail,
    attendeeName: input.prospectName,
  });

  const [booking] = await db
    .insert(bookings)
    .values({
      companyId: input.companyId || null,
      contactId: input.contactId || null,
      dealId: input.dealId || null,
      prospectName: input.prospectName,
      prospectEmail: input.prospectEmail,
      prospectPhone: input.prospectPhone || null,
      answers: input.answers,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      googleEventId,
    })
    .returning();

  return booking;
}

export async function listBookings({ upcomingOnly = false }: { upcomingOnly?: boolean } = {}) {
  return db.query.bookings.findMany({
    where: upcomingOnly ? gte(bookings.scheduledAt, new Date()) : undefined,
    with: { company: true },
    orderBy: asc(bookings.scheduledAt),
  });
}

/** Bookings in [from, to) for merging into the internal /calendar view. */
export async function listBookingsInRange(from: Date, to: Date) {
  return db.query.bookings.findMany({
    where: (b, { and, gte, lt, eq }) =>
      and(gte(b.scheduledAt, from), lt(b.scheduledAt, to), eq(b.status, "confirmed")),
    with: { company: true },
    orderBy: asc(bookings.scheduledAt),
  });
}

export async function cancelBooking(id: string) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
  if (!booking) return null;

  if (booking.googleEventId) {
    await deleteCalendarEvent(booking.googleEventId);
  }

  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(bookings.id, id))
    .returning();
  return updated;
}
