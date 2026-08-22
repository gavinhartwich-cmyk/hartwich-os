import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { draftOutreachEmail } from "@/lib/ai/draft-outreach";

const DraftEmailSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().optional(),
  instruction: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyName, contactName, instruction } = DraftEmailSchema.parse(body);

    const draft = await draftOutreachEmail({
      companyName,
      contactName,
      instruction,
      yourName: "Gavin Hartwich",
      yourCompany: "Hartwich Labs",
    });

    return NextResponse.json(draft);
  } catch (error) {
    console.error("Error drafting email:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to draft email", details: String(error) },
      { status: 500 }
    );
  }
}
