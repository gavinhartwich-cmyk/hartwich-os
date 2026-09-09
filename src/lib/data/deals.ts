import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deals, pipelineStages } from "@/db/schema";

export type BoardDeal = Awaited<ReturnType<typeof listDealsForBoard>>[number];

/**
 * Everything the Kanban board needs to render a card, in one query.
 *
 * Sort (v1.1): a deal the email cadence has flagged for review (bounced,
 * or crossed its next 3/6/9-day no-reply threshold — see
 * src/lib/emails/cadence.ts, src/lib/emails/sync-replies.ts) sorts first
 * within its column, oldest flag first, ahead of every unflagged deal —
 * this is what "moves it to the top" means concretely. Unflagged deals keep
 * the original stageEnteredAt-ascending order; sending the reviewed
 * follow-up clears the flag and resets stageEnteredAt (send-approved-draft.ts),
 * which is what sends it back to the bottom afterward.
 */
export async function listDealsForBoard() {
  return db.query.deals.findMany({
    with: {
      company: true,
      stage: true,
      owner: true,
    },
    orderBy: [
      sql`${deals.followUpFlaggedAt} is null`,
      asc(deals.followUpFlaggedAt),
      asc(deals.stageEnteredAt),
    ],
  });
}

export async function listDealsForCompany(companyId: string) {
  return db.query.deals.findMany({
    where: (deal, { eq }) => eq(deal.companyId, companyId),
    with: { stage: true, owner: true },
    orderBy: (deal, { desc }) => desc(deal.createdAt),
  });
}

/**
 * For re-engaging a company after Won/Lost, or adding a second deal —
 * the manual counterpart to createCompanyWithInitialDeal.
 */
export async function createDeal(input: { companyId: string; ownerUserId: string }) {
  const [firstStage] = await db
    .select()
    .from(pipelineStages)
    .orderBy(asc(pipelineStages.position))
    .limit(1);

  if (!firstStage) {
    throw new Error("No pipeline stages exist yet — run `npm run db:seed`.");
  }

  const [deal] = await db
    .insert(deals)
    .values({
      companyId: input.companyId,
      stageId: firstStage.id,
      ownerUserId: input.ownerUserId,
    })
    .returning();
  return deal;
}

/** Moves a deal to a new stage and stamps stageEnteredAt — the one thing that powers time-in-stage reporting later (architecture doc §6). */
export async function moveDealStage(dealId: string, stageId: string) {
  const [deal] = await db
    .update(deals)
    .set({ stageId, stageEnteredAt: new Date(), updatedAt: new Date() })
    .where(eq(deals.id, dealId))
    .returning();
  return deal;
}
