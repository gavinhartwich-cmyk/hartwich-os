import "server-only";
import { db } from "@/db";

export interface PendingEmailDraft {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  companyName: string;
  subject: string;
  body: string;
  createdAt: Date;
}

/**
 * How long a 'sent' email counts as "recent" for the duplicate-outreach
 * guard below — a contact emailed within this window can't be drafted/
 * approved again. 'approved' (queued, not yet sent) always counts,
 * regardless of age, since it's a real send still waiting to go out.
 */
export const DUPLICATE_OUTREACH_WINDOW_DAYS = 14;

export interface RecentOutreach {
  id: string;
  status: "approved" | "sent";
  subject: string;
  sentAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
}

function outreachWindowCutoff(): Date {
  return new Date(Date.now() - DUPLICATE_OUTREACH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The single most recent queued-or-recently-sent draft to `contactId`, if
 * any — used to block drafting/approving a duplicate. `excludeDraftId`
 * lets the approve-and-send route check for *other* drafts without
 * tripping over the very draft it's approving.
 */
export async function findRecentOutreach(
  contactId: string,
  excludeDraftId?: string
): Promise<RecentOutreach | null> {
  const cutoff = outreachWindowCutoff();
  const found = await db.query.emailDrafts.findFirst({
    where: (ed, { eq, and, or, gte, ne }) => {
      const base = and(
        eq(ed.contactId, contactId),
        or(eq(ed.status, "approved"), and(eq(ed.status, "sent"), gte(ed.sentAt, cutoff)))
      );
      return excludeDraftId ? and(base, ne(ed.id, excludeDraftId)) : base;
    },
    orderBy: (ed, { desc }) => desc(ed.createdAt),
  });
  if (!found) return null;
  return {
    id: found.id,
    status: found.status as "approved" | "sent",
    subject: found.subject,
    sentAt: found.sentAt,
    approvedAt: found.approvedAt,
    createdAt: found.createdAt,
  };
}

/**
 * Same lookup as findRecentOutreach, batched across every contact on a
 * company page — one query instead of one per contact. Keyed by contactId.
 */
export async function findRecentOutreachForContacts(
  contactIds: string[]
): Promise<Record<string, RecentOutreach[]>> {
  if (contactIds.length === 0) return {};
  const cutoff = outreachWindowCutoff();
  const drafts = await db.query.emailDrafts.findMany({
    where: (ed, { inArray, and, or, eq, gte }) =>
      and(
        inArray(ed.contactId, contactIds),
        or(eq(ed.status, "approved"), and(eq(ed.status, "sent"), gte(ed.sentAt, cutoff)))
      ),
    orderBy: (ed, { desc }) => desc(ed.createdAt),
  });

  const byContact: Record<string, RecentOutreach[]> = {};
  for (const d of drafts) {
    (byContact[d.contactId] ??= []).push({
      id: d.id,
      status: d.status as "approved" | "sent",
      subject: d.subject,
      sentAt: d.sentAt,
      approvedAt: d.approvedAt,
      createdAt: d.createdAt,
    });
  }
  return byContact;
}

export type EmailHistoryStatus = "bounced" | "replied" | "opened" | "delivered" | "sent";

export interface EmailHistoryEntry {
  id: string;
  subject: string | null;
  toAddress: string | null;
  sentAt: Date;
  status: EmailHistoryStatus;
  openCount: number;
  bounceReason: string | null;
}

/**
 * Full outbound-email history for a company's page (v1.1) — every email
 * ever sent, not just the DUPLICATE_OUTREACH_WINDOW_DAYS-limited recent
 * ones findRecentOutreach(ForContacts) returns. Status is derived, not read
 * straight off `messages.status`, because "opened" isn't its own enum value
 * — openedAt is a separate signal layered on top of delivered/bounced/replied.
 */
export async function listEmailHistoryForCompany(companyId: string): Promise<EmailHistoryEntry[]> {
  const sent = await db.query.activities.findMany({
    where: (a, { eq, and }) => and(eq(a.companyId, companyId), eq(a.type, "email"), eq(a.direction, "outbound")),
    with: { message: true },
    orderBy: (a, { desc }) => desc(a.occurredAt),
  });

  return sent
    .filter((a): a is typeof a & { message: NonNullable<typeof a.message> } => a.message != null)
    .map((a) => {
      const m = a.message;
      const status: EmailHistoryStatus =
        m.status === "bounced"
          ? "bounced"
          : m.status === "replied"
            ? "replied"
            : m.openedAt
              ? "opened"
              : m.status === "delivered"
                ? "delivered"
                : "sent";
      return {
        id: m.id,
        subject: m.subject,
        toAddress: m.toAddress,
        sentAt: a.occurredAt,
        status,
        openCount: m.openCount,
        bounceReason: m.bounceReason,
      };
    });
}

export async function listPendingEmailDrafts(): Promise<PendingEmailDraft[]> {
  const drafts = await db.query.emailDrafts.findMany({
    where: (ed, { eq }) => eq(ed.status, "pending_review"),
    with: {
      contact: true,
      company: true,
    },
    orderBy: (ed, { asc }) => asc(ed.createdAt),
  });

  return drafts.map((d) => ({
    id: d.id,
    contactName: d.contact.name,
    contactEmail: d.contact.email,
    companyName: d.company.name,
    subject: d.subject,
    body: d.body,
    createdAt: d.createdAt,
  }));
}
