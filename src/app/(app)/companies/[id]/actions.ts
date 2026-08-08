"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { updateCompany } from "@/lib/data/companies";
import { createDeal } from "@/lib/data/deals";

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
