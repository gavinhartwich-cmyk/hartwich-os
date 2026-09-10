import { redirect } from "next/navigation";
import { Search, Mail, MessageSquare, Database, BarChart3, Brain, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/page-header";
import Reveal from "@/components/reveal";
import HubDiagram, { type HubNode, type NodeStatus } from "@/components/ai-workforce/hub-diagram";
import KillSwitch from "@/components/ai-workforce/kill-switch";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { isAgentDbConfigured } from "@/db/agent-workforce/client";
import {
  getAnalystStatus,
  getConversationsStatus,
  getCrmActivityStatus,
  getDiscoveryStatus,
  getFunnelCounts,
  getManagerStatus,
  getOutreachControl,
  getOutreachStatus,
  getSuppressedCount,
  listActiveGoalsWithForecast,
  listRecentAiActivity,
  listRecentManagerDecisions,
  listRunningExperiments,
  type CapabilityStatus,
} from "@/lib/data/ai-workforce";

export const dynamic = "force-dynamic";

function statusFor(capability: CapabilityStatus): NodeStatus {
  if (capability.runsLast24h > 0) return "active";
  if (capability.lastActiveAt) return "idle";
  return "never";
}

function relativeTime(date: Date | null): string {
  if (!date) return "Not run yet";
  const ms = Date.now() - date.getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Gavin-only (see lib/auth/allowlist.ts isBookingAdmin) — the nav already
 * hides this link from Noah; this redirect is the defensive server-side
 * check, same pattern as (app)/calendar/settings/page.tsx.
 */
export default async function AiWorkforcePage() {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    redirect("/board");
  }
  const canControl = true;
  const agentDbReady = isAgentDbConfigured();

  // Always available — this app's own tables, no dependency on ai-workforce's database.
  const [funnel, recentActivity, crmStatus] = await Promise.all([
    getFunnelCounts(),
    listRecentAiActivity(8),
    getCrmActivityStatus(),
  ]);

  // Only available once AGENT_DATABASE_URL is set — ai-workforce's own database.
  const agentData = agentDbReady
    ? await Promise.all([
        getDiscoveryStatus(),
        getOutreachStatus(),
        getConversationsStatus(),
        getAnalystStatus(),
        getManagerStatus(),
        getOutreachControl(),
        listActiveGoalsWithForecast(),
        listRecentManagerDecisions(8),
        listRunningExperiments(),
        getSuppressedCount(),
      ])
    : null;

  const [
    discoveryStatus,
    outreachStatus,
    conversationsStatus,
    analystStatus,
    managerStatus,
    outreachControl,
    goals,
    decisions,
    runningExperiments,
    suppressedCount,
  ] = agentData ?? [null, null, null, null, null, null, [], [], [], 0];

  const nodes: HubNode[] = [
    {
      key: "discovery",
      label: "Discovery",
      sublabel: discoveryStatus ? relativeTime(discoveryStatus.lastActiveAt) : "Not connected",
      icon: Search,
      status: discoveryStatus ? statusFor(discoveryStatus) : "never",
    },
    {
      key: "outreach",
      label: "Outreach",
      sublabel: outreachControl?.sendingPaused
        ? "Paused"
        : outreachStatus
          ? relativeTime(outreachStatus.lastActiveAt)
          : "Not connected",
      icon: Mail,
      status: outreachControl?.sendingPaused ? "paused" : outreachStatus ? statusFor(outreachStatus) : "never",
    },
    {
      key: "conversations",
      label: "Conversations",
      sublabel: conversationsStatus ? relativeTime(conversationsStatus.lastActiveAt) : "Not connected",
      icon: MessageSquare,
      status: conversationsStatus ? statusFor(conversationsStatus) : "never",
    },
    {
      key: "crm",
      label: "CRM",
      sublabel: relativeTime(crmStatus.lastActiveAt),
      icon: Database,
      status: statusFor(crmStatus),
    },
    {
      key: "analyst",
      label: "Analyst",
      sublabel: analystStatus ? relativeTime(analystStatus.lastActiveAt) : "Not connected",
      icon: BarChart3,
      status: analystStatus ? statusFor(analystStatus) : "never",
    },
    {
      key: "manager",
      label: "Manager",
      sublabel: managerStatus
        ? managerStatus.pendingEscalations24h > 0
          ? `${managerStatus.pendingEscalations24h} escalation${managerStatus.pendingEscalations24h > 1 ? "s" : ""}`
          : relativeTime(managerStatus.lastActiveAt)
        : "Not connected",
      icon: Brain,
      status: managerStatus
        ? managerStatus.pendingEscalations24h > 0
          ? "idle"
          : statusFor(managerStatus)
        : "never",
    },
  ];

  const anyActive = nodes.some((n) => n.status === "active");
  const anyIdle = nodes.some((n) => n.status === "idle" || n.status === "paused");
  const hubStatus: NodeStatus = !agentDbReady ? "never" : anyActive ? "active" : anyIdle ? "idle" : "never";
  const hubSublabel = !agentDbReady ? "Not connected" : anyActive ? "Live" : anyIdle ? "Needs attention" : "Not run yet";

  return (
    <div>
      <PageHeader
        title="AI Workforce"
        subtitle="Hartwich Labs' autonomous sales workforce — discovery, outreach, conversations, CRM upkeep, analysis, and the Sales Manager loop that ties them together."
      />

      {!agentDbReady && (
        <div className="surface-card mb-6 flex items-start gap-3 border-amber-400/30 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-sm font-medium text-amber-200">Not connected yet</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Set <code className="rounded bg-white/[0.06] px-1 py-0.5 text-xs">AGENT_DATABASE_URL</code> to the
              ai-workforce repo&apos;s own database to see live goal, decision, and experiment data here. CRM activity
              below is already live — it reads this app&apos;s own tables. Nothing in ai-workforce runs on a
              schedule yet either; see that repo&apos;s README &quot;What&apos;s next.&quot;
            </p>
          </div>
        </div>
      )}

      <Reveal>
        <HubDiagram hub={{ label: "AI WORKFORCE", sublabel: hubSublabel, status: hubStatus }} nodes={nodes} />
      </Reveal>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <KillSwitch
          initialPaused={outreachControl?.sendingPaused ?? false}
          initialReason={outreachControl?.pausedReason ?? null}
          canControl={agentDbReady && canControl}
        />

        <div className="surface-card p-4">
          <p className="mb-2 text-sm font-medium text-white/90">Pipeline snapshot</p>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-[var(--muted)]">Prospects</dt>
            <dd className="text-right text-white/80">{funnel.prospects}</dd>
            <dt className="text-[var(--muted)]">Qualified</dt>
            <dd className="text-right text-white/80">{funnel.qualified}</dd>
            <dt className="text-[var(--muted)]">Contacted</dt>
            <dd className="text-right text-white/80">{funnel.contacted}</dd>
            <dt className="text-[var(--muted)]">Engaged</dt>
            <dd className="text-right text-white/80">{funnel.engaged}</dd>
            <dt className="text-[var(--muted)]">Won</dt>
            <dd className="text-right text-white/80">{funnel.won}</dd>
          </dl>
        </div>

        <div className="surface-card p-4">
          <p className="mb-2 text-sm font-medium text-white/90">Active goals</p>
          {goals.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{agentDbReady ? "No active goals set." : "Not connected."}</p>
          ) : (
            <ul className="space-y-2">
              {goals.map((g) => (
                <li key={g.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/80">
                      {g.target} {g.metric}
                    </span>
                    <span className="text-xs text-[var(--muted)]">{g.status}</span>
                  </div>
                  {g.forecast && (
                    <p className="text-xs text-[var(--muted)]">
                      Projected {g.forecast.projectedFinal} ({g.forecast.probability}% confidence)
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="surface-card p-4">
          <p className="mb-2 text-sm font-medium text-white/90">Sales Manager — recent decisions</p>
          {decisions.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{agentDbReady ? "No decisions recorded yet." : "Not connected."}</p>
          ) : (
            <ul className="space-y-3">
              {decisions.map((d) => (
                <li key={d.id} className="border-b border-white/[0.06] pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-medium ${d.isEscalation ? "text-amber-300" : "text-emerald-300"}`}>
                      {d.goalMetric}
                    </span>
                    <span className="text-[11px] text-[var(--muted)]">{relativeTime(d.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-white/80">{d.selectedAction}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card p-4">
          <p className="mb-2 text-sm font-medium text-white/90">Recent CRM activity</p>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-white/80">{a.action}</span>
                  <span className="text-[11px] text-[var(--muted)]">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {agentDbReady && runningExperiments.length > 0 && (
        <div className="surface-card mt-6 p-4">
          <p className="mb-2 text-sm font-medium text-white/90">Running experiments</p>
          <ul className="space-y-2">
            {runningExperiments.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="text-white/80">{e.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {e.variants.length} variant{e.variants.length !== 1 ? "s" : ""} · min {e.minSampleSizePerVariant}/variant
                  {suppressedCount > 0 && ` · ${suppressedCount} suppressed contact${suppressedCount !== 1 ? "s" : ""}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
