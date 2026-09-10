import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/page-header";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { isAgentDbConfigured } from "@/db/agent-workforce/client";
import { listRecentAgentRuns, listRecentForecasts, listRecentManagerDecisions, type AgentRunSummary } from "@/lib/data/ai-workforce";
import { CAPABILITIES, type CapabilityKey } from "@/lib/data/ai-workforce-capabilities";

export const dynamic = "force-dynamic";

function isCapabilityKey(v: string): v is CapabilityKey {
  return v in CAPABILITIES;
}

function relativeTime(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const STATUS_COLOR: Record<string, string> = {
  succeeded: "text-emerald-300",
  failed: "text-rose-300",
  denied: "text-amber-300",
};

function RunRow({ run }: { run: AgentRunSummary }) {
  return (
    <details className="surface-card group p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`text-xs font-medium ${STATUS_COLOR[run.status] ?? "text-white/60"}`}>{run.status}</span>
          <span className="truncate text-sm text-white/80">{run.agentId}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-[var(--muted)]">
          <span>{run.model}</span>
          <span>{relativeTime(run.startedAt)}</span>
          <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
        </div>
      </summary>
      <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3 text-xs">
        {run.error && <p className="text-rose-300">{run.error}</p>}
        <div>
          <p className="mb-1 font-medium text-[var(--muted)]">Input</p>
          <pre className="overflow-x-auto rounded bg-black/30 p-2 text-white/70">{JSON.stringify(run.input, null, 2)}</pre>
        </div>
        <div>
          <p className="mb-1 font-medium text-[var(--muted)]">Output</p>
          <pre className="overflow-x-auto rounded bg-black/30 p-2 text-white/70">{JSON.stringify(run.output, null, 2)}</pre>
        </div>
        {run.toolCalls.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-[var(--muted)]">Tool calls ({run.toolCalls.length})</p>
            <pre className="overflow-x-auto rounded bg-black/30 p-2 text-white/70">{JSON.stringify(run.toolCalls, null, 2)}</pre>
          </div>
        )}
      </div>
    </details>
  );
}

/**
 * Gavin-only, same gate and same defensive-redirect pattern as the parent
 * /ai-workforce page (see that page.tsx's own comment).
 */
export default async function CapabilityPage({ params }: { params: Promise<{ capability: string }> }) {
  const { capability } = await params;
  if (!isCapabilityKey(capability)) notFound();

  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    redirect("/board");
  }

  const meta = CAPABILITIES[capability];
  const agentDbReady = isAgentDbConfigured();

  return (
    <div>
      <PageHeader title={meta.label} subtitle={meta.description} back={{ href: "/ai-workforce", label: "AI Workforce" }} />

      <section className="surface-card mb-6 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-white/90">Configuration</p>
          <p className="text-[11px] text-[var(--muted)]">Read-only — set in {meta.config.sourceFile}</p>
        </div>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {meta.config.values.map((v) => (
            <div key={v.label} className="text-sm">
              <dt className="text-xs text-[var(--muted)]">{v.label}</dt>
              <dd className="text-white/80">{v.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-[var(--muted-2)]">
          No live editing yet — changing this requires an edit + redeploy in the ai-workforce repo. A real
          settings screen (a config table both repos read/write, replacing these hardcoded values) is a bigger
          follow-up, not built here.
        </p>
      </section>

      {!agentDbReady ? (
        <p className="text-sm text-[var(--muted)]">
          AGENT_DATABASE_URL isn&apos;t set — no run history available. See the main AI Workforce page.
        </p>
      ) : (
        <RecentActivity capability={capability} />
      )}
    </div>
  );
}

async function RecentActivity({ capability }: { capability: CapabilityKey }) {
  const meta = CAPABILITIES[capability];

  if (meta.agentIds) {
    const runs = await listRecentAgentRuns(meta.agentIds, 20);
    return (
      <section>
        <p className="mb-2 text-sm font-medium text-white/90">Recent runs</p>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing run yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </div>
        )}
      </section>
    );
  }

  if (capability === "analyst") {
    const forecasts = await listRecentForecasts(20);
    return (
      <section>
        <p className="mb-2 text-sm font-medium text-white/90">Recent forecast snapshots</p>
        {forecasts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {forecasts.map((f) => (
              <li key={f.id} className="surface-card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/80">{f.goalMetric}</span>
                  <span className="text-[11px] text-[var(--muted)]">{relativeTime(f.asOf)}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {f.currentValue} now → projected {f.projectedFinal} ({f.probability}% confidence, {f.status})
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (capability === "manager") {
    const decisions = await listRecentManagerDecisions(20);
    return (
      <section>
        <p className="mb-2 text-sm font-medium text-white/90">Recent decisions</p>
        {decisions.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No decisions recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {decisions.map((d) => (
              <li key={d.id} className="surface-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium ${d.isEscalation ? "text-amber-300" : "text-emerald-300"}`}>
                    {d.goalMetric}
                  </span>
                  <span className="text-[11px] text-[var(--muted)]">{relativeTime(d.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-white/80">{d.selectedAction}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{d.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  // crm — this app's own audit_log, always live regardless of AGENT_DATABASE_URL.
  return (
    <p className="text-sm text-[var(--muted)]">
      See &quot;Recent CRM activity&quot; on the main AI Workforce page — it reads this app&apos;s own audit
      log directly, no separate view needed here.
    </p>
  );
}
