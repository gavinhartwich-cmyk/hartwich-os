import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { deals, pipelineStages } from "@/db/schema";

export type BoardDeal = Awaited<ReturnType<typeof listDealsForBoard>>[number];

/**
 * Where a deal's outreach actually stands, so a card can say it outright
 * instead of making you open each one to find out.
 *
 * Ordered by which wins when several are true at once: a reply makes the
 * delivery state irrelevant, and a bounce matters more than the bare fact
 * that something was sent.
 *
 * Deliberately no "opened" state. The tracking-pixel route exists, but
 * `messages.opened_at` has never been populated (0 rows of 22 on
 * 2026-09-10), so an "opened" badge could never appear — and its absence
 * would read as "they didn't open it" when the truth is "we aren't
 * measuring that".
 */
export type OutreachState = "replied" | "bounced" | "delivered" | "sent" | "none";

export type DealOutreach = { state: OutreachState; at: Date | null };

/**
 * One aggregate query for the whole board rather than a lookup per card —
 * this runs on every board render.
 *
 * "Replied" requires an inbound activity that has a real `messages` row
 * behind it. An inbound activity on its own is NOT a reply: the bounce
 * handler writes inbound activities too ("Original email to X bounced.
 * Re-ran website research but found no other contact address — needs
 * manual research"), and on 2026-09-10 every single inbound activity in
 * the database was one of those. Counting them as replies labelled two
 * bounced deals "Replied — this one needs you", which is the opposite of
 * the truth and exactly the wasted click this badge exists to prevent.
 * Only a reply synced from Gmail creates a message row.
 */
async function getOutreachByDeal(): Promise<Map<string, DealOutreach>> {
  const rows = await db.execute<{
    deal_id: string;
    last_outbound_at: string | null;
    last_inbound_at: string | null;
    last_delivered_at: string | null;
    last_bounced_at: string | null;
  }>(sql`
    select
      a.deal_id,
      max(a.occurred_at) filter (where a.direction = 'outbound') as last_outbound_at,
      max(a.occurred_at) filter (where a.direction = 'inbound' and m.id is not null) as last_inbound_at,
      max(a.occurred_at) filter (where m.status = 'delivered')   as last_delivered_at,
      max(a.occurred_at) filter (where m.status = 'bounced')     as last_bounced_at
    from activities a
    left join messages m on m.activity_id = a.id
    where a.deal_id is not null
    group by a.deal_id
  `);

  const byDeal = new Map<string, DealOutreach>();
  for (const row of rows) {
    // postgres.js hands aggregates back as strings — coerce rather than
    // letting a string masquerade as a Date downstream.
    const inboundAt = row.last_inbound_at ? new Date(row.last_inbound_at) : null;
    const outboundAt = row.last_outbound_at ? new Date(row.last_outbound_at) : null;
    const deliveredAt = row.last_delivered_at ? new Date(row.last_delivered_at) : null;
    const bouncedAt = row.last_bounced_at ? new Date(row.last_bounced_at) : null;

    // A bounce isn't cancelled by simply sending again — the address stays
    // bad until something actually gets delivered. Keying off the newest
    // message's status alone hid two known-bad addresses behind "Sent"
    // (2026-09-10), which is exactly the wasted click this badge exists to
    // prevent. Only a delivery *after* the bounce clears it.
    const bounceStillStands = bouncedAt && (!deliveredAt || bouncedAt > deliveredAt);

    if (inboundAt) byDeal.set(row.deal_id, { state: "replied", at: inboundAt });
    else if (bounceStillStands) byDeal.set(row.deal_id, { state: "bounced", at: bouncedAt });
    else if (deliveredAt) byDeal.set(row.deal_id, { state: "delivered", at: deliveredAt });
    else if (outboundAt) byDeal.set(row.deal_id, { state: "sent", at: outboundAt });
  }
  return byDeal;
}

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
  const [rows, outreachByDeal] = await Promise.all([
    db.query.deals.findMany({
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
    }),
    getOutreachByDeal(),
  ]);

  return rows.map((deal) => ({
    ...deal,
    outreach: outreachByDeal.get(deal.id) ?? ({ state: "none", at: null } as DealOutreach),
  }));
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
 * Auto-advances a deal to "Contacted" the moment the first outbound email
 * actually sends (see sendApprovedDraft) — the same move a user would make
 * by hand dragging the card over, just automatic.
 *
 * Matches by *position* against the "Contacted" stage, not by an exact
 * "New Lead" name check (an earlier version required that and never fired
 * for anyone whose pipeline has stages ahead of "Contacted" that aren't
 * literally named "New Lead" — e.g. a "Researching" or "Qualified" column
 * before it). Any stage earlier than "Contacted" advances; a deal already
 * at "Contacted" or past it (Engaged, Won, ...) is left alone — this only
 * ever moves a card forward, never backward or out of wherever a human
 * put it. No-ops (doesn't throw) if there's no stage named "Contacted" —
 * a convenience, never something that should block or fail a send.
 */
export async function advanceDealToContacted(dealId: string): Promise<void> {
  const deal = await db.query.deals.findFirst({
    where: (d, { eq }) => eq(d.id, dealId),
    with: { stage: true },
  });
  if (!deal) return;

  const [contactedStage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.name, "Contacted"))
    .limit(1);
  if (!contactedStage) return;

  if (deal.stage.position >= contactedStage.position) return;

  await moveDealStage(dealId, contactedStage.id);
}
