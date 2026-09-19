import Link from "next/link";
import PageHeader from "@/components/page-header";
import {
  generateDailyReport,
  todayKey,
  REPORT_TIMEZONE,
  type AttentionItem,
} from "@/lib/reports/daily-report";

export const dynamic = "force-dynamic";

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  // Noon UTC, not midnight — a UTC-midnight Date for a Winnipeg day can
  // roll to the wrong calendar day once shifted, noon never does.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function formatDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SEVERITY_STYLE: Record<AttentionItem["severity"], string> = {
  high: "border-red-500/25 bg-red-500/[0.07] text-red-300",
  medium: "border-amber-500/25 bg-amber-500/[0.07] text-amber-300",
  low: "border-white/10 bg-white/[0.03] text-[var(--muted)]",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs tracking-wide text-[var(--muted)] uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const dateKey = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey();
  const report = await generateDailyReport(dateKey);
  const isToday = dateKey === todayKey();

  return (
    <div>
      <PageHeader
        title="Daily Report"
        subtitle={`${formatDateHeading(dateKey)} · ${REPORT_TIMEZONE}${report.isWeekend ? " · weekend" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/reports?date=${shiftDateKey(dateKey, -1)}`} className="btn-secondary">
              ← Prior day
            </Link>
            {!isToday && (
              <Link href="/reports" className="btn-secondary">
                Today
              </Link>
            )}
            <Link
              href={`/reports?date=${shiftDateKey(dateKey, 1)}`}
              className={`btn-secondary ${isToday ? "pointer-events-none opacity-40" : ""}`}
            >
              Next day →
            </Link>
          </div>
        }
      />

      {report.attention.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-white/90">Attention Required</h2>
          <div className="space-y-2">
            {report.attention.map((item) => (
              <div key={item.code} className={`rounded-lg border px-4 py-3 text-sm ${SEVERITY_STYLE[item.severity]}`}>
                <p className="font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs opacity-80">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-white/90">Scorecard</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="New leads" value={report.scorecard.newLeads} />
          <StatCard label="Emails out" value={report.scorecard.emailsOut} />
          <StatCard
            label="Reply rate"
            value={report.scorecard.replyRatePct === null ? "—" : `${report.scorecard.replyRatePct}%`}
            sub={`${report.scorecard.replies} replies`}
          />
          <StatCard
            label="Bounce rate"
            value={report.scorecard.bounceRatePct === null ? "—" : `${report.scorecard.bounceRatePct}%`}
            sub={`${report.scorecard.bounces} bounced`}
          />
          <StatCard label="Meetings booked" value={report.scorecard.meetingsBooked} />
          <StatCard label="Deals won" value={report.scorecard.dealsWon} />
          <StatCard label="Deals lost" value={report.scorecard.dealsLost} />
          <StatCard label="Emails opened" value={report.scorecard.emailsOpened} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-white/90">By person</h2>
        <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs tracking-wide text-[var(--muted)] uppercase">
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Emails sent</th>
                <th className="px-4 py-3 font-medium">AI drafts approved</th>
                <th className="px-4 py-3 font-medium">Calls</th>
                <th className="px-4 py-3 font-medium">Meetings</th>
                <th className="px-4 py-3 font-medium">LinkedIn msgs</th>
                <th className="px-4 py-3 font-medium">LinkedIn follow-ups</th>
                <th className="px-4 py-3 font-medium">Tasks done</th>
                <th className="px-4 py-3 font-medium">Total touches</th>
              </tr>
            </thead>
            <tbody>
              {report.people.map((p) => (
                <tr key={p.userId} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-3 font-medium text-white/90">{p.name}</td>
                  <td className="px-4 py-3 text-white/70">{p.emailsSentByHand}</td>
                  <td className="px-4 py-3 text-white/70">{p.aiDraftsApproved}</td>
                  <td className="px-4 py-3 text-white/70">{p.callsLogged}</td>
                  <td className="px-4 py-3 text-white/70">{p.meetingsLogged}</td>
                  <td className="px-4 py-3 text-white/70">{p.linkedinMessagesSent}</td>
                  <td className="px-4 py-3 text-white/70">{p.linkedinFollowUpsSent}</td>
                  <td className="px-4 py-3 text-white/70">{p.tasksCompleted}</td>
                  <td className="px-4 py-3 font-medium text-white">{p.totalTouches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(report.unattributed.activities > 0 || report.unattributed.linkedinEvents > 0) && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            {report.unattributed.activities + report.unattributed.linkedinEvents} additional record
            {report.unattributed.activities + report.unattributed.linkedinEvents === 1 ? "" : "s"} logged
            with no owner attached, not reflected above.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-white/90">AI team</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Leads discovered" value={report.ai.leadsDiscovered} />
          <StatCard label="Drafts generated" value={report.ai.draftsGenerated} />
          <StatCard label="Sent autonomously" value={report.ai.emailsSentAutonomously} />
          <StatCard label="Replies processed" value={report.ai.repliesProcessed} />
          <StatCard
            label="Runs"
            value={report.ai.runsSucceeded}
            sub={report.ai.runsFailed > 0 ? `${report.ai.runsFailed} failed` : "0 failed"}
          />
          <StatCard label="Cost" value={`$${report.ai.costUsd.toFixed(2)}`} sub={`${report.ai.tokensUsed.toLocaleString()} tokens`} />
        </div>
      </section>
    </div>
  );
}
