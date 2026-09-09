"use client";

import { useState, useTransition } from "react";
import { Pause, Play } from "lucide-react";
import { setOutreachPaused } from "@/lib/actions/ai-workforce";

export default function KillSwitch({
  initialPaused,
  initialReason,
  canControl,
}: {
  initialPaused: boolean;
  initialReason: string | null;
  /** Gavin only — see src/lib/actions/ai-workforce.ts's own gate, which this only mirrors for the UI (the server action re-checks). */
  canControl: boolean;
}) {
  const [paused, setPaused] = useState(initialPaused);
  const [reason, setReason] = useState(initialReason ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !paused;
    setError(null);
    startTransition(async () => {
      try {
        await setOutreachPaused(next, next ? reason || "Paused from the dashboard" : null);
        setPaused(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white/90">Autonomous outreach</p>
          <p className={`text-xs ${paused ? "text-rose-300" : "text-emerald-300"}`}>
            {paused ? `Paused${initialReason ? ` — ${initialReason}` : ""}` : "Running"}
          </p>
        </div>
        {canControl ? (
          <button
            onClick={toggle}
            disabled={pending}
            className={paused ? "btn-primary" : "btn-secondary"}
            aria-label={paused ? "Resume outreach" : "Pause outreach"}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {pending ? "Working…" : paused ? "Resume" : "Pause"}
          </button>
        ) : (
          <span className="text-xs text-[var(--muted)]">Gavin only</span>
        )}
      </div>
      {canControl && !paused && (
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason if you pause (optional)"
          className="input-field mt-3 text-xs"
        />
      )}
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
