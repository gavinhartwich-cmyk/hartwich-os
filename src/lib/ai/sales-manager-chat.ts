import "server-only";
import { z } from "zod";
import { structuredCompletion } from "./groq-structured";
import {
  getFunnelCounts,
  listActiveGoalsWithForecast,
  listRecentManagerDecisions,
} from "@/lib/data/ai-workforce";
import { isAgentDbConfigured } from "@/db/agent-workforce/client";
import type { ChatMessage } from "@/lib/data/ai-workforce-chat";

/** Kept in sync by hand with ai-workforce's own GoalMetric union
 * (ai-workforce/src/goals/types.ts) — every one of these already has a
 * real case in that repo's kpi-engine.ts, so a goal set on any of them
 * actually gets tracked/forecasted, not silently ignored. */
const GOAL_METRICS = [
  "new_clients",
  "revenue",
  "mrr",
  "close_rate",
  "qualified_opportunities",
  "meetings_booked",
  "positive_conversations",
  "prospects_discovered",
  "qualified_prospects",
  "outreach_sent",
  "follow_ups_completed",
  "agent_success_rate",
  "revenue_per_prospect",
  "prospects_per_client",
  "human_escalations",
  "human_hours_per_client",
  "opt_outs",
  "agent_error_rate",
] as const;

const ProposedGoalSchema = z.object({
  metric: z.enum(GOAL_METRICS),
  target: z.number(),
  periodDays: z.number().int().min(1).max(366),
  priority: z.enum(["low", "normal", "high", "critical"]),
  rationale: z.string(),
});

const ChatReplySchema = z.object({
  reply: z.string(),
  proposedGoal: ProposedGoalSchema.nullable(),
});

export type ChatReply = z.infer<typeof ChatReplySchema>;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    proposedGoal: {
      type: ["object", "null"],
      properties: {
        metric: { type: "string", enum: GOAL_METRICS },
        target: { type: "number" },
        periodDays: { type: "number" },
        priority: { type: "string", enum: ["low", "normal", "high", "critical"] },
        rationale: { type: "string" },
      },
      required: ["metric", "target", "periodDays", "priority", "rationale"],
      additionalProperties: false,
    },
  },
  required: ["reply", "proposedGoal"],
  additionalProperties: false,
};

async function buildContextBlock(): Promise<string> {
  if (!isAgentDbConfigured()) {
    return "ai-workforce's own database (AGENT_DATABASE_URL) is not connected — no goal/decision data is available yet.";
  }

  const [goals, decisions, funnel] = await Promise.all([
    listActiveGoalsWithForecast(),
    listRecentManagerDecisions(5),
    getFunnelCounts(),
  ]);

  const goalsBlock =
    goals.length === 0
      ? "No active goals right now."
      : goals
          .map((g) => {
            const f = g.forecast
              ? `currently ${g.forecast.currentValue}, projected ${g.forecast.projectedFinal} (${g.forecast.probability}% confidence)`
              : "no forecast recorded yet";
            return `- ${g.metric}: target ${g.target} by ${g.periodEnd.toISOString().slice(0, 10)}, priority ${g.priority}, status ${g.status} — ${f}`;
          })
          .join("\n");

  const decisionsBlock =
    decisions.length === 0
      ? "No decisions recorded yet."
      : decisions.map((d) => `- [${d.goalMetric}] ${d.selectedAction} — ${d.reason}`).join("\n");

  return `Active goals:\n${goalsBlock}\n\nRecent Sales Manager decisions:\n${decisionsBlock}\n\nCurrent pipeline: ${funnel.prospects} prospects, ${funnel.qualified} qualified, ${funnel.contacted} contacted, ${funnel.engaged} engaged, ${funnel.won} won.`;
}

function buildSystemPrompt(context: string): string {
  return `You are the Hartwich AI Sales Manager, talking directly with Gavin — the owner of Hartwich Labs. This is a real conversation about strategy and goals for the autonomous sales workforce you run (discovery, outreach, conversations, CRM, analysis).

Ground every claim in the real data given below — never invent numbers. If you don't have data to answer something, say so plainly instead of guessing.

${context}

Valid goal metrics you may propose (nothing else): ${GOAL_METRICS.join(", ")}.

When Gavin clearly wants to set a NEW goal (e.g. "get us 10 new clients this month", "push discovery harder"), respond conversationally AND fill in proposedGoal with a concrete metric/target/period/priority — he'll confirm it explicitly before anything is actually created, so propose something specific rather than asking him to specify every field himself. If a similar goal is already active, say so and ask whether he wants to replace or add to it rather than proposing a silent duplicate. For anything that isn't a new-goal request — status questions, strategy discussion, general chat — leave proposedGoal null.

Keep replies direct and practical, not corporate-sounding filler. No markdown formatting — this renders as plain text.`;
}

/** conversationHistory: prior turns, oldest first, NOT including the new userMessage. */
export async function replyToSalesManager(
  userMessage: string,
  conversationHistory: ChatMessage[]
): Promise<ChatReply> {
  const context = await buildContextBlock();
  const system = buildSystemPrompt(context);

  const historyText = conversationHistory
    .slice(-20)
    .map((m) => `${m.role === "user" ? "Gavin" : "Sales Manager"}: ${m.content}`)
    .join("\n");

  const user = historyText
    ? `Conversation so far:\n${historyText}\n\nGavin: ${userMessage}`
    : `Gavin: ${userMessage}`;

  const result = await structuredCompletion({
    system,
    user,
    schemaName: "sales_manager_chat_reply",
    jsonSchema: JSON_SCHEMA,
    zodSchema: ChatReplySchema,
    maxCompletionTokens: 1024,
  });

  if (!result) {
    return {
      reply: "Sorry, I couldn't put together a response just now — try again in a moment.",
      proposedGoal: null,
    };
  }

  return result.parsed;
}
