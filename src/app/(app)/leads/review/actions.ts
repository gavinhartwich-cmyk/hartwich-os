"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { promoteCompanyToBoard, disqualifyCompany } from "@/lib/data/companies";

export async function promoteToBoardAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const companyId = z.string().uuid().parse(formData.get("companyId"));
  await promoteCompanyToBoard(companyId, user.id);

  revalidatePath("/leads/review");
  revalidatePath("/board");
  revalidatePath("/companies");
}

const DisqualifyFormSchema = z.object({
  companyId: z.string().uuid(),
  reason: z.string().trim().optional(),
});

export async function disqualifyLeadAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = DisqualifyFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return;
  }

  await disqualifyCompany(parsed.data.companyId, parsed.data.reason);

  revalidatePath("/leads/review");
  revalidatePath("/companies");
}
