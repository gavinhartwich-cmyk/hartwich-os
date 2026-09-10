import { NextResponse } from "next/server";
import { db } from "@/db";
import { getWarmupPhase, isWarmupComplete, shouldResetDailyCounter } from "@/lib/warmup/schedule";

export type AccountWarmupStatus = {
  accountIndex: 0 | 1 | 2;
  fromAddress: string | null;
  warmupStatus: string;
  daysSinceStart: number;
  /** null = fully warmed up, no daily cap. */
  dailyLimit: number | null;
  sentToday: number;
  lastSentAt: string | null;
  complete: boolean;
  configured: boolean;
};

/**
 * GET /api/cleanup/warmup — per-account sending warm-up status for the
 * Cleanup tab. Reads src/lib/warmup/schedule.ts's own ramp logic (the same
 * code send-guard.ts actually enforces before every send) rather than
 * re-deriving it, so this can never drift from what's actually allowed to
 * go out. From-addresses come from env (GMAIL_FROM_ADDRESS_1..3) — the
 * email_send_accounts table itself has no address column, only ramp state.
 */
export async function GET() {
  const rows = await db.query.emailSendAccounts.findMany();
  const byIndex = new Map(rows.map((r) => [r.accountIndex, r]));

  const accounts: AccountWarmupStatus[] = ([0, 1, 2] as const).map((accountIndex) => {
    const row = byIndex.get(accountIndex);
    const fromAddress = process.env[`GMAIL_FROM_ADDRESS_${accountIndex + 1}`] ?? null;
    const configured = !!process.env[`GMAIL_REFRESH_TOKEN_${accountIndex + 1}`];

    if (!row) {
      return {
        accountIndex,
        fromAddress,
        warmupStatus: "not_started",
        daysSinceStart: 0,
        dailyLimit: getWarmupPhase(null).dailyLimit,
        sentToday: 0,
        lastSentAt: null,
        complete: false,
        configured,
      };
    }

    const { daysSinceStart, dailyLimit } = getWarmupPhase(row.warmupStartedAt);
    const sentToday = shouldResetDailyCounter(row.lastSendResetAt) ? 0 : row.dailySendCount;

    return {
      accountIndex,
      fromAddress,
      warmupStatus: row.warmupStatus,
      daysSinceStart,
      dailyLimit: row.warmupStatus === "ready" ? null : dailyLimit,
      sentToday,
      lastSentAt: row.lastSentAt?.toISOString() ?? null,
      complete: isWarmupComplete(row.warmupStartedAt),
      configured,
    };
  });

  return NextResponse.json({ accounts });
}
