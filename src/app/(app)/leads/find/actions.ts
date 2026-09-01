"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { discoverLeads } from "@/lib/actions/discover-leads";

const FindLeadsFormSchema = z.object({
  area: z.string().trim().min(1),
  keyword: z.string().trim().optional(),
  targetCount: z.coerce.number().int().min(1).max(200).optional(),
});

export async function triggerLeadDiscoveryAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = FindLeadsFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/leads/find?error=invalid");
  }

  // Start lead discovery (returns immediately, processes in background)
  const { runId } = await discoverLeads({
    area: parsed.data.area,
    keyword: parsed.data.keyword || undefined,
    targetCount: parsed.data.targetCount,
    requestedByUserId: user.id,
  });

  redirect(`/leads/review?runId=${runId}`);
}
