/**
 * Email warm-up scheduler for Hartwich OS
 *
 * Manual warm-up strategy:
 * - Days 0-13: Max 5 emails/day
 * - Day 14+: Max 20 emails/day
 *
 * Daily counter resets at midnight Winnipeg time (UTC-5/-6)
 */

const WINNIPEG_TIMEZONE = "America/Winnipeg";
const WARMUP_PHASE_1_DAYS = 14;
const WARMUP_PHASE_1_DAILY_LIMIT = 5;
const WARMUP_PHASE_2_DAILY_LIMIT = 20;

/**
 * Winnipeg's UTC offset in minutes (e.g. -300 for UTC-5 during DST, -360 for
 * UTC-6 standard time) as of `at`. Positive = ahead of UTC, negative = behind.
 */
function winnipegOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WINNIPEG_TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(at);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const match = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

/**
 * The real UTC instant at which Winnipeg's local clock reads midnight on
 * whatever Winnipeg calendar date `at` falls on.
 *
 * Deliberately does NOT build this via `new Date(year, month, day, ...)` —
 * that constructor interprets its arguments in the server process's own
 * local timezone (UTC in most serverless deployments), not Winnipeg's, so
 * the result silently drifts by Winnipeg's UTC offset (5-6 hours) from the
 * instant it's meant to represent. This resolves the actual offset for the
 * target date (accounting for DST) and applies it explicitly instead.
 */
export function getTodayMidnightWinnipeg(at: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WINNIPEG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const utcMidnightCandidate = Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0);

  // Resolve DST using the offset in effect at the candidate instant itself
  // (fine here: Winnipeg's DST transitions happen at 2am local, never at
  // midnight, so this can't land on the wrong side of a transition).
  const offsetMinutes = winnipegOffsetMinutes(new Date(utcMidnightCandidate));
  return new Date(utcMidnightCandidate - offsetMinutes * 60_000);
}

export function shouldResetDailyCounter(lastResetAt: Date | null | undefined): boolean {
  if (!lastResetAt) return true;
  const todayMidnight = getTodayMidnightWinnipeg();
  return lastResetAt.getTime() < todayMidnight.getTime();
}

export function getWarmupPhase(startedAt: Date | null | undefined): {
  phase: 1 | 2;
  daysSinceStart: number;
  dailyLimit: number;
} {
  if (!startedAt) {
    return { phase: 1, daysSinceStart: 0, dailyLimit: WARMUP_PHASE_1_DAILY_LIMIT };
  }

  // Elapsed real time since a real timestamp — timezone-independent, so
  // this compares against the actual current instant (`new Date()`), not a
  // Winnipeg-shifted stand-in for it.
  const daysSinceStart = Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceStart < WARMUP_PHASE_1_DAYS) {
    return {
      phase: 1,
      daysSinceStart,
      dailyLimit: WARMUP_PHASE_1_DAILY_LIMIT,
    };
  }

  return {
    phase: 2,
    daysSinceStart,
    dailyLimit: WARMUP_PHASE_2_DAILY_LIMIT,
  };
}

export function canSendEmail(
  warmupStatus: string,
  dailySendCount: number,
  warmupStartedAt: Date | null | undefined
): { allowed: boolean; reason?: string } {
  if (warmupStatus === "ready") {
    return { allowed: true };
  }

  if (warmupStatus !== "warming_up" && warmupStatus !== "not_started") {
    return { allowed: false, reason: `Invalid warmup status: ${warmupStatus}` };
  }

  const { phase, dailyLimit } = getWarmupPhase(warmupStartedAt);

  if (dailySendCount >= dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${dailyLimit}/day in phase ${phase}). Sent ${dailySendCount} today.`,
    };
  }

  return { allowed: true };
}

export function isWarmupComplete(warmupStartedAt: Date | null | undefined): boolean {
  if (!warmupStartedAt) return false;
  const { daysSinceStart } = getWarmupPhase(warmupStartedAt);
  return daysSinceStart >= WARMUP_PHASE_1_DAYS;
}
