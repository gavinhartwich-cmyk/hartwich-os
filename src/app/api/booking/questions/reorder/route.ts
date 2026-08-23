import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { reorderBookingQuestions } from "@/lib/data/bookings";

const ReorderSchema = z.object({ orderedIds: z.array(z.string().uuid()) });

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { orderedIds } = ReorderSchema.parse(await request.json());
    await reorderBookingQuestions(orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to reorder", details: String(error) }, { status: 500 });
  }
}
