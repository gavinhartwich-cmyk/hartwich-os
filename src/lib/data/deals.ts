import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, pipelineStages } from "@/db/schema";

export type BoardDeal = Awaited<ReturnType<typeof listDealsForBoard>>[number];

/** Everything the Kanban board needs to render a card, in one query. */
export async function listDealsForBoard() {
  return db.query.deals.findMany({
    with: {
      company: true,
      stage: true,
      owner: true,
    },
    orderBy: (deal, { asc }) => asc(deal.stageEnteredAt),
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
