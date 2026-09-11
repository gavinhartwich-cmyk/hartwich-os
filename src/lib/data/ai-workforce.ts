import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, companies, deals, pipelineStages } from "@/db/schema";
import { getAgentDb } from "@/db/agent-workforce/client";
import {
  agentRuns,
  experiments,
  managerDecisions,
  managerEscalations,
  outreachControl,
  salesForecasts,
  salesGoals,
  suppressedContacts,
} from "@/db/agent-workforce/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which of ai-workforce's own AgentDefinition ids (its src/agents/*.ts)
 * count toward each dashboard node — see that repo's README for the full
 * list. Kept here, not fetched, because it's a small, stable set that
 * only changes when ai-workforce adds a new agent (a code change on both
 * sides either way).
 */
export const CAPABILITY_AGENT_IDS = {
  discovery: ["prospect_discovery_agent", "research_agent", "qualification_agent", "company_review_agent"],
  outreach: ["outreach_strategy_agent", "outreach_generation_agent", "outreach_followup_agent"],
  conversations: ["conversation_intelligence_agent", "outreach_reply_agent", "appointment_agent"],
} as const;

export type CapabilityStatus = { lastActiveAt: Date | null; runsLast24h: number };

async function capabilityStatusFromAgentRuns(agentIds: readonly string[]): Promise<CapabilityStatus> {
  const since = new Date(Date.now() - DAY_MS);
  const agentDb = getAgentDb();
  const [row] = await agentDb
    .select({
      lastActiveAt: sql<Date | null>`max(${agentRuns.createdAt})`,
      runsLast24h: sql<number>`count(*) filter (where ${agentRuns.createdAt} >= ${since.toISOString()})::int`,
    })
    .from(agentRuns)
    .where(inArray(agentRuns.agentId, agentIds as unknown as string[]));
  return { lastActiveAt: row?.lastActiveAt ? new Date(row.lastActiveAt) : null, runsLast24h: row?.runsLast24h ?? 0 };
}

export function getDiscoveryStatus(): Promise<CapabilityStatus> {
  return capabilityStatusFromAgentRuns(CAPABILITY_AGENT_IDS.discovery);
}
export function getOutreachStatus(): Promise<CapabilityStatus> {
  return capabilityStatusFromAgentRuns(CAPABILITY_AGENT_IDS.outreach);
}
export function getConversationsStatus(): Promise<CapabilityStatus> {
  return capabilityStatusFromAgentRuns(CAPABILITY_AGENT_IDS.conversations);
}

/** CRM activity is read from THIS app's own audit_log — no AGENT_DATABASE_URL needed. Nothing in hartwich-os itself writes here yet (see ai-workforce's Phase 7), so every row today is honestly AI-originated. */
export async function getCrmActivityStatus(): Promise<CapabilityStatus> {
  const since = new Date(Date.now() - DAY_MS);
  const [row] = await db
    .select({
      lastActiveAt: sql<Date | null>`max(${auditLog.createdAt})`,
      runsLast24h: sql<number>`count(*) filter (where ${auditLog.createdAt} >= ${since.toISOString()})::int`,
    })
    .from(auditLog);
  return { lastActiveAt: row?.lastActiveAt ? new Date(row.lastActiveAt) : null, runsLast24h: row?.runsLast24h ?? 0 };
}

export async function getAnalystStatus(): Promise<CapabilityStatus> {
  const since = new Date(Date.now() - DAY_MS);
  const agentDb = getAgentDb();
  const [row] = await agentDb
    .select({
      lastActiveAt: sql<Date | null>`max(${salesForecasts.createdAt})`,
      runsLast24h: sql<number>`count(*) filter (where ${salesForecasts.createdAt} >= ${since.toISOString()})::int`,
    })
    .from(salesForecasts);
  return { lastActiveAt: row?.lastActiveAt ? new Date(row.lastActiveAt) : null, runsLast24h: row?.runsLast24h ?? 0 };
}

export type ManagerStatus = CapabilityStatus & { pendingEscalations24h: number };

export async function getManagerStatus(): Promise<ManagerStatus> {
  const since = new Date(Date.now() - DAY_MS);
  const agentDb = getAgentDb();
  const [row] = await agentDb
    .select({
      lastActiveAt: sql<Date | null>`max(${managerDecisions.createdAt})`,
      runsLast24h: sql<number>`count(*) filter (where ${managerDecisions.createdAt} >= ${since.toISOString()})::int`,
    })
    .from(managerDecisions);

  // Counted from manager_escalations, NOT from manager_decisions. That table
  // is the manager's audit log — it gets a row every single cycle, so
  // counting "Escalate to Gavin" rows there showed a number that only ever
  // climbed (11 by mid-evening on 2026-09-10) and that nothing Gavin did
  // could clear, because approving an escalation doesn't remove the log
  // entries that recorded it. Open asks live in manager_escalations, and
  // deciding one genuinely removes it from this count.
  const [escalationRow] = await agentDb
    .select({ pending: sql<number>`count(*)::int` })
    .from(managerEscalations)
    .where(eq(managerEscalations.status, "pending"));

  return {
    lastActiveAt: row?.lastActiveAt ? new Date(row.lastActiveAt) : null,
    runsLast24h: row?.runsLast24h ?? 0,
    pendingEscalations24h: escalationRow?.pending ?? 0,
  };
}

export type OutreachControlState = { sendingPaused: boolean; pausedReason: string | null; updatedAt: Date | null };

/** No row yet reads as "not paused" — matches ai-workforce's own send-guard default. */
export async function getOutreachControl(): Promise<OutreachControlState> {
  const agentDb = getAgentDb();
  const row = await agentDb.query.outreachControl.findFirst({ where: eq(outreachControl.id, "default") });
  return row
    ? { sendingPaused: row.sendingPaused, pausedReason: row.pausedReason, updatedAt: row.updatedAt }
    : { sendingPaused: false, pausedReason: null, updatedAt: null };
}

export type GoalWithForecast = {
  id: string;
  metric: string;
  target: number;
  periodEnd: Date;
  priority: string;
  status: string;
  forecast: { currentValue: number; projectedFinal: number; probability: number; asOf: Date } | null;
};

/** Every goal ai-workforce's Sales Manager is still actively working, with whatever forecast it most recently computed. */
export async function listActiveGoalsWithForecast(): Promise<GoalWithForecast[]> {
  const agentDb = getAgentDb();
  const goals = await agentDb
    .select()
    .from(salesGoals)
    .where(sql`${salesGoals.status} not in ('ACHIEVED', 'FAILED')`)
    .orderBy(desc(salesGoals.priority), desc(salesGoals.createdAt));
  if (goals.length === 0) return [];

  const goalIds = goals.map((g) => g.id);
  const forecastRows = await agentDb
    .select()
    .from(salesForecasts)
    .where(inArray(salesForecasts.goalId, goalIds))
    .orderBy(desc(salesForecasts.asOf));

  const latestByGoal = new Map<string, (typeof forecastRows)[number]>();
  for (const f of forecastRows) {
    if (!latestByGoal.has(f.goalId)) latestByGoal.set(f.goalId, f);
  }

  return goals.map((g) => {
    const f = latestByGoal.get(g.id);
    return {
      id: g.id,
      metric: g.metric,
      target: Number(g.target),
      periodEnd: g.periodEnd,
      priority: g.priority,
      status: g.status,
      forecast: f
        ? {
            currentValue: Number(f.currentValue),
            projectedFinal: Number(f.projectedFinal),
            probability: f.probability,
            asOf: f.asOf,
          }
        : null,
    };
  });
}

export type ManagerDecisionSummary = {
  id: string;
  goalMetric: string;
  selectedAction: string;
  reason: string;
  createdAt: Date;
  isEscalation: boolean;
  /** How many consecutive cycles reached this same decision, including this one. */
  repeatCount: number;
  /** When the run of identical decisions began — `createdAt` is the most recent. */
  firstAt: Date;
};

/**
 * The Sales Manager's own institutional memory (ai-workforce's
 * manager_decisions) — "what did it decide, and why," most recent first.
 *
 * Consecutive identical decisions are collapsed into one entry with a count.
 * The manager runs every 15 minutes, so a situation it can't act on alone
 * produces the same decision ~96 times a day; showing them individually
 * filled the whole list with one repeated line and buried everything else,
 * which read as if it were escalating over and over (Gavin, 2026-09-11).
 * The rows are all still in the table — this is a display concern only.
 */
export async function listRecentManagerDecisions(limit = 8): Promise<ManagerDecisionSummary[]> {
  const agentDb = getAgentDb();
  const rows = await agentDb
    .select({
      id: managerDecisions.id,
      goalId: managerDecisions.goalId,
      selectedAction: managerDecisions.selectedAction,
      reason: managerDecisions.reason,
      createdAt: managerDecisions.createdAt,
    })
    .from(managerDecisions)
    .orderBy(desc(managerDecisions.createdAt))
    // Over-fetch so collapsing still yields `limit` distinct entries when a
    // long run of identical decisions sits at the top.
    .limit(limit * 40);
  if (rows.length === 0) return [];

  const goalIds = [...new Set(rows.map((r) => r.goalId))];
  const goals = await agentDb.select({ id: salesGoals.id, metric: salesGoals.metric }).from(salesGoals).where(inArray(salesGoals.id, goalIds));
  const metricByGoal = new Map(goals.map((g) => [g.id, g.metric]));

  const collapsed: ManagerDecisionSummary[] = [];
  for (const r of rows) {
    const previous = collapsed[collapsed.length - 1];
    // Rows arrive newest-first, so a run of identical decisions is contiguous.
    if (previous && previous.selectedAction === r.selectedAction && previous.goalMetric === metricByGoal.get(r.goalId)) {
      previous.repeatCount += 1;
      previous.firstAt = r.createdAt;
      continue;
    }
    if (collapsed.length === limit) break;
    collapsed.push({
      id: r.id,
      goalMetric: metricByGoal.get(r.goalId) ?? "unknown",
      selectedAction: r.selectedAction,
      reason: r.reason,
      createdAt: r.createdAt,
      isEscalation: r.selectedAction.startsWith("Escalate to Gavin"),
      repeatCount: 1,
      firstAt: r.createdAt,
    });
  }
  return collapsed;
}

export async function listRunningExperiments() {
  const agentDb = getAgentDb();
  return agentDb.query.experiments.findMany({
    where: eq(experiments.status, "running"),
    with: { variants: true },
    orderBy: desc(experiments.createdAt),
  });
}

export async function getSuppressedCount(): Promise<number> {
  const agentDb = getAgentDb();
  const [row] = await agentDb.select({ count: sql<number>`count(*)::int` }).from(suppressedContacts);
  return row?.count ?? 0;
}

export type FunnelCounts = { prospects: number; qualified: number; contacted: number; engaged: number; won: number };

/** Reads THIS app's own tables — always available regardless of AGENT_DATABASE_URL.
 * Scoped to aiWorkforceCreated companies only — this is specifically the AI
 * Workforce dashboard's own performance snapshot, not the whole CRM's, so a
 * manually-added lead (or one from hartwich-os's own human-triggered lead
 * mining) must not inflate what the autonomous pipeline gets credited for.
 * The Board (src/app/(app)/board) shows everything, badged by source
 * instead — see deal-card.tsx. */
export async function getFunnelCounts(): Promise<FunnelCounts> {
  const [prospectsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(eq(companies.aiWorkforceCreated, true));
  const [qualifiedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(and(eq(companies.status, "qualified"), eq(companies.aiWorkforceCreated, true)));
  const stageCounts = await db
    .select({ name: pipelineStages.name, isWon: pipelineStages.isWon, count: sql<number>`count(${deals.id})::int` })
    .from(pipelineStages)
    .innerJoin(deals, eq(deals.stageId, pipelineStages.id))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(companies.aiWorkforceCreated, true))
    .groupBy(pipelineStages.id, pipelineStages.name, pipelineStages.isWon);

  const countFor = (name: string) => stageCounts.find((s) => s.name === name)?.count ?? 0;
  const won = stageCounts.filter((s) => s.isWon).reduce((sum, s) => sum + s.count, 0);

  return {
    prospects: prospectsRow?.count ?? 0,
    qualified: qualifiedRow?.count ?? 0,
    contacted: countFor("Contacted"),
    engaged: countFor("Engaged"),
    won,
  };
}

export type RecentActivity = { id: string; action: string; entityType: string; createdAt: Date };

/** Same zero-dependency source as getCrmActivityStatus — a real, live feed regardless of whether AGENT_DATABASE_URL is configured. */
export async function listRecentAiActivity(limit = 8): Promise<RecentActivity[]> {
  return db
    .select({ id: auditLog.id, action: auditLog.action, entityType: auditLog.entityType, createdAt: auditLog.createdAt })
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export type AgentRunSummary = {
  id: string;
  agentId: string;
  agentVersion: string;
  model: string;
  startedAt: Date;
  finishedAt: Date;
  status: "succeeded" | "failed" | "denied";
  error: string | null;
  input: unknown;
  output: unknown;
  toolCalls: { tool: string; input: unknown; output: unknown }[];
};

/** The per-agent drill-down (AI Workforce dashboard, click a node) — every real
 * AgentRuntime.run() for one capability's agent ids, most recent first,
 * full input/output/toolCalls so "what did it actually do" is answerable
 * without leaving this app. Discovery/Outreach/Conversations only —
 * Analyst and Manager are deliberately LLM-free (see listRecentForecasts /
 * listRecentManagerDecisions), and CRM reads this app's own audit_log
 * (listRecentAiActivity), not agent_runs. */
export async function listRecentAgentRuns(agentIds: readonly string[], limit = 20): Promise<AgentRunSummary[]> {
  const agentDb = getAgentDb();
  const rows = await agentDb.query.agentRuns.findMany({
    where: (r, { inArray }) => inArray(r.agentId, agentIds as string[]),
    orderBy: (r, { desc }) => desc(r.startedAt),
    limit,
  });
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    agentVersion: r.agentVersion,
    model: r.model,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    status: r.status,
    error: r.error,
    input: r.input,
    output: r.output,
    toolCalls: r.toolCalls,
  }));
}

export type ForecastSnapshot = {
  id: string;
  goalId: string;
  goalMetric: string;
  asOf: Date;
  currentValue: number;
  projectedFinal: number;
  probability: number;
  status: string;
};

/** The Analyst capability's own activity trail — it's deliberately LLM-free
 * (deterministic KPI/pace/forecast math), so its "recent runs" are the
 * forecast snapshots it recorded, not agent_runs rows. */
export async function listRecentForecasts(limit = 20): Promise<ForecastSnapshot[]> {
  const agentDb = getAgentDb();
  const rows = await agentDb.query.salesForecasts.findMany({
    orderBy: (f, { desc }) => desc(f.asOf),
    limit,
  });
  if (rows.length === 0) return [];

  const goalIds = [...new Set(rows.map((r) => r.goalId))];
  const goals = await agentDb.select({ id: salesGoals.id, metric: salesGoals.metric }).from(salesGoals).where(inArray(salesGoals.id, goalIds));
  const metricByGoal = new Map(goals.map((g) => [g.id, g.metric]));

  return rows.map((r) => ({
    id: r.id,
    goalId: r.goalId,
    goalMetric: metricByGoal.get(r.goalId) ?? "unknown",
    asOf: r.asOf,
    currentValue: Number(r.currentValue),
    projectedFinal: Number(r.projectedFinal),
    probability: r.probability,
    status: r.status,
  }));
}

export type PendingEscalation = {
  id: string;
  goalMetric: string;
  capability: string;
  proposedChangePercent: number | null;
  action: string;
  diagnosis: string;
  whyApprovalRequired: string;
  expectedImpact: number | null;
  risk: number | null;
  createdAt: Date;
};

/**
 * Decisions the Sales Manager is waiting on Gavin for. Rendered on
 * /ai-workforce with Approve/Reject — approving flips the row's status and
 * ai-workforce's own manager carries it out on its next cycle.
 */
export async function listPendingEscalations(limit = 20): Promise<PendingEscalation[]> {
  const agentDb = getAgentDb();
  const rows = await agentDb
    .select({
      id: managerEscalations.id,
      goalId: managerEscalations.goalId,
      capability: managerEscalations.capability,
      proposedChangePercent: managerEscalations.proposedChangePercent,
      action: managerEscalations.action,
      diagnosis: managerEscalations.diagnosis,
      whyApprovalRequired: managerEscalations.whyApprovalRequired,
      expectedImpact: managerEscalations.expectedImpact,
      risk: managerEscalations.risk,
      createdAt: managerEscalations.createdAt,
    })
    .from(managerEscalations)
    .where(eq(managerEscalations.status, "pending"))
    .orderBy(desc(managerEscalations.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const goalIds = [...new Set(rows.map((r) => r.goalId))];
  const goals = await agentDb
    .select({ id: salesGoals.id, metric: salesGoals.metric })
    .from(salesGoals)
    .where(inArray(salesGoals.id, goalIds));
  const metricByGoal = new Map(goals.map((g) => [g.id, g.metric]));

  return rows.map((r) => ({
    id: r.id,
    goalMetric: metricByGoal.get(r.goalId) ?? "unknown",
    capability: r.capability,
    proposedChangePercent: r.proposedChangePercent,
    action: r.action,
    diagnosis: r.diagnosis,
    whyApprovalRequired: r.whyApprovalRequired,
    // numeric comes back as a string from postgres.js — coerce explicitly.
    expectedImpact: r.expectedImpact === null ? null : Number(r.expectedImpact),
    risk: r.risk === null ? null : Number(r.risk),
    createdAt: r.createdAt,
  }));
}
