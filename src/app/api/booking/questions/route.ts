import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { createBookingQuestion, listBookingQuestions } from "@/lib/data/bookings";

const CreateSchema = z.object({
  label: z.string().min(1),
  fieldType: z.enum(["text", "textarea", "email", "phone", "select"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const questions = await listBookingQuestions();
  return NextResponse.json({ questions });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = CreateSchema.parse(await request.json());
    const question = await createBookingQuestion(input);
    return NextResponse.json({ success: true, question });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create question", details: String(error) }, { status: 500 });
  }
}
