import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";

export type Contact = Awaited<ReturnType<typeof listContactsForCompany>>[number];

export type ContactInput = {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  isPrimary?: boolean;
  /** Defaults to "manual" — the contacts-panel form. Owner lookups pass "apollo". */
  source?: "google_places" | "apollo" | "manual";
};

export async function listContactsForCompany(companyId: string) {
  return db.query.contacts.findMany({
    where: (contact, { eq }) => eq(contact.companyId, companyId),
    orderBy: (contact, { desc, asc }) => [desc(contact.isPrimary), asc(contact.createdAt)],
  });
}

/**
 * Creates a contact for a company. Marking it primary demotes any
 * existing primary contact first — only one contact per company can be
 * primary at a time.
 */
export async function createContact(companyId: string, input: ContactInput) {
  return db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(contacts)
        .set({ isPrimary: false })
        .where(eq(contacts.companyId, companyId));
    }

    const [contact] = await tx
      .insert(contacts)
      .values({
        companyId,
        name: input.name || null,
        title: input.title || null,
        email: input.email || null,
        phone: input.phone || null,
        linkedinUrl: input.linkedinUrl || null,
        isPrimary: input.isPrimary ?? false,
        source: input.source ?? "manual",
      })
      .returning();
    return contact;
  });
}

export async function setPrimaryContact(companyId: string, contactId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({ isPrimary: false })
      .where(eq(contacts.companyId, companyId));
    await tx.update(contacts).set({ isPrimary: true }).where(eq(contacts.id, contactId));
  });
}

export async function deleteContact(contactId: string) {
  await db.delete(contacts).where(eq(contacts.id, contactId));
}
