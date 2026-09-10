"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { getAgentDb } from "@/db/agent-workforce/client";
import { outreachControl } from "@/db/agent-workforce/schema";

/**
 * The kill switch (ai-workforce's SPEC.md §57: "stop this campaign"),
 * flipped from here rather than ai-workforce's own CLI
 * (`npm run outreach:control`) — same underlying `outreach_control` row,
 * checked by that repo's send-guard before every autonomous send. Gavin
 * only, same precedent as the booking-admin split elsewhere in this app:
 * pausing every autonomous send for the whole business is exactly the
 * kind of sensitive, business-wide action that split already exists for.
 */
export async function setOutreachPaused(paused: boolean, reason: string | null) {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    throw new Error("Only Gavin can pause or resume autonomous outreach.");
  }

  const agentDb = getAgentDb();
  await agentDb
    .insert(outreachControl)
    .values({ id: "default", sendingPaused: paused, pausedReason: paused ? reason : null })
    .onConflictDoUpdate({
      target: outreachControl.id,
      set: { sendingPaused: paused, pausedReason: paused ? reason : null, updatedAt: new Date() },
    });

  revalidatePath("/ai-workforce");
}
