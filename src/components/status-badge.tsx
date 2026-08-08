const STYLES: Record<string, string> = {
  needs_review: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  qualified: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  disqualified: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

const LABELS: Record<string, string> = {
  needs_review: "Needs review",
  qualified: "Qualified",
  disqualified: "Disqualified",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STYLES[status] ?? "bg-neutral-100 text-neutral-500"}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
