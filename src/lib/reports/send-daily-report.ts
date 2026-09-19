import "server-only";
import { db } from "@/db";
import { dailyReportSends } from "@/db/schema";
import { ALLOWED_EMAILS } from "@/lib/auth/allowlist";
import { sendEmailViaGmail } from "@/lib/integrations/gmail-multi";
import { utcToLocalParts } from "@/lib/booking/timezone";
import { generateDailyReport, todayKey, REPORT_TIMEZONE } from "./daily-report";
import { formatDailyReportEmail } from "./format-email";

export type SendDailyReportResult =
  | { sent: false; reason: "already_sent" | "not_yet_5pm" }
  | { sent: true; date: string; recipients: string[]; failures: string[] };

/**
 * Sends today's effort report to every allow-listed user (Gavin, Noah — see
 * allowlist.ts, the same 2-person list this whole app is scoped to) once
 * it's past 5pm in REPORT_TIMEZONE, at most once per calendar day.
 *
 * The cron workflow polls every 15 minutes around the clock (see
 * .github/workflows/cron.yml), so this function — not the schedule — is what
 * decides whether it's actually time. The insert into daily_report_sends is
 * the idempotency guard: it races safely because dateKey is the primary key,
 * so a duplicate call for the same day fails the insert instead of sending
 * twice.
 */
export async function sendDailyReportIfDue(now = new Date()): Promise<SendDailyReportResult> {
  const local = utcToLocalParts(now, REPORT_TIMEZONE);
  if (local.hour < 17) {
    return { sent: false, reason: "not_yet_5pm" };
  }

  const dateKey = todayKey(REPORT_TIMEZONE);

  const inserted = await db
    .insert(dailyReportSends)
    .values({ dateKey })
    .onConflictDoNothing({ target: dailyReportSends.dateKey })
    .returning({ dateKey: dailyReportSends.dateKey });

  if (inserted.length === 0) {
    return { sent: false, reason: "already_sent" };
  }

  const report = await generateDailyReport(dateKey, REPORT_TIMEZONE);
  const { subject, body } = formatDailyReportEmail(report);

  const failures: string[] = [];
  const recipients: string[] = [];
  for (const to of ALLOWED_EMAILS) {
    try {
      await sendEmailViaGmail({ to, subject, body, accountIndex: 0 });
      recipients.push(to);
    } catch (err) {
      console.error(`Daily report email failed for ${to}:`, err);
      failures.push(to);
    }
  }

  return { sent: true, date: dateKey, recipients, failures };
}
