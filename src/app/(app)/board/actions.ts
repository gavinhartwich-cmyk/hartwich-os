"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { moveDealStage } from "@/lib/data/deals";

export async function moveDealAction(dealId: string, stageId: string) {
  const user = await getCurrentAppUser();
  if (!user) {
    throw new Error("Not signed in.");
  }

  await moveDealStage(dealId, stageId);
  revalidatePath("/board");
}
