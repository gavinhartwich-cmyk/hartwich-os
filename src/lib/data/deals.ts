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

/**
 * Auto-advances a deal from "New Lead" to "Contacted" the moment the first
 * outbound email actually sends (see sendApprovedDraft) — the same move a
 * user would make by hand dragging the card over, just automatic. No-ops
 * if the deal isn't currently sitting in "New Lead" (already moved, or
 * dragged somewhere else manually — never yanks a deal backward or out of
 * wherever a human put it), or if no stage named "Contacted" exists (e.g.
 * the pipeline's been renamed) — this is a convenience, never something
 * that should block or fail a send.
 */
export async function advanceDealToContacted(dealId: string): Promise<void> {
  const deal = await db.query.deals.findFirst({
    where: (d, { eq }) => eq(d.id, dealId),
    with: { stage: true },
  });
  if (!deal || deal.stage.name !== "New Lead") return;

  const [contactedStage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.name, "Contacted"))
    .limit(1);
  if (!contactedStage) return;

  await moveDealStage(dealId, contactedStage.id);
}
