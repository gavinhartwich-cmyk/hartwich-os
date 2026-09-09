import "server-only";
import crypto from "node:crypto";
import { db } from "@/db";
import { emailDrafts, messages, activities, deals } from "@/db/schema";
import { sendEmailViaGmail } from "@/lib/integrations/gmail-multi";
import { recordEmailSent, type EmailAccountIndex } from "@/lib/data/email-accounts";
import { findStageByName, PIPELINE_STAGE_NAMES } from "@/lib/data/pipeline-stages";
import { notifyOps } from "@/lib/notifications/notify";
import { companyUrl } from "@/lib/utils/app-url";
import { eq } from "drizzle-orm";

type ApprovedDraft = {
  id: string;
  companyId: string;
  contactId: string;
  dealId: string | null;
  aiRunId: string | null;
  kind: string;
  inReplyToMessageId: string | null;
  contact: { email: string | null };
};

/**
 * Actually sends an already-approved draft: Gmail send, activity + message
 * records, flips the draft to 'sent', records the send against the
 * account's warm-up state, and (v1.1) drives the deal's stage/cadence state
 * off what kind of draft this was. Shared by the interactive approve-and-send
 * route (send-now path) and the cron queue-flush route (send-once-capacity-
 * frees-up path) — same mechanics either way, only *when* differs.
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

  // A reply must land in the same Gmail conversation as the message it's
  // answering, with proper In-Reply-To/References headers — pulled off the
  // inbound message this draft was drafted from (see sync-replies.ts).
  const inReplyToMessage = draft.inReplyToMessageId
    ? await db.query.messages.findFirst({ where: eq(messages.id, draft.inReplyToMessageId) })
    : null;

  // Every outbound message gets a tracking token for the open-tracking pixel
  // — can't be added retroactively to mail already sent, only going forward.
  const trackingToken = crypto.randomUUID();

  const { messageId, fromAddress, threadId, rfc822MessageId } = await sendEmailViaGmail({
    to: draft.contact.email,
    subject: finalSubject,
    body: finalBody,
    accountIndex,
    trackingToken,
    inReplyTo: inReplyToMessage?.rfc822MessageId ?? undefined,
    references: inReplyToMessage?.rfc822MessageId ?? undefined,
    threadId: inReplyToMessage?.threadId ?? undefined,
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
      threadId,
      status: "delivered",
      toAddress: draft.contact.email,
      fromAddress,
      subject: finalSubject,
      body: finalBody,
      generatedByAi: !!draft.aiRunId,
      aiPromptVersion: draft.aiRunId || undefined,
      trackingToken,
      rfc822MessageId,
      accountIndex,
      deliveredAt: new Date(),
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

  // Replies aren't cold volume — they don't compete for warm-up daily-cap
  // headroom or the round-robin rotation pointer.
  if (draft.kind !== "reply") {
    await recordEmailSent(accountIndex);
  }

  if (draft.dealId) {
    await applyPostSendDealUpdate(draft.dealId, draft.kind);
  }

  return { messageId, fromAddress, activityId: activity.id };
}

/**
 * v1.1 cadence bookkeeping: what happens to the deal once a draft of a given
 * `kind` actually goes out. Keeps the whole state machine in one place
 * rather than scattered across every call site that can trigger a send.
 */
async function applyPostSendDealUpdate(dealId: string, kind: string): Promise<void> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { stage: true, company: true },
  });
  if (!deal) return;

  const now = new Date();

  if (kind === "cold_outreach" || kind === "bounce_correction") {
    // First (or corrected) outreach landing — this is the "delivered auto-
    // moves the deal to Contacted" behavior. Only fires from New Lead so a
    // manual re-send later in the pipeline doesn't yank the deal backward.
    if (deal.stage.name === PIPELINE_STAGE_NAMES.NEW_LEAD) {
      const contactedStage = await findStageByName(PIPELINE_STAGE_NAMES.CONTACTED);
      if (contactedStage) {
        await db
          .update(deals)
          .set({
            stageId: contactedStage.id,
            stageEnteredAt: now,
            lastOutboundEmailAt: now,
            updatedAt: now,
          })
          .where(eq(deals.id, dealId));

        const link = companyUrl(deal.company.id);
        await notifyOps(
          `${deal.company.name}: moved to Contacted`,
          `An outreach email delivered to ${deal.company.name} and the deal moved from New Lead to Contacted.` +
            (link ? `\n\n${link}` : "")
        );
        return;
      }
    }
    await db.update(deals).set({ lastOutboundEmailAt: now, updatedAt: now }).where(eq(deals.id, dealId));
    return;
  }

  if (kind === "follow_up") {
    // Sending the reviewed follow-up clears the "needs a look" flag and
    // resets stageEnteredAt — this is what sends it back to the bottom of
    // Contacted (see listDealsForBoard's sort) after it surfaced at the top.
    await db
      .update(deals)
      .set({
        lastOutboundEmailAt: now,
        followUpCount: deal.followUpCount + 1,
        followUpFlaggedAt: null,
        stageEnteredAt: now,
        updatedAt: now,
      })
      .where(eq(deals.id, dealId));
    return;
  }

  // kind === "reply": already in Engaged (moved there when the reply came
  // in — see sync-replies.ts). Just keep the cadence clock current.
  await db.update(deals).set({ lastOutboundEmailAt: now, updatedAt: now }).where(eq(deals.id, dealId));
}
