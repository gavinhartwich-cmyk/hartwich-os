import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { emailDrafts } from "@/db/schema";
import { eq } from "drizzle-orm";

const RejectSchema = z.object({
  emailDraftId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailDraftId, userId, reason } = RejectSchema.parse(body);

    const draft = await db.query.emailDrafts.findFirst({
      where: (ed, { eq }) => eq(ed.id, emailDraftId),
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Email draft not found" },
        { status: 404 }
      );
    }

    if (draft.status !== "pending_review") {
      return NextResponse.json(
        { error: `Cannot reject email with status: ${draft.status}` },
        { status: 400 }
      );
    }

    await db
      .update(emailDrafts)
      .set({
        status: "rejected",
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason || undefined,
        updatedAt: new Date(),
      })
      .where(eq(emailDrafts.id, emailDraftId));

    return NextResponse.json({
      success: true,
      message: "Email draft rejected",
    });
  } catch (error) {
    console.error("Error rejecting email:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to reject email", details: String(error) },
      { status: 500 }
    );
  }
}
