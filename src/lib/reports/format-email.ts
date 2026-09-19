import { getAppUrl } from "@/lib/utils/app-url";
import type { AttentionItem, DailyReport } from "./daily-report";

const SEVERITY_LABEL: Record<AttentionItem["severity"], string> = {
  high: "‼",
  medium: "!",
  low: "·",
};

function formatDateHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/**
 * Plain text, matching notifyOps's style — this is an internal ops email,
 * not marketing copy, and sendEmailViaGmail converts plain text to HTML
 * itself. No AI narration: every line here is a number straight out of
 * generateDailyReport, so re-sending the same past day produces byte-for-byte
 * the same email.
 */
export function formatDailyReportEmail(report: DailyReport): { subject: string; body: string } {
  const s = report.scorecard;
  const lines: string[] = [];

  lines.push(`Daily effort report — ${formatDateHeading(report.date)}`);
  if (report.isWeekend) lines.push("(weekend)");
  lines.push("");

  if (report.attention.length > 0) {
    lines.push("ATTENTION REQUIRED");
    for (const item of report.attention) {
      lines.push(`  ${SEVERITY_LABEL[item.severity]} ${item.title}`);
      lines.push(`    ${item.detail}`);
    }
    lines.push("");
  }

  lines.push("SCORECARD");
  lines.push(`  New leads: ${s.newLeads}`);
  lines.push(`  Emails out: ${s.emailsOut}`);
  lines.push(`  Reply rate: ${pct(s.replyRatePct)} (${s.replies} replies)`);
  lines.push(`  Bounce rate: ${pct(s.bounceRatePct)} (${s.bounces} bounced)`);
  lines.push(`  Emails opened: ${s.emailsOpened}`);
  lines.push(`  Meetings booked: ${s.meetingsBooked}`);
  lines.push(`  Deals won / lost: ${s.dealsWon} / ${s.dealsLost}`);
  lines.push("");

  lines.push("BY PERSON");
  for (const p of report.people) {
    lines.push(`  ${p.name} — ${p.totalTouches} touches`);
    lines.push(
      `    emails ${p.emailsSentByHand}, AI drafts approved ${p.aiDraftsApproved}, calls ${p.callsLogged}, meetings ${p.meetingsLogged}`
    );
    lines.push(
      `    LinkedIn: ${p.linkedinMessagesSent} sent, ${p.linkedinFollowUpsSent} follow-ups, ${p.linkedinRepliesLogged} replies logged, ${p.linkedinMeetingsBooked} meetings`
    );
    lines.push(`    tasks completed: ${p.tasksCompleted}`);
  }
  const unattributed = report.unattributed.activities + report.unattributed.linkedinEvents;
  if (unattributed > 0) {
    lines.push(`  (${unattributed} more record${unattributed === 1 ? "" : "s"} logged with no owner attached)`);
  }
  lines.push("");

  lines.push("AI TEAM");
  lines.push(`  Leads discovered: ${report.ai.leadsDiscovered}`);
  lines.push(`  Drafts generated: ${report.ai.draftsGenerated}`);
  lines.push(`  Sent autonomously: ${report.ai.emailsSentAutonomously}`);
  lines.push(`  Replies processed: ${report.ai.repliesProcessed}`);
  lines.push(`  Runs: ${report.ai.runsSucceeded} succeeded, ${report.ai.runsFailed} failed`);
  lines.push(`  Cost: $${report.ai.costUsd.toFixed(2)} (${report.ai.tokensUsed.toLocaleString()} tokens)`);
  lines.push("");

  const base = getAppUrl();
  if (base) lines.push(`Full report: ${base}/reports?date=${report.date}`);

  const attentionFlag = report.attention.some((a) => a.severity === "high") ? " ⚠" : "";
  return {
    subject: `[Hartwich OS] Daily report — ${report.date}${attentionFlag}`,
    body: lines.join("\n"),
  };
}
