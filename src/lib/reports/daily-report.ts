import "server-only";
import { and, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  aiRuns,
  bookings,
  companies,
  deals,
  emailDrafts,
  linkedinContactEvents,
  messages,
  pipelineStages,
  tasks,
  users,
} from "@/db/schema";
import { listLinkedInContacts } from "@/lib/data/linkedin-contacts";
import { localDateKey, utcToLocalParts, zonedTimeToUtc } from "@/lib/booking/timezone";

/**
 * The daily effort report: what each person did, what the AI did, how the
 * pipeline moved, and what needs a human's attention — for one calendar day.
 *
 * Every number here is counted straight out of Postgres. No model is asked
 * what happened (Gavin: don't burn Groq tokens on arithmetic) — an AI call, if
 * one is ever added, belongs on top of this output to narrate it, never to
 * produce it. That keeps the report reproducible: running it twice for the
 * same past day gives the same answer.
 */

// Matches the booking default and the warm-up scheduler. A "day" has to mean
// the same thing everywhere or the report silently disagrees with the board.
export const REPORT_TIMEZONE = "America/Winnipeg";

export type PersonEffort = {
  userId: string;
  name: string;
  emailsSentByHand: number;
  aiDraftsApproved: number;
  draftsRejected: number;
  callsLogged: number;
  meetingsLogged: number;
  notesLogged: number;
  linkedinMessagesSent: number;
  linkedinFollowUpsSent: number;
  linkedinRepliesLogged: number;
  linkedinMeetingsBooked: number;
  tasksCompleted: number;
  /** Outbound work only — replies and notes logged aren't effort spent reaching out. */
  totalTouches: number;
};

export type AiEffort = {
  leadsDiscovered: number;
  draftsGenerated: number;
  emailsSentAutonomously: number;
  repliesProcessed: number;
  runsSucceeded: number;
  runsFailed: number;
  tokensUsed: number;
  costUsd: number;
};

export type Scorecard = {
  newLeads: number;
  emailsOut: number;
  emailsOpened: number;
  replies: number;
  bounces: number;
  /** null rather than 0 when nothing went out — "no data" isn't "a perfect 0%". */
  bounceRatePct: number | null;
  replyRatePct: number | null;
  meetingsBooked: number;
  dealsWon: number;
  dealsLost: number;
};

export type AttentionItem = {
  severity: "high" | "medium" | "low";
  code: string;
  title: string;
  detail: string;
};

export type DailyReport = {
  date: string;
  timezone: string;
  range: { from: Date; to: Date };
  isWeekend: boolean;
  people: PersonEffort[];
  unattributed: { activities: number; linkedinEvents: number };
  ai: AiEffort;
  scorecard: Scorecard;
  attention: AttentionItem[];
  generatedAt: Date;
};

/** Local midnight-to-midnight for `dateKey` ("YYYY-MM-DD"), as UTC instants. */
export function dayBounds(dateKey: string, timeZone = REPORT_TIMEZONE) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const from = zonedTimeToUtc(year, month, day, 0, 0, timeZone);
  const to = zonedTimeToUtc(year, month, day + 1, 0, 0, timeZone);
  return { from, to };
}

export function todayKey(timeZone = REPORT_TIMEZONE): string {
  return localDateKey(utcToLocalParts(new Date(), timeZone));
}

function ratePct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function generateDailyReport(
  dateKey: string = todayKey(),
  timeZone = REPORT_TIMEZONE
): Promise<DailyReport> {
  const { from, to } = dayBounds(dateKey, timeZone);
  const inRange = (column: Parameters<typeof gte>[0]) =>
    and(gte(column, from), lt(column, to));

  const [
    appUsers,
    activityRows,
    linkedinRows,
    taskRows,
    approvalRows,
    rejectionRows,
    unattributedRow,
    aiRow,
    aiRunRow,
    scorecardRow,
    stageRows,
    pendingDraftRow,
    overdueTaskRow,
    flaggedDealRow,
    linkedinContacts,
  ] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),

    db
      .select({
        userId: activities.createdBy,
        emailsSentByHand: sql<number>`count(*) filter (where ${activities.type} = 'email' and ${activities.direction} = 'outbound' and ${activities.aiGenerated} = false)::int`,
        callsLogged: sql<number>`count(*) filter (where ${activities.type} = 'call')::int`,
        meetingsLogged: sql<number>`count(*) filter (where ${activities.type} = 'meeting')::int`,
        notesLogged: sql<number>`count(*) filter (where ${activities.type} = 'note')::int`,
      })
      .from(activities)
      .where(and(inRange(activities.occurredAt), isNotNull(activities.createdBy)))
      .groupBy(activities.createdBy),

    db
      .select({
        userId: linkedinContactEvents.createdBy,
        messagesSent: sql<number>`count(*) filter (where ${linkedinContactEvents.type} = 'message_sent')::int`,
        followUpsSent: sql<number>`count(*) filter (where ${linkedinContactEvents.type} = 'follow_up_sent')::int`,
        repliesLogged: sql<number>`count(*) filter (where ${linkedinContactEvents.type} = 'reply_received')::int`,
        meetingsBooked: sql<number>`count(*) filter (where ${linkedinContactEvents.type} = 'meeting_booked')::int`,
      })
      .from(linkedinContactEvents)
      .where(
        and(inRange(linkedinContactEvents.occurredAt), isNotNull(linkedinContactEvents.createdBy))
      )
      .groupBy(linkedinContactEvents.createdBy),

    db
      .select({ userId: tasks.assignedTo, completed: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(inRange(tasks.completedAt), isNotNull(tasks.assignedTo)))
      .groupBy(tasks.assignedTo),

    db
      .select({ userId: emailDrafts.approvedBy, approved: sql<number>`count(*)::int` })
      .from(emailDrafts)
      .where(and(inRange(emailDrafts.approvedAt), isNotNull(emailDrafts.approvedBy)))
      .groupBy(emailDrafts.approvedBy),

    db
      .select({ userId: emailDrafts.rejectedBy, rejected: sql<number>`count(*)::int` })
      .from(emailDrafts)
      .where(and(inRange(emailDrafts.rejectedAt), isNotNull(emailDrafts.rejectedBy)))
      .groupBy(emailDrafts.rejectedBy),

    // Human work nobody can be credited for — a data-quality signal, not effort.
    db
      .select({
        activities: sql<number>`count(*) filter (where ${activities.aiGenerated} = false)::int`,
      })
      .from(activities)
      .where(and(inRange(activities.occurredAt), isNull(activities.createdBy))),

    db
      .select({
        leadsDiscovered: sql<number>`count(*) filter (where ${companies.aiWorkforceCreated} = true)::int`,
        newLeads: sql<number>`count(*)::int`,
      })
      .from(companies)
      .where(inRange(companies.createdAt)),

    db
      .select({
        succeeded: sql<number>`count(*) filter (where ${aiRuns.status} = 'succeeded')::int`,
        failed: sql<number>`count(*) filter (where ${aiRuns.status} = 'failed')::int`,
        tokens: sql<number>`coalesce(sum(${aiRuns.tokensUsed}), 0)::int`,
        cost: sql<number>`coalesce(sum(${aiRuns.costEstimateUsd}), 0)::float8`,
      })
      .from(aiRuns)
      .where(inRange(aiRuns.createdAt)),

    db
      .select({
        emailsOut: sql<number>`count(*) filter (where ${messages.provider} = 'gmail' and ${messages.toAddress} is not null)::int`,
        bounces: sql<number>`count(*) filter (where ${messages.bouncedAt} is not null)::int`,
      })
      .from(messages)
      .where(inRange(messages.createdAt)),

    db
      .select({
        name: pipelineStages.name,
        isWon: pipelineStages.isWon,
        isLost: pipelineStages.isLost,
        count: sql<number>`count(*)::int`,
      })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(
        and(
          inRange(deals.stageEnteredAt),
          or(eq(pipelineStages.isWon, true), eq(pipelineStages.isLost, true))
        )
      )
      .groupBy(pipelineStages.name, pipelineStages.isWon, pipelineStages.isLost),

    db
      .select({ pending: sql<number>`count(*)::int` })
      .from(emailDrafts)
      .where(
        and(
          eq(emailDrafts.status, "pending_review"),
          lt(emailDrafts.createdAt, new Date(to.getTime() - 24 * 60 * 60 * 1000))
        )
      ),

    db
      .select({ overdue: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(isNull(tasks.completedAt), lt(tasks.dueDate, to))),

    db
      .select({ flagged: sql<number>`count(*)::int` })
      .from(deals)
      .where(isNotNull(deals.followUpFlaggedAt)),

    listLinkedInContacts(),
  ]);

  // Counted separately from the message table: an inbound email activity is
  // the reply as the pipeline understands it, whatever its delivery record.
  const [engagementRow] = await db
    .select({
      replies: sql<number>`count(*) filter (where ${activities.direction} = 'inbound' and ${activities.type} = 'email')::int`,
      aiEmailsSent: sql<number>`count(*) filter (where ${activities.direction} = 'outbound' and ${activities.type} = 'email' and ${activities.aiGenerated} = true)::int`,
    })
    .from(activities)
    .where(inRange(activities.occurredAt));

  const [openedRow] = await db
    .select({ opened: sql<number>`count(*)::int` })
    .from(messages)
    .where(inRange(messages.openedAt));

  const [draftsGeneratedRow] = await db
    .select({ generated: sql<number>`count(*)::int` })
    .from(emailDrafts)
    .where(and(inRange(emailDrafts.createdAt), isNotNull(emailDrafts.aiRunId)));

  const [bookingRow] = await db
    .select({ booked: sql<number>`count(*)::int` })
    .from(bookings)
    .where(inRange(bookings.createdAt));

  const [unattributedLinkedinRow] = await db
    .select({ events: sql<number>`count(*)::int` })
    .from(linkedinContactEvents)
    .where(and(inRange(linkedinContactEvents.occurredAt), isNull(linkedinContactEvents.createdBy)));

  const byUser = new Map<string, PersonEffort>(
    appUsers.map((u) => [
      u.id,
      {
        userId: u.id,
        name: u.name,
        emailsSentByHand: 0,
        aiDraftsApproved: 0,
        draftsRejected: 0,
        callsLogged: 0,
        meetingsLogged: 0,
        notesLogged: 0,
        linkedinMessagesSent: 0,
        linkedinFollowUpsSent: 0,
        linkedinRepliesLogged: 0,
        linkedinMeetingsBooked: 0,
        tasksCompleted: 0,
        totalTouches: 0,
      },
    ])
  );

  for (const row of activityRows) {
    const person = row.userId && byUser.get(row.userId);
    if (!person) continue;
    person.emailsSentByHand = row.emailsSentByHand;
    person.callsLogged = row.callsLogged;
    person.meetingsLogged = row.meetingsLogged;
    person.notesLogged = row.notesLogged;
  }
  for (const row of linkedinRows) {
    const person = row.userId && byUser.get(row.userId);
    if (!person) continue;
    person.linkedinMessagesSent = row.messagesSent;
    person.linkedinFollowUpsSent = row.followUpsSent;
    person.linkedinRepliesLogged = row.repliesLogged;
    person.linkedinMeetingsBooked = row.meetingsBooked;
  }
  for (const row of taskRows) {
    const person = row.userId && byUser.get(row.userId);
    if (person) person.tasksCompleted = row.completed;
  }
  for (const row of approvalRows) {
    const person = row.userId && byUser.get(row.userId);
    if (person) person.aiDraftsApproved = row.approved;
  }
  for (const row of rejectionRows) {
    const person = row.userId && byUser.get(row.userId);
    if (person) person.draftsRejected = row.rejected;
  }

  const people = [...byUser.values()];
  for (const person of people) {
    person.totalTouches =
      person.emailsSentByHand +
      person.aiDraftsApproved +
      person.callsLogged +
      person.meetingsLogged +
      person.linkedinMessagesSent +
      person.linkedinFollowUpsSent;
  }
  people.sort((a, b) => b.totalTouches - a.totalTouches || a.name.localeCompare(b.name));

  const emailsOut = scorecardRow[0].emailsOut;
  const replies = engagementRow.replies;
  const bounces = scorecardRow[0].bounces;

  const scorecard: Scorecard = {
    newLeads: aiRow[0].newLeads,
    emailsOut,
    emailsOpened: openedRow.opened,
    replies,
    bounces,
    bounceRatePct: ratePct(bounces, emailsOut),
    replyRatePct: ratePct(replies, emailsOut),
    meetingsBooked: bookingRow.booked,
    dealsWon: stageRows.filter((s) => s.isWon).reduce((n, s) => n + s.count, 0),
    dealsLost: stageRows.filter((s) => s.isLost).reduce((n, s) => n + s.count, 0),
  };

  const ai: AiEffort = {
    leadsDiscovered: aiRow[0].leadsDiscovered,
    draftsGenerated: draftsGeneratedRow.generated,
    emailsSentAutonomously: engagementRow.aiEmailsSent,
    repliesProcessed: replies,
    runsSucceeded: aiRunRow[0].succeeded,
    runsFailed: aiRunRow[0].failed,
    tokensUsed: aiRunRow[0].tokens,
    costUsd: Math.round(aiRunRow[0].cost * 100) / 100,
  };

  const weekday = utcToLocalParts(from, timeZone).weekday;
  const isWeekend = weekday === 0 || weekday === 6;

  const report: DailyReport = {
    date: dateKey,
    timezone: timeZone,
    range: { from, to },
    isWeekend,
    people,
    unattributed: {
      activities: unattributedRow[0].activities,
      linkedinEvents: unattributedLinkedinRow.events,
    },
    ai,
    scorecard,
    attention: [],
    generatedAt: new Date(),
  };

  report.attention = buildAttentionItems(report, {
    draftsPendingOver24h: pendingDraftRow[0].pending,
    overdueTasks: overdueTaskRow[0].overdue,
    flaggedDeals: flaggedDealRow[0].flagged,
    linkedinFollowUpsDue: linkedinContacts.filter((c) => c.followUpDue).length,
  });

  return report;
}

type AttentionInputs = {
  draftsPendingOver24h: number;
  overdueTasks: number;
  flaggedDeals: number;
  linkedinFollowUpsDue: number;
};

/**
 * Fixed thresholds, evaluated in order of how loudly they should interrupt
 * someone's evening. Kept separate from the queries so the rules can be read
 * (and argued with) in one place — and unit-tested without a database.
 */
export function buildAttentionItems(
  report: DailyReport,
  inputs: AttentionInputs
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { scorecard, ai } = report;

  if (!report.isWeekend && scorecard.emailsOut === 0 && ai.emailsSentAutonomously === 0) {
    items.push({
      severity: "high",
      code: "no_outbound",
      title: "Nothing went out today",
      detail: "No outbound email was sent on a working day, by a person or by the AI.",
    });
  }

  // Under ~10 sends a single bad address is 10%+, which says nothing.
  if (scorecard.bounceRatePct !== null && scorecard.emailsOut >= 10 && scorecard.bounceRatePct >= 5) {
    items.push({
      severity: "high",
      code: "bounce_rate",
      title: `Bounce rate ${scorecard.bounceRatePct}%`,
      detail: `${scorecard.bounces} of ${scorecard.emailsOut} sends bounced. Sustained bounces put the sending domain at risk.`,
    });
  }

  if (ai.runsFailed > 0) {
    items.push({
      severity: ai.runsFailed >= 5 ? "high" : "medium",
      code: "ai_failures",
      title: `${ai.runsFailed} AI run${ai.runsFailed === 1 ? "" : "s"} failed`,
      detail: "Failed runs mean leads went unqualified or drafts were never written.",
    });
  }

  if (inputs.draftsPendingOver24h > 0) {
    items.push({
      severity: inputs.draftsPendingOver24h >= 10 ? "high" : "medium",
      code: "drafts_waiting",
      title: `${inputs.draftsPendingOver24h} draft${inputs.draftsPendingOver24h === 1 ? "" : "s"} waiting over 24h`,
      detail: "Drafted outreach sitting unreviewed is the pipeline stalling on a human, not on a prospect.",
    });
  }

  if (inputs.flaggedDeals > 0) {
    items.push({
      severity: "medium",
      code: "deals_flagged",
      title: `${inputs.flaggedDeals} deal${inputs.flaggedDeals === 1 ? "" : "s"} flagged for follow-up`,
      detail: "The cadence surfaced these as needing a look and they're still flagged.",
    });
  }

  if (inputs.linkedinFollowUpsDue > 0) {
    items.push({
      severity: "medium",
      code: "linkedin_due",
      title: `${inputs.linkedinFollowUpsDue} LinkedIn follow-up${inputs.linkedinFollowUpsDue === 1 ? "" : "s"} due`,
      detail: "These have to be sent by hand on LinkedIn, then logged back here.",
    });
  }

  if (inputs.overdueTasks > 0) {
    items.push({
      severity: "medium",
      code: "tasks_overdue",
      title: `${inputs.overdueTasks} task${inputs.overdueTasks === 1 ? "" : "s"} overdue`,
      detail: "Past their due date and not marked complete.",
    });
  }

  const unattributed = report.unattributed.activities + report.unattributed.linkedinEvents;
  if (unattributed > 0) {
    items.push({
      severity: "low",
      code: "unattributed",
      title: `${unattributed} record${unattributed === 1 ? "" : "s"} with no owner`,
      detail: "Logged without a user attached, so today's per-person numbers undercount by that much.",
    });
  }

  return items;
}
