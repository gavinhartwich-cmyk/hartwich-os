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

export function getWinnipegDate(): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: WINNIPEG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const obj: any = {};
  parts.forEach((part: any) => {
    obj[part.type] = part.value;
  });

  return new Date(obj.year, obj.month - 1, obj.day, obj.hour, obj.minute, obj.second);
}

export function getTodayMidnightWinnipeg(): Date {
  const now = getWinnipegDate();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
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

  const now = getWinnipegDate();
  const daysSinceStart = Math.floor(
    (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

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

  const { phase, dailyLimit, daysSinceStart } = getWarmupPhase(warmupStartedAt);

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
