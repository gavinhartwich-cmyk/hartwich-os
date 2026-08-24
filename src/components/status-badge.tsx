const STYLES: Record<string, string> = {
  needs_review: "bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/20",
  qualified: "bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  disqualified: "bg-white/[0.04] text-white/40 ring-1 ring-inset ring-white/10",
};

const LABELS: Record<string, string> = {
  needs_review: "Needs review",
  qualified: "Qualified",
  disqualified: "Disqualified",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLES[status] ?? "bg-white/[0.04] text-white/40"}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
