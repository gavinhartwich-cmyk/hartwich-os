import "server-only";
import { db } from "@/db";
import { deals, emailDrafts } from "@/db/schema";
import { and, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { findStageByName, PIPELINE_STAGE_NAMES } from "@/lib/data/pipeline-stages";
import { draftFollowUpEmail } from "@/lib/ai/draft-outreach";
import { notifyOps } from "@/lib/notifications/notify";
import { companyUrl } from "@/lib/utils/app-url";

export type CadenceResult = {
  flagged: number;
  errors: string[];
};

/** 3, 6, 9 days — the automated nudge schedule from the original ask ("intervals of 3 days up to 9 days total"). */
const FOLLOW_UP_MAX_COUNT = 3;
const FOLLOW_UP_INTERVAL_DAYS = 3;

function daysSince(at: Date): number {
  return (Date.now() - at.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * The v1.1 follow-up cadence: for every deal sitting in Contacted with no
 * reply since the last email went out, checks whether enough days have
 * passed for the next nudge (day 3, then 6, then 9 — capped at 3 total) and,
 * if so, flags it (surfaces it to the top of the board — see the sort in
 * listDealsForBoard) and drafts the follow-up for review.
 *
 * Deliberately doesn't separately check for a bounce — handleBounceNotification
 * (sync-replies.ts) already sets followUpFlaggedAt on a bounced deal, and the
 * `followUpFlaggedAt IS NULL` filter below excludes it the same way it
 * excludes anything else already surfaced for review.
 *
 * "Opened but not replied" isn't a separate trigger from "delivered but not
 * replied" — both are just states of the same not-yet-replied email, and
 * this same day-3/6/9 check covers either one uniformly (wasOpened just
 * changes the follow-up's tone, see draftFollowUpEmail).
 */
export async function runEmailCadence(): Promise<CadenceResult> {
  const errors: string[] = [];
  let flagged = 0;

  const contactedStage = await findStageByName(PIPELINE_STAGE_NAMES.CONTACTED);
  if (!contactedStage) {
    return { flagged: 0, errors: ["No 'Contacted' pipeline stage found — run npm run db:seed."] };
  }

  const candidates = await db.query.deals.findMany({
    where: and(
      eq(deals.stageId, contactedStage.id),
      isNotNull(deals.lastOutboundEmailAt),
      isNull(deals.followUpFlaggedAt),
      lt(deals.followUpCount, FOLLOW_UP_MAX_COUNT)
    ),
    with: { company: true },
  });

  for (const deal of candidates) {
    try {
      // Reply already came in more recently than the last send — not a
      // cadence candidate (sync-replies.ts should have moved this to
      // Engaged already, but don't nudge it in the gap if that hasn't run yet).
      if (deal.lastInboundEmailAt && deal.lastInboundEmailAt >= deal.lastOutboundEmailAt!) continue;

      const threshold = (deal.followUpCount + 1) * FOLLOW_UP_INTERVAL_DAYS;
      if (daysSince(deal.lastOutboundEmailAt!) < threshold) continue;

      // The actual recipient + content of the last email sent for this deal
      // — a follow-up needs both to reference it and to know who to send to
      // (not necessarily the company's "primary" contact; whoever the
      // original outreach actually went to).
      const lastOutbound = await db.query.activities.findFirst({
        where: (a, { eq, and: andOp }) =>
          andOp(eq(a.dealId, deal.id), eq(a.type, "email"), eq(a.direction, "outbound")),
        orderBy: (a, { desc }) => desc(a.occurredAt),
        with: { contact: true, message: true },
      });
      if (!lastOutbound?.contact?.email || !lastOutbound.message) continue;

      await db
        .update(deals)
        .set({ followUpFlaggedAt: new Date(), updatedAt: new Date() })
        .where(eq(deals.id, deal.id));

      const followUpNumber = (deal.followUpCount + 1) as 1 | 2 | 3;
      const draft = await draftFollowUpEmail({
        company: deal.company,
        contact: lastOutbound.contact,
        originalSubject: lastOutbound.message.subject || "",
        originalBody: lastOutbound.message.body || "",
        followUpNumber,
        wasOpened: !!lastOutbound.message.openedAt,
        yourName: "Gavin Hartwich",
        yourCompany: "Hartwich Labs",
      });

      await db.insert(emailDrafts).values({
        companyId: deal.companyId,
        contactId: lastOutbound.contact.id,
        dealId: deal.id,
        subject: draft.subject,
        body: draft.body,
        status: "pending_review",
        kind: "follow_up",
        aiRunId: draft.aiRunId,
      });

      flagged++;

      const link = companyUrl(deal.companyId);
      await notifyOps(
        `${deal.company.name}: follow-up ${followUpNumber} of ${FOLLOW_UP_MAX_COUNT} ready`,
        `No reply yet from ${deal.company.name} (${daysSince(deal.lastOutboundEmailAt!).toFixed(1)} days since last send). ` +
          `Follow-up #${followUpNumber} has been drafted and the deal moved to the top of Contacted for review.` +
          (link ? `\n\n${link}` : "")
      );
    } catch (err) {
      errors.push(`Deal ${deal.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { flagged, errors };
}
