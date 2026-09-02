import "server-only";
import { db } from "@/db";
import { emailDrafts, messages, activities } from "@/db/schema";
import { sendEmailViaGmail } from "@/lib/integrations/gmail-multi";
import { recordEmailSent, type EmailAccountIndex } from "@/lib/data/email-accounts";
import { eq } from "drizzle-orm";

type ApprovedDraft = {
  id: string;
  companyId: string;
  contactId: string;
  dealId: string | null;
  aiRunId: string | null;
  contact: { email: string | null };
};

/**
 * Actually sends an already-approved draft: Gmail send, activity + message
 * records, flips the draft to 'sent', and records the send against the
 * account's warm-up state. Shared by the interactive approve-and-send route
 * (send-now path) and the cron queue-flush route (send-once-capacity-frees-
 * up path) — same mechanics either way, only *when* differs.
 */
export async function sendApprovedDraft(
  draft: ApprovedDraft,
  finalSubject: string,
  finalBody: string,
  accountIndex: EmailAccountIndex,
  approvedByUserId: string
): Promise<{ messageId: string; fromAddress: string; activityId: string }> {
  if (!draft.contact.email) {
    throw new Error("Contact has no email address");
  }

  const { messageId, fromAddress } = await sendEmailViaGmail({
    to: draft.contact.email,
    subject: finalSubject,
    body: finalBody,
    accountIndex,
  });

  const [activity] = await db
    .insert(activities)
    .values({
      companyId: draft.companyId,
      contactId: draft.contactId,
      dealId: draft.dealId || undefined,
      type: "email",
      direction: "outbound",
      bodyText: finalBody,
      aiGenerated: !!draft.aiRunId,
      createdBy: approvedByUserId,
    })
    .returning();

  const [message] = await db
    .insert(messages)
    .values({
      activityId: activity.id,
      provider: "gmail",
      providerMessageId: messageId,
      status: "sent",
      toAddress: draft.contact.email,
      fromAddress,
      subject: finalSubject,
      body: finalBody,
      generatedByAi: !!draft.aiRunId,
      aiPromptVersion: draft.aiRunId || undefined,
    })
    .returning();

  await db
    .update(emailDrafts)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentFromEmailIndex: accountIndex,
      messageId: message.id,
      updatedAt: new Date(),
    })
    .where(eq(emailDrafts.id, draft.id));

  await recordEmailSent(accountIndex);

  return { messageId, fromAddress, activityId: activity.id };
}
