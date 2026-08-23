import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { listBookings } from "@/lib/data/bookings";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bookings = await listBookings();
  return NextResponse.json({ bookings });
}
