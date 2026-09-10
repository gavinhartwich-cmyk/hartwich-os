/**
 * NOT a source of truth. The `ai-workforce` repo (a separate service —
 * see its own README's "Architecture" section) owns this database and
 * these tables; this file is a narrow, explicitly-a-mirror subset — just
 * the columns the AI Workforce dashboard (src/app/(app)/ai-workforce)
 * reads. Mirrors that repo's own src/db/schema.ts.
 *
 * Read-only from here: this app never writes to these tables except the
 * one deliberate exception (outreach_control's kill switch — see
 * src/lib/actions/ai-workforce.ts) that ai-workforce's own send-guard
 * already treats as an external, Gavin-controlled input.
 *
 * If ai-workforce's schema changes shape, this file needs a matching
 * update; it is never used to generate or push a migration against that
 * database — see drizzle.config.ts, which only points at this app's own
 * DATABASE_URL.
 */

import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const agentRunStatusEnum = pgEnum("agent_run_status", ["succeeded", "failed", "denied"]);
export const goalStatusEnum = pgEnum("goal_status", [
  "NOT_STARTED",
  "ON_TRACK",
  "AT_RISK",
  "BEHIND",
  "CRITICAL",
  "ACHIEVED",
  "FAILED",
]);
export const goalPriorityEnum = pgEnum("goal_priority", ["low", "normal", "high", "critical"]);
export const experimentStatusEnum = pgEnum("experiment_status", ["running", "stopped", "concluded"]);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: text("agent_id").notNull(),
  agentVersion: text("agent_version").notNull(),
  model: text("model").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  input: jsonb("input").$type<unknown>(),
  output: jsonb("output").$type<unknown>(),
  toolCalls: jsonb("tool_calls").$type<{ tool: string; input: unknown; output: unknown }[]>().notNull().default([]),
  status: agentRunStatusEnum("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesGoals = pgTable("sales_goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  metric: text("metric").notNull(),
  target: numeric("target", { precision: 14, scale: 2 }).notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  priority: goalPriorityEnum("priority").notNull().default("normal"),
  status: goalStatusEnum("status").notNull().default("NOT_STARTED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const salesForecasts = pgTable("sales_forecasts", {
  id: uuid("id").defaultRandom().primaryKey(),
  goalId: uuid("goal_id").notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  currentValue: numeric("current_value", { precision: 14, scale: 2 }).notNull(),
  projectedFinal: numeric("projected_final", { precision: 14, scale: 2 }).notNull(),
  probability: integer("probability").notNull(),
  status: goalStatusEnum("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const managerDecisions = pgTable("manager_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  goalId: uuid("goal_id").notNull(),
  observation: text("observation").notNull(),
  diagnosis: text("diagnosis").notNull(),
  options: jsonb("options")
    .$type<{ action: string; expectedImpact: number; confidence: number; risk: number }[]>()
    .notNull()
    .default([]),
  selectedAction: text("selected_action").notNull(),
  reason: text("reason").notNull(),
  expectedOutcome: text("expected_outcome").notNull(),
  actualOutcome: text("actual_outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const experiments = pgTable("experiments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  minSampleSizePerVariant: integer("min_sample_size_per_variant").notNull(),
  status: experimentStatusEnum("status").notNull().default("running"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const experimentVariants = pgTable("experiment_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  experimentId: uuid("experiment_id")
    .notNull()
    .references(() => experiments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  directive: text("directive").notNull(),
  weight: numeric("weight", { precision: 5, scale: 2 }).notNull().default("1"),
});

export const experimentsRelations = relations(experiments, ({ many }) => ({
  variants: many(experimentVariants),
}));

export const experimentVariantsRelations = relations(experimentVariants, ({ one }) => ({
  experiment: one(experiments, { fields: [experimentVariants.experimentId], references: [experiments.id] }),
}));

/** The kill switch (ai-workforce's SPEC.md §57: "stop this campaign"). Single row, id="default". */
export const outreachControl = pgTable("outreach_control", {
  id: text("id").primaryKey().default("default"),
  sendingPaused: boolean("sending_paused").notNull().default(false),
  pausedReason: text("paused_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppressedContacts = pgTable("suppressed_contacts", {
  email: text("email").primaryKey(),
  reason: text("reason").notNull(),
  suppressedAt: timestamp("suppressed_at", { withTimezone: true }).notNull().defaultNow(),
});
