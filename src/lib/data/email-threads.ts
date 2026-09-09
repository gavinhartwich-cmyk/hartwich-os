import "server-only";
import { db } from "@/db";

/**
 * The single most recent message for a contact that carries enough to
 * reply into the same Gmail thread — used by the manual-reply route
 * (src/app/api/companies/[id]/emails/reply) to answer "what do I reply
 * onto, and from which of the 3 mailboxes?" for a given contact.
 */
export async function getReplyTargetForContact(contactId: string): Promise<{
  threadId: string;
  accountIndex: 0 | 1 | 2;
  providerMessageId: string;
  subject: string | null;
  toAddress: string | null;
  fromAddress: string | null;
} | null> {
  const emailActivities = await db.query.activities.findMany({
    where: (a, { eq, and }) => and(eq(a.contactId, contactId), eq(a.type, "email")),
    with: { message: true },
    orderBy: (a, { desc }) => desc(a.occurredAt),
  });

  for (const activity of emailActivities) {
    const message = activity.message;
    if (message?.threadId && message.accountIndex != null && message.providerMessageId) {
      return {
        threadId: message.threadId,
        accountIndex: message.accountIndex as 0 | 1 | 2,
        providerMessageId: message.providerMessageId,
        subject: message.subject,
        toAddress: message.toAddress,
        fromAddress: message.fromAddress,
      };
    }
  }
  return null;
}
