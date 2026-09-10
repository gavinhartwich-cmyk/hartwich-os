import { NextRequest, NextResponse } from "next/server";
import { getBookingSettings } from "@/lib/booking/availability";
import { listBookingQuestions } from "@/lib/data/bookings";
import { getCompanyById } from "@/lib/data/companies";
import { isCalendarSyncConfigured } from "@/lib/integrations/google-calendar";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/public/booking/config?company=<id>
 * Public — powers the /book page. Returns just what the booking form
 * needs to render: meeting length/timezone, the questionnaire, and
 * (if a ?company= param was on the link) the company name to show a
 * "Booking a call for {name}" header.
 */
export async function GET(request: NextRequest) {
  if (!(await checkRateLimit(`booking-config:${clientIp(request)}`, 60))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("company");

  const [settings, questions, company] = await Promise.all([
    getBookingSettings(),
    listBookingQuestions(),
    companyId ? getCompanyById(companyId).catch(() => null) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    configured: isCalendarSyncConfigured(),
    meetingDurationMinutes: settings.meetingDurationMinutes,
    timezone: settings.timezone,
    questions: questions.map((q) => ({
      id: q.id,
      label: q.label,
      fieldType: q.fieldType,
      options: q.options,
      required: q.required,
      isCore: q.isCore,
    })),
    company: company ? { id: company.id, name: company.name } : null,
  });
}
