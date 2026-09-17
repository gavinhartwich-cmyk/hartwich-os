"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { addLinkedInContact, logLinkedInFollowUp } from "@/lib/data/linkedin-contacts";
import { normalizeLinkedInUrl } from "@/lib/linkedin/url";

const AddSchema = z.object({
  linkedinUrl: z.string().trim().min(1),
  name: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function addLinkedInContactAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/login");

  const parsed = AddSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/linkedin?error=invalid");

  const normalized = normalizeLinkedInUrl(parsed.data.linkedinUrl);
  if (!normalized) redirect("/linkedin?error=url");

  try {
    await addLinkedInContact({ ...parsed.data, linkedinUrl: normalized }, user.id);
  } catch {
    // Almost certainly the unique constraint on linkedin_url — already tracked.
    redirect("/linkedin?error=duplicate");
  }

  revalidatePath("/linkedin");
  redirect("/linkedin?added=1");
}

/** Called directly from the due-list's "Mark followed up" button (a client component, like board's moveDealAction) — not a form, no note. */
export async function markFollowedUpAction(contactId: string) {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("Not signed in.");

  await logLinkedInFollowUp(contactId);
  revalidatePath("/linkedin");
}
