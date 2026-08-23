import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { getBookingSettings } from "@/lib/booking/availability";
import { updateBookingSettings } from "@/lib/data/bookings";

const UpdateSchema = z.object({
  bookingWindowDays: z.number().int().min(1).max(180).optional(),
  meetingDurationMinutes: z.number().int().min(5).max(480).optional(),
  minNoticeHours: z.number().int().min(0).max(168).optional(),
  timezone: z.string().min(1).optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).optional(),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

async function requireBookingAdmin() {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) return null;
  return user;
}

export async function GET() {
  const user = await requireBookingAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getBookingSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const user = await requireBookingAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = UpdateSchema.parse(await request.json());
    const settings = await updateBookingSettings(input);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update settings", details: String(error) }, { status: 500 });
  }
}
