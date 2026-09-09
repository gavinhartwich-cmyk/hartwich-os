import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, companies, deals, pipelineStages } from "@/db/schema";
import { getAgentDb } from "@/db/agent-workforce/client";
import {
  agentRuns,
  experiments,
  managerDecisions,
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
const CAPABILITY_AGENT_IDS = {
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
      runsLast24h: sql<number>`count(*) filter (where ${agentRuns.createdAt} >= ${since})::int`,
    })
    .from(agentRuns)
    .where(inArray(agentRuns.agentId, agentIds as unknown as string[]));
  return { lastActiveAt: row?.lastActiveAt ?? null, runsLast24h: row?.runsLast24h ?? 0 };
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
      runsLast24h: sql<number>`count(*) filter (where ${auditLog.createdAt} >= ${since})::int`,
    })
    .from(auditLog);
  return { lastActiveAt: row?.lastActiveAt ?? null, runsLast24h: row?.runsLast24h ?? 0 };
}

export async function getAnalystStatus(): Promise<CapabilityStatus> {
  const since = new Date(Date.now() - DAY_MS);
  const agentDb = getAgentDb();
  const [row] = await agentDb
    .select({
      lastActiveAt: sql<Date | null>`max(${salesForecasts.createdAt})`,
      runsLast24h: sql<number>`count(*) filter (where ${salesForecasts.createdAt} >= ${since})::int`,
    })
    .from(salesForecasts);
  return { lastActiveAt: row?.lastActiveAt ?? null, runsLast24h: row?.runsLast24h ?? 0 };
}

export type ManagerStatus = CapabilityStatus & { pendingEscalations24h: number };

export async function getManagerStatus(): Promise<ManagerStatus> {
  const since = new Date(Date.now() - DAY_MS);
  const agentDb = getAgentDb();
  const [row] = await agentDb
    .select({
      lastActiveAt: sql<Date | null>`max(${managerDecisions.createdAt})`,
      runsLast24h: sql<number>`count(*) filter (where ${managerDecisions.createdAt} >= ${since})::int`,
      pendingEscalations24h: sql<number>`count(*) filter (where ${managerDecisions.selectedAction} ilike 'Escalate to Gavin%' and ${managerDecisions.createdAt} >= ${since})::int`,
    })
    .from(managerDecisions);
  return {
    lastActiveAt: row?.lastActiveAt ?? null,
    runsLast24h: row?.runsLast24h ?? 0,
    pendingEscalations24h: row?.pendingEscalations24h ?? 0,
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
};

/** The Sales Manager's own institutional memory (ai-workforce's manager_decisions) — "what did it decide, and why," most recent first. */
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
    .limit(limit);
  if (rows.length === 0) return [];

  const goalIds = [...new Set(rows.map((r) => r.goalId))];
  const goals = await agentDb.select({ id: salesGoals.id, metric: salesGoals.metric }).from(salesGoals).where(inArray(salesGoals.id, goalIds));
  const metricByGoal = new Map(goals.map((g) => [g.id, g.metric]));

  return rows.map((r) => ({
    id: r.id,
    goalMetric: metricByGoal.get(r.goalId) ?? "unknown",
    selectedAction: r.selectedAction,
    reason: r.reason,
    createdAt: r.createdAt,
    isEscalation: r.selectedAction.startsWith("Escalate to Gavin"),
  }));
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

/** Reads THIS app's own tables — always available regardless of AGENT_DATABASE_URL. */
export async function getFunnelCounts(): Promise<FunnelCounts> {
  const [prospectsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(companies);
  const [qualifiedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies)
    .where(eq(companies.status, "qualified"));
  const stageCounts = await db
    .select({ name: pipelineStages.name, isWon: pipelineStages.isWon, count: sql<number>`count(${deals.id})::int` })
    .from(pipelineStages)
    .leftJoin(deals, eq(deals.stageId, pipelineStages.id))
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
