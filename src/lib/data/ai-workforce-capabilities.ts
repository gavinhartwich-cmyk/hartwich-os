import { CAPABILITY_AGENT_IDS } from "./ai-workforce";

export type CapabilityKey = "discovery" | "outreach" | "conversations" | "crm" | "analyst" | "manager";

export type CapabilityMeta = {
  key: CapabilityKey;
  label: string;
  description: string;
  /** Real ai-workforce AgentDefinition ids this node's run history is
   * filtered to — null for the two capabilities that never call the
   * agent runtime at all (see each's `description`). */
  agentIds: readonly string[] | null;
  /** A snapshot of the actual current config value(s) from ai-workforce's
   * own source, for reference only. This is NOT read live — there is no
   * settings-storage mechanism yet, so editing here would silently do
   * nothing. Change it by editing the named file in the ai-workforce repo
   * and redeploying; update this snapshot to match in the same PR. */
  config: { sourceFile: string; values: { label: string; value: string }[] };
};

export const CAPABILITIES: Record<CapabilityKey, CapabilityMeta> = {
  discovery: {
    key: "discovery",
    label: "Discovery",
    description:
      "Finds and qualifies new leads: Google Places search, website research, then a deterministic weighted score decides qualified / needs review / disqualified.",
    agentIds: CAPABILITY_AGENT_IDS.discovery,
    config: {
      sourceFile: "ai-workforce/src/config/icp-targets.ts + src/qualification/scoring.ts",
      values: [
        { label: "ICP target", value: "\"HVAC contractor\" — ~60 major North America metros" },
        { label: "Geographic rotation", value: "2 metro areas per cycle, time-based — a full sweep roughly every day and a half" },
        { label: "Base discovery volume", value: "20 per area per run (the Sales Manager scales up from here)" },
        {
          label: "Qualification weights",
          value: "ICP fit 30% · Opportunity 25% · Contactability 15% · Business quality 15% · Timing 10% · Data confidence 5%",
        },
        { label: "Auto-file threshold", value: "score ≥ 60 → qualified (deal created)" },
        { label: "Disqualify threshold", value: "score < 40 → disqualified" },
      ],
    },
  },
  outreach: {
    key: "outreach",
    label: "Outreach",
    description:
      "Strategy, message generation, and autonomous sending for cold outreach and no-reply follow-ups — every send passes the opt-out/kill-switch/window/warm-up guard first.",
    agentIds: CAPABILITY_AGENT_IDS.outreach,
    config: {
      sourceFile: "ai-workforce/src/outreach/approved-messaging-config.ts",
      values: [
        { label: "Offer", value: "Google review automation & reputation management for HVAC service businesses" },
        { label: "Enabled channels", value: "Email only" },
        { label: "Max follow-ups", value: "3 (day 3/6/9 cadence)" },
        { label: "Word count range", value: "80–160 words" },
        { label: "CTA", value: "1 per message — \"a quick call\"" },
      ],
    },
  },
  conversations: {
    key: "conversations",
    label: "Conversations",
    description:
      "Classifies every inbound reply (interested / objection / price / not interested / hostile / …) and either responds autonomously or escalates, per a fixed routing table.",
    agentIds: CAPABILITY_AGENT_IDS.conversations,
    config: {
      sourceFile: "ai-workforce/src/outreach/reply-routing.ts",
      values: [
        { label: "Always escalates to Gavin", value: "PRICE, HOSTILE" },
        { label: "Auto-closes the deal lost", value: "NOT_INTERESTED, ALREADY_HAS_SOLUTION" },
        { label: "Everything else", value: "an autonomous reply, sent through the same send-guard as cold outreach" },
      ],
    },
  },
  crm: {
    key: "crm",
    label: "CRM",
    description:
      "Automatic record-keeping — every autonomous action (a send, a note, a stage move, an escalation) lands in this app's own activities/audit log, the same place a human's actions would.",
    agentIds: null,
    config: {
      sourceFile: "ai-workforce/src/policy/default-rules.ts",
      values: [
        { label: "CRM write tools", value: "append_company_note, create_escalation_task, close_deal_lost, flag_deal_for_review" },
        { label: "Autonomy level required", value: "AUTONOMOUS_ROUTINE — no per-action approval" },
      ],
    },
  },
  analyst: {
    key: "analyst",
    label: "Analyst",
    description:
      "Deliberately LLM-free: funnel/business/efficiency/quality reporting is plain arithmetic over real KPI snapshots and forecasts, not a model's summary of them.",
    agentIds: null,
    config: {
      sourceFile: "ai-workforce/src/goals/kpi-engine.ts + pace-forecast.ts",
      values: [{ label: "Reasoning", value: "None — every number here is computed in code, never asked of a model" }],
    },
  },
  manager: {
    key: "manager",
    label: "Manager",
    description:
      "Also LLM-free: one control loop per goal per cycle — diagnose the bottleneck, act within authority or escalate, using SPEC.md §37's exact escalation format.",
    agentIds: null,
    config: {
      sourceFile: "ai-workforce/src/manager/authority-policy.ts",
      values: [
        { label: "Autonomous: more discovery volume", value: "up to +20% — bigger asks escalate to Gavin instead" },
        { label: "Autonomous: launch an experiment", value: "unconditional — one pre-approved variant, no budget/copy changes" },
      ],
    },
  },
};
