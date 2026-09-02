import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { emailDrafts, messages, activities, companies } from "@/db/schema";
import { sendEmailViaGmail, rotateEmailAccount, type EmailAccountIndex } from "@/lib/integrations/gmail-multi";
import { canSendEmail, shouldResetDailyCounter, getTodayMidnightWinnipeg } from "@/lib/warmup/schedule";
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

    // Fetch email draft
    const draft = await db.query.emailDrafts.findFirst({
      where: (ed, { eq }) => eq(ed.id, emailDraftId),
      with: {
        contact: true,
        company: true,
      },
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Email draft not found" },
        { status: 404 }
      );
    }

    if (draft.status !== "pending_review") {
      return NextResponse.json(
        { error: `Cannot approve email with status: ${draft.status}` },
        { status: 400 }
      );
    }

    // Check warm-up limits
    let company = draft.company;
    let dailySendCount = company.dailySendCount || 0;
    let lastSendResetAt = company.lastSendResetAt;

    // Reset daily counter if needed
    if (shouldResetDailyCounter(lastSendResetAt)) {
      dailySendCount = 0;
      lastSendResetAt = getTodayMidnightWinnipeg();
    }

    const canSend = canSendEmail(company.warmupStatus || "not_started", dailySendCount, company.warmupStartedAt);
    if (!canSend.allowed) {
      return NextResponse.json(
        { error: "Cannot send", reason: canSend.reason },
        { status: 400 }
      );
    }

    // Final subject/body — the edited version if the reviewer changed
    // anything before sending, otherwise the original AI draft.
    const finalSubject = subjectOverride ?? draft.subject;
    const finalBody = bodyOverride ?? draft.body;

    // Rotate email account — round-robin off whichever of the 3 Gmail
    // accounts actually sent last (globally, not per-company: the point is
    // spreading send volume evenly across accounts for warm-up), not a
    // random guess. sentFromEmailIndex is already recorded on every send
    // below, so the last one is the actual rotation state, no new column
    // needed.
    const lastSent = await db.query.emailDrafts.findFirst({
      where: (ed, { eq }) => eq(ed.status, "sent"),
      orderBy: (ed, { desc }) => desc(ed.sentAt),
    });
    const nextAccountIndex = rotateEmailAccount(
      (lastSent?.sentFromEmailIndex as EmailAccountIndex | null) ?? undefined
    );

    // Send via Gmail
    const { messageId, fromAddress } = await sendEmailViaGmail({
      to: draft.contact.email!,
      subject: finalSubject,
      body: finalBody,
      accountIndex: nextAccountIndex,
    });

    // Create activity record
    const activity = await db
      .insert(activities)
      .values({
        companyId: draft.companyId,
        contactId: draft.contactId,
        dealId: draft.dealId || undefined,
        type: "email",
        direction: "outbound",
        bodyText: finalBody,
        aiGenerated: !!draft.aiRunId,
        createdBy: userId,
      })
      .returning();

    // Create message record
    const message = await db
      .insert(messages)
      .values({
        activityId: activity[0].id,
        provider: "gmail",
        providerMessageId: messageId,
        status: "sent",
        toAddress: draft.contact.email!,
        fromAddress,
        subject: finalSubject,
        body: finalBody,
        generatedByAi: !!draft.aiRunId,
        aiPromptVersion: draft.aiRunId || undefined,
      })
      .returning();

    // Update email draft status (persisting any edits for the audit trail)
    await db
      .update(emailDrafts)
      .set({
        subject: finalSubject,
        body: finalBody,
        status: "sent",
        approvedBy: userId,
        approvedAt: new Date(),
        sentAt: new Date(),
        sentFromEmailIndex: nextAccountIndex,
        messageId: message[0].id,
        updatedAt: new Date(),
      })
      .where(eq(emailDrafts.id, emailDraftId));

    // Update company warm-up tracking
    await db
      .update(companies)
      .set({
        warmupStatus: company.warmupStatus === "not_started" ? "warming_up" : company.warmupStatus,
        warmupStartedAt: company.warmupStartedAt || new Date(),
        dailySendCount: dailySendCount + 1,
        lastSendResetAt,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, draft.companyId));

    return NextResponse.json({
      success: true,
      messageId,
      activityId: activity[0].id,
      accountUsed: nextAccountIndex,
      fromAddress,
      message: `Email approved and sent to ${draft.contact.email} from account ${nextAccountIndex + 1}`,
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
