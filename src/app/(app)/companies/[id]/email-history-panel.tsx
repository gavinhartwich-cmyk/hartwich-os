import type { EmailHistoryEntry, EmailHistoryStatus } from "@/lib/data/email-drafts";

// Same pill treatment as components/status-badge.tsx, keyed to the derived
// email status instead of a company status — kept local rather than
// generalizing that component for one more caller.
const STATUS_STYLES: Record<EmailHistoryStatus, string> = {
  bounced: "bg-red-400/10 text-red-300 ring-1 ring-inset ring-red-400/20",
  replied: "bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  opened: "bg-sky-400/10 text-sky-300 ring-1 ring-inset ring-sky-400/20",
  delivered: "bg-white/[0.06] text-white/60 ring-1 ring-inset ring-white/10",
  sent: "bg-white/[0.04] text-white/40 ring-1 ring-inset ring-white/10",
};

const STATUS_LABELS: Record<EmailHistoryStatus, string> = {
  bounced: "Bounced",
  replied: "Replied",
  opened: "Opened",
  delivered: "Delivered",
  sent: "Sent",
};

export default function EmailHistoryPanel({ history }: { history: EmailHistoryEntry[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-white/80">Email history</h2>

      {history.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted-2)]">No emails sent to this company yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="surface-card p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white/90">{entry.subject || "(no subject)"}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted-2)]">
                    To {entry.toAddress ?? "unknown"} · {new Date(entry.sentAt).toLocaleString()}
                    {entry.openCount > 0 ? ` · opened ${entry.openCount}x` : ""}
                  </p>
                  {entry.status === "bounced" && entry.bounceReason && (
                    <p className="mt-1 text-xs text-red-300/70 line-clamp-2">{entry.bounceReason}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[entry.status]}`}
                >
                  {STATUS_LABELS[entry.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
