import "server-only";
import { db } from "@/db";

export type EmailStatus =
  | "sent"
  | "delivered"
  | "opened"
  | "replied"
  | "bounced"
  | "failed"
  | "draft";

export interface EmailThreadMessage {
  id: string;
  direction: "outbound" | "inbound";
  status: EmailStatus;
  subject: string | null;
  bodyText: string | null;
  occurredAt: Date;
  openedAt: Date | null;
  bouncedAt: Date | null;
  bounceReason: string | null;
}

export interface EmailThread {
  contactId: string;
  contactName: string | null;
  contactEmail: string | null;
  messages: EmailThreadMessage[];
  /** Whatever's needed to send a reply into this same conversation — the most recent message that actually has a Gmail thread + account on record. Null when there's nothing to thread onto yet (e.g. a manually-logged activity with no real message row). */
  replyTarget: {
    threadId: string;
    accountIndex: number;
    providerMessageId: string;
    subject: string | null;
  } | null;
}

/**
 * Every emailed contact at a company, each with their full back-and-forth
 * (outbound sends + inbound replies) in one chronological list, plus
 * whatever's needed to reply from the company page. Company page's "Email
 * status" section (src/app/(app)/companies/[id]/email-status-panel.tsx) —
 * one query per company page load, not per contact.
 */
export async function listEmailThreadsForCompany(companyId: string): Promise<EmailThread[]> {
  const emailActivities = await db.query.activities.findMany({
    where: (a, { eq, and }) => and(eq(a.companyId, companyId), eq(a.type, "email")),
    with: { contact: true, message: true },
    orderBy: (a, { asc }) => asc(a.occurredAt),
  });

  const byContact = new Map<string, EmailThread>();

  for (const activity of emailActivities) {
    if (!activity.contactId) continue; // Can't attribute this to a specific contact's thread.

    let thread = byContact.get(activity.contactId);
    if (!thread) {
      thread = {
        contactId: activity.contactId,
        contactName: activity.contact?.name ?? null,
        contactEmail: activity.contact?.email ?? null,
        messages: [],
        replyTarget: null,
      };
      byContact.set(activity.contactId, thread);
    }

    const message = activity.message;
    thread.messages.push({
      id: activity.id,
      direction: activity.direction,
      status: (message?.status as EmailStatus) ?? "sent",
      subject: message?.subject ?? null,
      bodyText: activity.bodyText,
      occurredAt: activity.occurredAt,
      openedAt: message?.openedAt ?? null,
      bouncedAt: message?.bouncedAt ?? null,
      bounceReason: message?.bounceReason ?? null,
    });

    if (message?.threadId && message.accountIndex != null && message.providerMessageId) {
      thread.replyTarget = {
        threadId: message.threadId,
        accountIndex: message.accountIndex,
        providerMessageId: message.providerMessageId,
        subject: message.subject,
      };
    }
  }

  return [...byContact.values()];
}

/**
 * The single most recent message for a contact that carries enough to
 * reply into the same Gmail thread — used by the reply route instead of
 * re-fetching every contact's whole history via listEmailThreadsForCompany
 * above just to answer "what do I reply onto?" for one of them.
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
