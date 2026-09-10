/**
 * Email warm-up scheduler for Hartwich OS.
 *
 * State is tracked per *sending account* (email_send_accounts, one row per
 * rotating Gmail mailbox), not per recipient — a daily cap only means
 * anything if it limits how much one mailbox sends across every company it
 * emails today. See the comment on email_send_accounts in src/db/schema.ts
 * for why this used to live on `companies` and didn't actually work.
 *
 * Ramp (cold-outreach guidance for a mailbox with no prior sending history —
 * meaningfully slower than Gmail's own ~500/day account limit, because this
 * is about the account's *reputation*, not its technical ceiling):
 *   Days  1-3:   3/day
 *   Days  4-7:   5/day
 *   Days  8-14: 10/day
 *   Days 15-21: 20/day
 *   Days 22-28: 35/day
 *   Days 29+:   50/day (steady state)
 *
 * Daily counter resets at midnight Winnipeg time (UTC-5/-6). Sends are also
 * spaced a minimum interval apart — a daily cap alone doesn't stop a burst
 * of 10 emails in 2 minutes, which reads as bot behavior even under the cap.
 */

const WINNIPEG_TIMEZONE = "America/Winnipeg";

// Ascending by day-threshold; the last matching entry (days >= from) wins.
const WARMUP_RAMP: { fromDay: number; dailyLimit: number }[] = [
  { fromDay: 0, dailyLimit: 3 },
  { fromDay: 4, dailyLimit: 5 },
  { fromDay: 8, dailyLimit: 10 },
  { fromDay: 15, dailyLimit: 20 },
  { fromDay: 22, dailyLimit: 35 },
  { fromDay: 29, dailyLimit: 50 },
];
const WARMUP_TOTAL_RAMP_DAYS = 29;

const MIN_SEND_SPACING_MINUTES = 25;

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

/**
 * The ramp position for a mailbox that has sent on `activeSendDays` distinct
 * days (see email_send_accounts.active_send_days).
 *
 * Counts *sending* days, not elapsed calendar days. An idle mailbox builds
 * no sender reputation, so it must not graduate to a higher cap — under the
 * old calendar rule an account silent for three weeks would have been
 * cleared for 35/day having sent almost nothing, which is the exact pattern
 * warm-up exists to avoid.
 *
 * `activeSendDays` counts today once it has sent, so the tier is keyed off
 * days *completed before* today (`activeSendDays - 1`). That preserves the
 * original ramp's shape: the first four sending days allow 3/day, the fifth
 * moves to 5/day, and so on.
 */
export function getWarmupPhase(activeSendDays: number | null | undefined): {
  activeSendDays: number;
  dailyLimit: number;
} {
  const days = Math.max(0, activeSendDays ?? 0);
  const completedDays = Math.max(0, days - 1);

  let dailyLimit = WARMUP_RAMP[0].dailyLimit;
  for (const tier of WARMUP_RAMP) {
    if (completedDays >= tier.fromDay) dailyLimit = tier.dailyLimit;
  }

  return { activeSendDays: days, dailyLimit };
}

/**
 * Whether a send landing at `at` is this mailbox's first of that Winnipeg
 * day — i.e. whether it should push `active_send_days` up by one.
 */
export function startsNewSendDay(lastSentAt: Date | null | undefined, at: Date = new Date()): boolean {
  if (!lastSentAt) return true;
  return lastSentAt.getTime() < getTodayMidnightWinnipeg(at).getTime();
}

export function canSendEmail(
  warmupStatus: string,
  dailySendCount: number,
  activeSendDays: number | null | undefined,
  lastSentAt?: Date | null
): { allowed: boolean; reason?: string } {
  if (warmupStatus !== "ready" && warmupStatus !== "warming_up" && warmupStatus !== "not_started") {
    return { allowed: false, reason: `Invalid warmup status: ${warmupStatus}` };
  }

  // Minimum spacing between sends applies regardless of warm-up phase — a
  // burst of sends looks bot-like even from a fully warmed-up account.
  if (lastSentAt) {
    const minutesSinceLastSend = (Date.now() - lastSentAt.getTime()) / 60_000;
    if (minutesSinceLastSend < MIN_SEND_SPACING_MINUTES) {
      const waitMinutes = Math.ceil(MIN_SEND_SPACING_MINUTES - minutesSinceLastSend);
      return { allowed: false, reason: `Too soon since last send — wait ${waitMinutes} more minute(s).` };
    }
  }

  if (warmupStatus === "ready") {
    return { allowed: true };
  }

  // A mailbox that hasn't sent today is on its first send of a new sending
  // day, which will take active_send_days up by one — so the cap it's held
  // to is the one for that upcoming day, not the finished one.
  const effectiveDays = (activeSendDays ?? 0) + (startsNewSendDay(lastSentAt) ? 1 : 0);
  const { dailyLimit } = getWarmupPhase(effectiveDays);

  if (dailySendCount >= dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${dailyLimit}/day). Sent ${dailySendCount} today.`,
    };
  }

  return { allowed: true };
}

/** Complete once the mailbox has actually sent on WARMUP_TOTAL_RAMP_DAYS distinct days. */
export function isWarmupComplete(activeSendDays: number | null | undefined): boolean {
  return (activeSendDays ?? 0) >= WARMUP_TOTAL_RAMP_DAYS;
}
