import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { emailDrafts } from "@/db/schema";
import { resolveAccountForDraft } from "@/lib/data/email-accounts";
import { sendApprovedDraft } from "@/lib/emails/send-approved-draft";
import { findRecentOutreach, DUPLICATE_OUTREACH_WINDOW_DAYS } from "@/lib/data/email-drafts";
import { eq } from "drizzle-orm";

const ApproveAndSendSchema = z.object({
  emailDraftId: z.string().uuid(),
  userId: z.string().uuid(),
  // Optional edits made after the draft was generated (e.g. from the
  // company page's inline review step) — sent instead of the stored
  // subject/body when present, and persisted onto the draft for the audit trail.
  subject: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailDraftId, userId, subject: subjectOverride, body: bodyOverride } =
      ApproveAndSendSchema.parse(body);

    const draft = await db.query.emailDrafts.findFirst({
      where: (ed, { eq }) => eq(ed.id, emailDraftId),
      with: { contact: true, company: true },
    });

    if (!draft) {
      return NextResponse.json({ error: "Email draft not found" }, { status: 404 });
    }
    if (draft.status !== "pending_review") {
      return NextResponse.json(
        { error: `Cannot approve email with status: ${draft.status}` },
        { status: 400 }
      );
    }
    if (!draft.contact.email) {
      return NextResponse.json({ error: "This contact has no email address" }, { status: 400 });
    }

    // Second layer of the duplicate guard (the first is at draft-creation
    // time, /api/companies/[id]/outreach) — catches a duplicate however it
    // got created, e.g. a draft that already existed before this check was
    // added, or two drafts approved in quick succession before either one
    // updated its status. excludeDraftId so approving *this* draft doesn't
    // trip over itself.
    //
    // Cold outreach ONLY. The guard exists to stop a second introduction
    // going to someone already introduced to — and a follow-up, a reply and
    // a bounce correction are all, by definition, to a contact who has
    // already been emailed. Running it on those blocked every follow-up
    // approval with "already emailed within the last 14 days", which is
    // precisely the situation a follow-up exists for. Follow-up timing is
    // the cadence's job (src/lib/emails/cadence.ts), not this guard's
    // (Gavin, 2026-09-11).
    if (draft.kind === "cold_outreach") {
      const recentOther = await findRecentOutreach(draft.contactId, draft.id);
      if (recentOther) {
        return NextResponse.json(
          {
            error:
              recentOther.status === "approved"
                ? "This contact already has another outreach email queued to send."
                : `This contact was already emailed on ${recentOther.sentAt!.toLocaleDateString()} (within the last ${DUPLICATE_OUTREACH_WINDOW_DAYS} days).`,
          },
          { status: 409 }
        );
      }
    }

    // Final subject/body — the edited version if the reviewer changed
    // anything before sending, otherwise the original AI draft.
    const finalSubject = subjectOverride ?? draft.subject;
    const finalBody = bodyOverride ?? draft.body;

    // Approval is recorded now, unconditionally — sending may not happen
    // until later. Every sending account (email_send_accounts) has a daily
    // warm-up cap and a minimum spacing between sends; if none has capacity
    // right this second, the draft stays 'approved' with no sentAt, and the
    // cron queue-flush job (/api/cron/send-queued-emails) sends it once one
    // does. That also means a transient Gmail failure below leaves the
    // draft in the same recoverable state — the queue flush retries it,
    // nothing gets silently lost.
    await db
      .update(emailDrafts)
      .set({
        subject: finalSubject,
        body: finalBody,
        status: "approved",
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailDrafts.id, emailDraftId));

    const accountIndex = await resolveAccountForDraft(draft);

    if (accountIndex === null) {
      return NextResponse.json({
        success: true,
        queued: true,
        message: "Approved — every account is at its warm-up limit right now. This will send automatically once one frees up.",
      });
    }

    const { messageId, fromAddress, activityId } = await sendApprovedDraft(
      draft,
      finalSubject,
      finalBody,
      accountIndex,
      userId
    );

    return NextResponse.json({
      success: true,
      queued: false,
      messageId,
      activityId,
      accountUsed: accountIndex,
      fromAddress,
      message: `Email approved and sent to ${draft.contact.email} from account ${accountIndex + 1}`,
    });
  } catch (error) {
    console.error("Error approving and sending email:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to approve and send email", details: String(error) },
      { status: 500 }
    );
  }
}
