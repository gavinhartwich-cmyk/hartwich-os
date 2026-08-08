"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { createCompanyWithInitialDeal } from "@/lib/data/companies";

const CompanyFormSchema = z.object({
  name: z.string().trim().min(1),
  website: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  addressLine: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function createCompanyAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = CompanyFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/companies/new?error=invalid");
  }

  const { company } = await createCompanyWithInitialDeal(parsed.data, user.id);
  redirect(`/companies/${company.id}`);
}
