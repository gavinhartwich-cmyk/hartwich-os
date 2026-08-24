"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Run = {
  id: string;
  area: string;
  targetCount: number;
  foundCount: number;
  radiusMiles: number | null;
  status: "running" | "completed" | "completed_partial" | "failed";
};

export default function DiscoveryProgress({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/discovery-runs/${runId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setRun(data.run);
            if (data.run.status === "running") {
              timer = setTimeout(poll, 2500);
            } else {
              router.refresh();
            }
          }
        }
      } catch {
        // best-effort — the page still works without this banner
      }
    }
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId, router]);

  if (!run || run.status !== "running") return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
      <span className="text-neutral-600 dark:text-neutral-300">
        Searching {run.area}
        {run.radiusMiles ? ` (expanded to ${run.radiusMiles}mi)` : ""} — {run.foundCount}/
        {run.targetCount} qualified so far…
      </span>
    </div>
  );
}
