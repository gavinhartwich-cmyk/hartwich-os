import "server-only";
import { db } from "@/db";
import { activities, messages, deals, pipelineStages } from "@/db/schema";
import {
  getUnreadMessages,
  getGmailMessage,
  extractFromAddress,
  extractInReplyToMessageId,
} from "@/lib/integrations/gmail-multi";
import { eq } from "drizzle-orm";

export type SyncRepliesResult = {
  repliesFound: number;
  stagesUpdated: number;
  errors: string[];
};

/**
 * Core Gmail reply-sync logic (Phase 3/4), shared by the session-protected
 * manual-trigger route (src/app/api/emails/sync-replies) and the
 * bearer-secret cron route (src/app/api/cron/sync-replies) that a Zo
 * background loop hits on a schedule. Polls all 3 rotating Gmail accounts
 * for unread replies to our outbound emails, logs them as inbound
 * activities, and bumps the deal to the "responded/conversation" stage.
 */
export async function syncReplies(): Promise<SyncRepliesResult> {
  let repliesFound = 0;
  let stagesUpdated = 0;
  const errors: string[] = [];

  for (let accountIndex = 0; accountIndex < 3; accountIndex++) {
    try {
      const unreadResponse = await getUnreadMessages(accountIndex as any);

      if (!unreadResponse.messages) continue;

      for (const msgRef of unreadResponse.messages) {
        try {
          const fullMsg = await getGmailMessage(accountIndex as any, msgRef.id!);
          const headers = fullMsg.payload?.headers || [];

          const fromAddress = extractFromAddress(headers);
          const inReplyToId = extractInReplyToMessageId(headers);

          if (!inReplyToId) continue; // Not a reply to our email

          const sentMessage = await db.query.messages.findFirst({
            where: (m, { eq }) => eq(m.providerMessageId, inReplyToId),
            with: {
              activity: {
                with: {
                  deal: {
                    with: {
                      stage: true,
                    },
                  },
                },
              },
            },
          });

          if (!sentMessage) continue;

          const replyBody = fullMsg.payload?.parts?.[0]?.body?.data
            ? Buffer.from(fullMsg.payload.parts[0].body.data, "base64").toString()
            : "Reply received";

          const replyActivity = await db
            .insert(activities)
            .values({
              companyId: sentMessage.activity.companyId,
              contactId: sentMessage.activity.contactId,
              dealId: sentMessage.activity.dealId,
              type: "email",
              direction: "inbound",
              bodyText: replyBody,
              aiGenerated: false,
            })
            .returning();

          await db
            .insert(messages)
            .values({
              activityId: replyActivity[0].id,
              provider: "gmail",
              providerMessageId: msgRef.id!,
              threadId: fullMsg.threadId,
              status: "replied",
              fromAddress,
              toAddress: sentMessage.toAddress,
              subject: `Re: ${sentMessage.subject}`,
              body: replyBody,
              generatedByAi: false,
            })
            .returning();

          repliesFound++;

          await db.update(messages).set({ status: "replied" }).where(eq(messages.id, sentMessage.id));

          if (sentMessage.activity.deal) {
            const responseStage = await db.query.pipelineStages.findFirst({
              where: (ps, { ilike }) => ilike(ps.name, "%responded%") || ilike(ps.name, "%conversation%"),
            });

            if (responseStage && sentMessage.activity.deal.stageId !== responseStage.id) {
              await db
                .update(deals)
                .set({
                  stageId: responseStage.id,
                  stageEnteredAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(deals.id, sentMessage.activity.deal.id));

              stagesUpdated++;
            }
          }
        } catch (msgErr) {
          errors.push(`Failed to process message ${msgRef.id}: ${String(msgErr)}`);
        }
      }
    } catch (accountErr) {
      errors.push(`Failed to sync account ${accountIndex + 1}: ${String(accountErr)}`);
    }
  }

  return { repliesFound, stagesUpdated, errors };
}
