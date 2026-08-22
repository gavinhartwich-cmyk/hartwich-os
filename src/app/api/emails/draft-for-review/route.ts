import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { emailDrafts } from "@/db/schema";
import { draftOutreachEmail } from "@/lib/ai/draft-outreach";

const DraftForReviewSchema = z.object({
  contactId: z.string().uuid(),
  companyName: z.string().min(1),
  contactName: z.string().optional(),
  instruction: z.string().min(1),
  dealId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, companyName, contactName, instruction, dealId } = 
      DraftForReviewSchema.parse(body);

    const contact = await db.query.contacts.findFirst({
      where: (c, { eq }) => eq(c.id, contactId),
    });

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    const draft = await draftOutreachEmail({
      companyName,
      contactName,
      instruction,
      yourName: "Gavin Hartwich",
      yourCompany: "Hartwich Labs",
    });

    const emailDraft = await db
      .insert(emailDrafts)
      .values({
        companyId: contact.companyId,
        contactId,
        dealId: dealId || undefined,
        subject: draft.subject,
        body: draft.body,
        status: "pending_review",
        aiRunId: draft.aiRunId,
      })
      .returning();

    return NextResponse.json({
      success: true,
      emailDraftId: emailDraft[0].id,
      subject: draft.subject,
      body: draft.body,
      status: "pending_review",
      message: "Email draft created and awaiting review",
    });
  } catch (error) {
    console.error("Error drafting email for review:", error);

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
