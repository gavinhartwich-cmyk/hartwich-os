import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBookingSettings, isSlotStillAvailable } from "@/lib/booking/availability";
import { createBooking, listBookingQuestions } from "@/lib/data/bookings";
import { getCompanyById } from "@/lib/data/companies";
import { sendEmailViaGmail } from "@/lib/integrations/gmail-multi";

const BookSchema = z.object({
  slotStart: z.string().datetime(),
  answers: z.record(z.string(), z.string()),
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
});

/**
 * POST /api/public/booking/book
 * Public — creates a confirmed booking. Re-validates the slot server-side
 * (a prospect's browser could be showing a stale slot list) before
 * touching the calendar or the database.
 */
export async function POST(request: NextRequest) {
  let input: z.infer<typeof BookSchema>;
  try {
    input = BookSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const settings = await getBookingSettings();
  const slotStart = new Date(input.slotStart);

  const stillAvailable = await isSlotStillAvailable(settings, slotStart);
  if (!stillAvailable) {
    return NextResponse.json(
      { error: "That time was just taken or is no longer available. Please pick another." },
      { status: 409 }
    );
  }

  const questions = await listBookingQuestions();
  const answersByLabel: Record<string, string> = {};
  for (const q of questions) {
    const value = input.answers[q.id];
    if (q.required && !value?.trim()) {
      return NextResponse.json({ error: `"${q.label}" is required.` }, { status: 400 });
    }
    if (value?.trim()) answersByLabel[q.label] = value.trim();
  }

  const nameQuestion = questions.find((q) => q.isCore && q.fieldType === "text");
  const emailQuestion = questions.find((q) => q.fieldType === "email" && q.isCore);
  const phoneQuestion = questions.find((q) => q.fieldType === "phone" && q.isCore);

  const prospectName = nameQuestion ? input.answers[nameQuestion.id]?.trim() : undefined;
  const prospectEmail = emailQuestion ? input.answers[emailQuestion.id]?.trim() : undefined;
  const prospectPhone = phoneQuestion ? input.answers[phoneQuestion.id]?.trim() : undefined;

  if (!prospectName || !prospectEmail) {
    return NextResponse.json(
      { error: "Missing name or email in the questionnaire configuration." },
      { status: 500 }
    );
  }

  const company = input.companyId ? await getCompanyById(input.companyId).catch(() => null) : null;

  const booking = await createBooking({
    scheduledAt: slotStart,
    durationMinutes: settings.meetingDurationMinutes,
    prospectName,
    prospectEmail,
    prospectPhone,
    answers: answersByLabel,
    companyId: input.companyId || null,
    contactId: input.contactId || null,
    dealId: input.dealId || null,
    companyName: company?.name || null,
  });

  const whenLabel = slotStart.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: settings.timezone,
    timeZoneName: "short",
  });

  // Best-effort notifications — a delivery failure here shouldn't undo an
  // already-confirmed booking.
  try {
    await sendEmailViaGmail({
      to: prospectEmail,
      subject: `Confirmed: your call with Hartwich Labs — ${whenLabel}`,
      body: `Hi ${prospectName},\n\nYou're booked for ${whenLabel}. We'll call/reach out at ${prospectPhone || "the contact info you provided"}.\n\nSee you then,\nHartwich Labs`,
      accountIndex: 0,
    });
  } catch (error) {
    console.error("Failed to send booking confirmation email:", error);
  }

  try {
    await sendEmailViaGmail({
      to: "gavinhartwich@gmail.com",
      subject: `New booking: ${prospectName} — ${whenLabel}`,
      body: `${prospectName} booked a call for ${whenLabel}.\n\nEmail: ${prospectEmail}\nPhone: ${prospectPhone || "—"}${company ? `\nCompany: ${company.name}` : ""}\n\n${Object.entries(answersByLabel)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}`,
      accountIndex: 0,
    });
  } catch (error) {
    console.error("Failed to send booking notification email:", error);
  }

  return NextResponse.json({ success: true, booking: { id: booking.id, scheduledAt: booking.scheduledAt } });
}
