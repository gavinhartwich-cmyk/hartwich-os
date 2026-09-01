import "server-only";
import { db } from "@/db";
import { emailDrafts } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface PendingEmailDraft {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  companyName: string;
  subject: string;
  body: string;
  createdAt: Date;
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
