import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { linkedinContacts, linkedinContactEvents } from "@/db/schema";
import { deriveLinkedInStatus, isFollowUpDue, nextFollowUpDueAt, type LinkedInEventType } from "@/lib/linkedin/cadence";

export type LinkedInContactSummary = Awaited<ReturnType<typeof listLinkedInContacts>>[number];

/** Every contact with its history, plus the things the list page actually needs to decide what to show first. */
export async function listLinkedInContacts() {
  const rows = await db.query.linkedinContacts.findMany({
    with: { events: { orderBy: (e, { asc }) => asc(e.occurredAt) } },
    orderBy: (c, { desc }) => desc(c.createdAt),
  });

  return rows.map((contact) => ({
    ...contact,
    lastContactedAt: contact.events.at(-1)?.occurredAt ?? null,
    nextFollowUpDueAt: nextFollowUpDueAt(contact.events),
    followUpDue: contact.active && isFollowUpDue(contact.events),
    status: deriveLinkedInStatus(contact.events),
  }));
}

export async function getLinkedInContact(id: string) {
  const row = await db.query.linkedinContacts.findFirst({
    where: eq(linkedinContacts.id, id),
    with: { events: { orderBy: (e, { desc }) => desc(e.occurredAt) } },
  });
  if (!row) return null;
  const chronological = [...row.events].reverse();
  return {
    ...row,
    nextFollowUpDueAt: nextFollowUpDueAt(chronological),
    followUpDue: row.active && isFollowUpDue(chronological),
    status: deriveLinkedInStatus(chronological),
  };
}

export type AddLinkedInContactInput = {
  linkedinUrl: string;
  name?: string | null;
  companyName?: string | null;
  notes?: string | null;
};

/** Creates the contact and its first event (occurredAt = now) in one transaction — pasting the link IS logging the first message sent. */
export async function addLinkedInContact(input: AddLinkedInContactInput, userId: string) {
  return db.transaction(async (tx) => {
    const [contact] = await tx
      .insert(linkedinContacts)
      .values({
        linkedinUrl: input.linkedinUrl,
        name: input.name || null,
        companyName: input.companyName || null,
        notes: input.notes || null,
        createdBy: userId,
      })
      .returning();

    await tx
      .insert(linkedinContactEvents)
      .values({ contactId: contact.id, type: "message_sent", note: "Initial message sent" });
    return contact;
  });
}

export async function logLinkedInFollowUp(
  contactId: string,
  type: LinkedInEventType,
  note?: string | null,
  occurredAt?: Date
) {
  await db.insert(linkedinContactEvents).values({ contactId, type, note: note || null, occurredAt: occurredAt ?? new Date() });
}

export async function deleteLinkedInEvent(eventId: string) {
  await db.delete(linkedinContactEvents).where(eq(linkedinContactEvents.id, eventId));
}

export async function updateLinkedInContact(
  id: string,
  fields: { name?: string | null; companyName?: string | null; notes?: string | null }
) {
  await db.update(linkedinContacts).set(fields).where(eq(linkedinContacts.id, id));
}

export async function setLinkedInContactActive(id: string, active: boolean) {
  await db.update(linkedinContacts).set({ active }).where(eq(linkedinContacts.id, id));
}

export async function deleteLinkedInContact(id: string) {
  await db.delete(linkedinContacts).where(eq(linkedinContacts.id, id));
}
