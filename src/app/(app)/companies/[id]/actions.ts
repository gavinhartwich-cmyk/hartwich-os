"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { getCompanyById, updateCompany, websiteDomain } from "@/lib/data/companies";
import { createDeal } from "@/lib/data/deals";
import {
  createContact,
  deleteContact,
  listContactsForCompany,
  setPrimaryContact,
} from "@/lib/data/contacts";
import { createActivity } from "@/lib/data/activities";
import { findOwnerContact } from "@/lib/integrations/apollo";

const CompanyFormSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  website: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  addressLine: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function updateCompanyAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = CompanyFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return;
  }

  const { id, ...input } = parsed.data;
  await updateCompany(id, input);
  revalidatePath(`/companies/${id}`);
  revalidatePath("/companies");
  revalidatePath("/board");
}

export async function createDealAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = z.string().uuid().parse(formData.get("companyId"));
  await createDeal({ companyId, ownerUserId: user.id });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/board");
}

const ContactFormSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().optional(),
  title: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  linkedinUrl: z.string().trim().optional(),
  isPrimary: z.string().optional(), // checkbox: "on" when checked, absent otherwise
});

export async function createContactAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = ContactFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return;
  }

  const { companyId, isPrimary, ...input } = parsed.data;
  await createContact(companyId, { ...input, isPrimary: isPrimary === "on" });
  revalidatePath(`/companies/${companyId}`);
}

export async function setPrimaryContactAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const contactId = z.string().uuid().parse(formData.get("contactId"));
  await setPrimaryContact(companyId, contactId);
  revalidatePath(`/companies/${companyId}`);
}

export async function deleteContactAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const contactId = z.string().uuid().parse(formData.get("contactId"));
  await deleteContact(contactId);
  revalidatePath(`/companies/${companyId}`);
}

/**
 * "Find owner" button on the company page — looks up the likely
 * owner/decision-maker via Apollo (LinkedIn-sourced contact data; see the
 * comment on findOwnerContact for why this goes through Apollo rather than
 * a direct LinkedIn scrape) and, if found, adds them as a contact. A
 * manual, per-company action rather than something run automatically for
 * every lead — Apollo enrichment spends a paid credit per lookup, unlike
 * the free-tier Groq calls the rest of enrichment relies on.
 */
export async function findOwnerAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const company = await getCompanyById(companyId);
  if (!company) {
    redirect(`/companies/${companyId}?ownerLookup=error`);
  }

  const domain = websiteDomain(company.website);
  if (!domain) {
    redirect(`/companies/${companyId}?ownerLookup=no_website`);
  }

  const owner = await findOwnerContact(domain);
  if (!owner) {
    redirect(`/companies/${companyId}?ownerLookup=not_found`);
  }

  const existingContacts = await listContactsForCompany(companyId);
  const alreadyHave = existingContacts.some(
    (c) => c.name?.toLowerCase() === owner.name.toLowerCase()
  );

  if (!alreadyHave) {
    await createContact(companyId, {
      name: owner.name,
      title: owner.title,
      email: owner.email,
      linkedinUrl: owner.linkedinUrl,
      isPrimary: existingContacts.length === 0,
      source: "apollo",
    });
  }

  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}?ownerLookup=${alreadyHave ? "already_have" : "found"}`);
}

const ActivityFormSchema = z.object({
  companyId: z.string().uuid(),
  type: z.enum(["email", "sms", "call", "linkedin", "note", "meeting"]),
  direction: z.enum(["outbound", "inbound"]),
  bodyText: z.string().trim().optional(),
  contactId: z.union([z.literal(""), z.string().uuid()]).optional(),
});

export async function createActivityAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = ActivityFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return;
  }

  const { companyId, contactId, ...input } = parsed.data;
  await createActivity(companyId, { ...input, contactId: contactId || null }, user.id);
  revalidatePath(`/companies/${companyId}`);
}
