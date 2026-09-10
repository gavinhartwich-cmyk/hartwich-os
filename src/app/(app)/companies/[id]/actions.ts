"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { deleteCompany, getCompanyById, updateCompany, websiteDomain } from "@/lib/data/companies";
import { createDeal } from "@/lib/data/deals";
import {
  createContact,
  deleteContact,
  listContactsForCompany,
  setPrimaryContact,
} from "@/lib/data/contacts";
import { createActivity } from "@/lib/data/activities";
import { findOwnerContact } from "@/lib/integrations/apollo";
import { findDecisionMakerViaSearch } from "@/lib/ai/find-decision-maker";

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

export async function deleteCompanyAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = z.string().uuid().parse(formData.get("companyId"));
  await deleteCompany(companyId);
  revalidatePath("/companies");
  revalidatePath("/board");
  redirect("/companies");
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
 * "Find owner" button on the company page (free path) — a Tavily web
 * search scoped to bbb.org + linkedin.com, read by Groq for a name (see
 * findDecisionMakerViaSearch). This is the automated stand-in for
 * manually checking BBB/LinkedIn: same sources, no scraping, no paid API.
 * Works without a website (unlike the Apollo path below, which needs a
 * domain to match on) since it searches by company name/location instead.
 */
export async function findOwnerViaSearchAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const company = await getCompanyById(companyId);
  if (!company) {
    redirect(`/companies/${companyId}?ownerLookup=error`);
  }

  const location = [company.city, company.state].filter(Boolean).join(", ") || null;
  const dm = await findDecisionMakerViaSearch({ companyName: company.name, location });
  if (!dm) {
    redirect(`/companies/${companyId}?ownerLookup=not_found`);
  }

  const existingContacts = await listContactsForCompany(companyId);
  const alreadyHave = existingContacts.some((c) => c.name?.toLowerCase() === dm.name.toLowerCase());

  if (!alreadyHave) {
    await createContact(companyId, {
      name: dm.name,
      title: dm.title,
      linkedinUrl: dm.linkedinUrl,
      isPrimary: existingContacts.length === 0,
      source: "google_places", // "found during automated research," same label the site-scrape path uses
    });
  }

  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}?ownerLookup=${alreadyHave ? "already_have" : "found"}`);
}

/**
 * "Find owner via Apollo" button (paid path) — looks up the likely
 * owner/decision-maker via Apollo (LinkedIn-sourced contact data; see the
 * comment on findOwnerContact for why this goes through Apollo rather than
 * a direct LinkedIn scrape) and, if found, adds them as a contact. A
 * manual, per-company action rather than something run automatically for
 * every lead — Apollo enrichment spends a paid credit per lookup, unlike
 * the free Tavily/Groq path above.
 */
export async function findOwnerViaApolloAction(formData: FormData) {
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
