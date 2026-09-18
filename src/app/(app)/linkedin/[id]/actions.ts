"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import {
  deleteLinkedInContact,
  deleteLinkedInEvent,
  logLinkedInFollowUp,
  setLinkedInContactActive,
  updateLinkedInContact,
} from "@/lib/data/linkedin-contacts";

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function updateContactAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const parsed = UpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await updateLinkedInContact(parsed.data.id, {
    name: parsed.data.name || null,
    companyName: parsed.data.companyName || null,
    notes: parsed.data.notes || null,
  });
  revalidatePath(`/linkedin/${parsed.data.id}`);
  revalidatePath("/linkedin");
}

const LOG_EVENT_TYPES = [
  "message_sent",
  "follow_up_sent",
  "reply_received",
  "meeting_booked",
  "not_interested",
  "no_response",
] as const;

const LogFollowUpSchema = z.object({
  contactId: z.string().uuid(),
  type: z.enum(LOG_EVENT_TYPES).default("follow_up_sent"),
  note: z.string().trim().optional(),
  // datetime-local input value ("2026-09-17T14:34") or empty — empty means "now", same default logLinkedInFollowUp itself falls back to.
  occurredAt: z.string().trim().optional(),
});

export async function logFollowUpAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const parsed = LogFollowUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined;
  await logLinkedInFollowUp(parsed.data.contactId, parsed.data.type, parsed.data.note, occurredAt);
  revalidatePath(`/linkedin/${parsed.data.contactId}`);
  revalidatePath("/linkedin");
}

export async function deleteEventAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const contactId = formData.get("contactId") as string;
  await deleteLinkedInEvent(eventId);
  revalidatePath(`/linkedin/${contactId}`);
  revalidatePath("/linkedin");
}

/** Toggled from a client component with the current state, same pattern as board's moveDealAction. */
export async function toggleActiveAction(contactId: string, active: boolean) {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in.");

  await setLinkedInContactActive(contactId, active);
  revalidatePath(`/linkedin/${contactId}`);
  revalidatePath("/linkedin");
}

export async function deleteContactAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const id = formData.get("id") as string;
  await deleteLinkedInContact(id);
  revalidatePath("/linkedin");
  redirect("/linkedin");
}
