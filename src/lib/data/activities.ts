import "server-only";
import { db } from "@/db";
import { activities } from "@/db/schema";

export type CompanyActivity = Awaited<ReturnType<typeof listActivitiesForCompany>>[number];

export type ActivityInput = {
  type: "email" | "sms" | "call" | "linkedin" | "note" | "meeting";
  direction: "outbound" | "inbound";
  bodyText?: string | null;
  contactId?: string | null;
};

/** Every logged touch for a company — manual notes/calls today, automated email/SMS in later phases. */
export async function listActivitiesForCompany(companyId: string) {
  return db.query.activities.findMany({
    where: (activity, { eq }) => eq(activity.companyId, companyId),
    with: { contact: true, createdByUser: true },
    orderBy: (activity, { desc }) => desc(activity.occurredAt),
  });
}

export async function createActivity(
  companyId: string,
  input: ActivityInput,
  currentUserId: string
) {
  const [activity] = await db
    .insert(activities)
    .values({
      companyId,
      contactId: input.contactId || null,
      type: input.type,
      direction: input.direction,
      bodyText: input.bodyText || null,
      createdBy: currentUserId,
    })
    .returning();
  return activity;
}
