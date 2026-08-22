import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, messages, deals, pipelineStages } from "@/db/schema";
import { getUnreadMessages, getGmailMessage, extractFromAddress, extractInReplyToMessageId } from "@/lib/integrations/gmail-multi";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    let repliesFound = 0;
    let stagesUpdated = 0;
    const errors: string[] = [];

    // Sync replies from all 3 accounts
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

            // Find the original sent email
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

            // Create inbound activity for the reply
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

            // Create reply message record
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

            // Auto-update the original message status
            await db
              .update(messages)
              .set({ status: "replied" })
              .where(eq(messages.id, sentMessage.id));

            // Auto-update deal stage to "In Conversation" if there is such a stage
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

    return NextResponse.json({
      success: true,
      repliesFound,
      stagesUpdated,
      errors: errors.length > 0 ? errors : undefined,
      message: `Synced ${repliesFound} replies, updated ${stagesUpdated} deal stages`,
    });
  } catch (error) {
    console.error("Error syncing replies:", error);
    return NextResponse.json(
      { error: "Failed to sync replies", details: String(error) },
      { status: 500 }
    );
  }
}
