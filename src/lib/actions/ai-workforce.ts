"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { and, eq } from "drizzle-orm";
import { getAgentDb } from "@/db/agent-workforce/client";
import { managerEscalations, outreachControl } from "@/db/agent-workforce/schema";

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

/**
 * Approve or reject a decision the Sales Manager wants to make but isn't
 * allowed to make alone (its authority policy caps e.g. a discovery volume
 * change at +20%).
 *
 * Approving doesn't act here — it flips the row to "approved" and
 * ai-workforce's manager carries it out on its next cycle, which is also
 * what marks it "executed". The side effects stay in the service that owns
 * those capabilities rather than being re-implemented in this app.
 *
 * Gavin only, same reasoning as the kill switch above: these are precisely
 * the decisions judged too consequential for the manager to take alone, so
 * they shouldn't be approvable by anyone else either.
 */
export async function decideEscalation(escalationId: string, decision: "approved" | "rejected") {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    throw new Error("Only Gavin can approve or reject a Sales Manager decision.");
  }

  const agentDb = getAgentDb();
  // Guarded on status: one already executed (or decided in another tab)
  // must not be flipped into a state that would make it run again.
  await agentDb
    .update(managerEscalations)
    .set({ status: decision, decidedAt: new Date() })
    .where(and(eq(managerEscalations.id, escalationId), eq(managerEscalations.status, "pending")));

  revalidatePath("/ai-workforce");
}
