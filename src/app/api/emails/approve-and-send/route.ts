import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { emailDrafts, messages, activities, companies } from "@/db/schema";
import { sendEmailViaGmail, rotateEmailAccount } from "@/lib/integrations/gmail-multi";
import { canSendEmail, shouldResetDailyCounter, getTodayMidnightWinnipeg } from "@/lib/warmup/schedule";
import { eq } from "drizzle-orm";

const ApproveAndSendSchema = z.object({
  emailDraftId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emailDraftId, userId } = ApproveAndSendSchema.parse(body);

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

    // Rotate email account
    const nextAccountIndex = rotateEmailAccount(
      dailySendCount > 0 
        ? (Math.floor(Math.random() * 3) as any)
        : undefined
    );

    // Send via Gmail
    const { messageId, fromAddress } = await sendEmailViaGmail({
      to: draft.contact.email!,
      subject: draft.subject,
      body: draft.body,
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
        bodyText: draft.body,
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
        subject: draft.subject,
        body: draft.body,
        generatedByAi: !!draft.aiRunId,
        aiPromptVersion: draft.aiRunId || undefined,
      })
      .returning();

    // Update email draft status
    await db
      .update(emailDrafts)
      .set({
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
