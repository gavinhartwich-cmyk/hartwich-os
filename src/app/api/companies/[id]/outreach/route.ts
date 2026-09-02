import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { companies, contacts, emailDrafts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { draftOutreachEmail } from "@/lib/ai/draft-outreach";
import { findRecentOutreach, DUPLICATE_OUTREACH_WINDOW_DAYS } from "@/lib/data/email-drafts";

const DraftFromCompanySchema = z.object({
  contactId: z.string().uuid(),
  angle: z.string().trim().optional(),
});

/**
 * POST /api/companies/[id]/outreach — drafts a personalized outreach
 * email for a contact at this company, using the company's own record
 * (Google review signals, qualification research, website enrichment)
 * instead of requiring that context to be typed in by hand. This is the
 * inline replacement for the old standalone /outreach pages — drafting
 * now happens on the company page that already has all this data loaded.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: companyId } = await params;
    const body = await request.json();
    const { contactId, angle } = DraftFromCompanySchema.parse(body);

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, contactId),
    });
    if (!contact || contact.companyId !== companyId) {
      return NextResponse.json({ error: "Contact not found on this company" }, { status: 404 });
    }
    if (!contact.email) {
      return NextResponse.json({ error: "This contact has no email address" }, { status: 400 });
    }

    // Refuse to draft a duplicate — a contact with an email already queued
    // to send, or sent within the last DUPLICATE_OUTREACH_WINDOW_DAYS days,
    // doesn't need a second one. This is what actually stops the "silently
    // queued, so I drafted another one" duplicate-send scenario, rather
    // than just making the queued state visible after the fact.
    const recent = await findRecentOutreach(contactId);
    if (recent) {
      return NextResponse.json(
        {
          error:
            recent.status === "approved"
              ? "This contact already has an outreach email queued to send — no need for another one."
              : `This contact was already emailed on ${recent.sentAt!.toLocaleDateString()} (within the last ${DUPLICATE_OUTREACH_WINDOW_DAYS} days).`,
          recentOutreach: recent,
        },
        { status: 409 }
      );
    }

    const draft = await draftOutreachEmail({
      company,
      contact,
      angle: angle || null,
      yourName: "Gavin Hartwich",
      yourCompany: "Hartwich Labs",
    });

    const [emailDraft] = await db
      .insert(emailDrafts)
      .values({
        companyId,
        contactId,
        subject: draft.subject,
        body: draft.body,
        status: "pending_review",
        aiRunId: draft.aiRunId,
      })
      .returning();

    return NextResponse.json({
      emailDraftId: emailDraft.id,
      subject: draft.subject,
      body: draft.body,
    });
  } catch (error) {
    console.error("Error drafting outreach email:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to draft email", details: String(error) }, { status: 500 });
  }
}
