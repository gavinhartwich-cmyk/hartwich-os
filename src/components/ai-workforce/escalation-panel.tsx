"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { decideEscalation } from "@/lib/actions/ai-workforce";
import type { PendingEscalation } from "@/lib/data/ai-workforce";

function percentLabel(value: number | null): string | null {
  if (value === null) return null;
  return `${value > 0 ? "+" : ""}${value}%`;
}

function riskLabel(risk: number | null): string {
  if (risk === null) return "unknown risk";
  if (risk >= 0.5) return "high risk";
  if (risk >= 0.25) return "moderate risk";
  return "low risk";
}

function EscalationCard({ escalation }: { escalation: PendingEscalation }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await decideEscalation(escalation.id, decision);
        setDecided(decision);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const change = percentLabel(escalation.proposedChangePercent);

  if (decided) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm text-white/70">
          {decided === "approved" ? (
            <>
              <span className="font-medium text-emerald-400">Approved.</span> The Sales Manager will carry this out on
              its next cycle (within 15 minutes).
            </>
          ) : (
            <>
              <span className="font-medium text-white/60">Rejected.</span> It won&apos;t ask again for this goal unless
              the situation changes.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
          {escalation.goalMetric}
        </span>
        {change && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">{change}</span>
        )}
        <span className="text-xs text-white/40">{riskLabel(escalation.risk)}</span>
      </div>

      <p className="mt-3 text-sm font-medium text-white">{escalation.action}</p>
      <p className="mt-2 text-sm text-white/60">{escalation.diagnosis}</p>
      <p className="mt-2 text-xs text-white/50">
        <span className="text-white/40">Needs you because:</span> {escalation.whyApprovalRequired}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => decide("approved")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white transition-all hover:bg-emerald-400 disabled:opacity-40"
        >
          <Check className="size-4" />
          Approve
        </button>
        <button
          onClick={() => decide("rejected")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 transition-all hover:bg-white/5 disabled:opacity-40"
        >
          <X className="size-4" />
          Reject
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}

/**
 * "Needs your decision" — the Sales Manager's escalations, with the buttons
 * that actually resolve them. Without this the manager could raise a
 * decision it wasn't allowed to take alone but never get an answer, so it
 * re-raised the same one every cycle forever.
 */
export function EscalationPanel({ escalations }: { escalations: PendingEscalation[] }) {
  if (escalations.length === 0) return null;

  return (
    <div className="surface-card mb-6 p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-amber-400" />
        <h2 className="font-semibold text-white">Needs your decision</h2>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
          {escalations.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-white/70">
        The Sales Manager wants to make these changes but they exceed what it&apos;s allowed to do on its own. Approving
        one lets it act on the next cycle.
      </p>
      <div className="mt-4 space-y-3">
        {escalations.map((e) => (
          <EscalationCard key={e.id} escalation={e} />
        ))}
      </div>
    </div>
  );
}
