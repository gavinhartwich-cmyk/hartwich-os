// Pure — no DB, no clock other than what's passed in. Same reasoning as
// src/lib/emails/cadence.ts: figuring out "is this due" shouldn't need a
// database round-trip to unit-test.

export type LinkedInEvent = { occurredAt: Date };

/** First follow-up: 3 days after the initial message (same urgency as the email cadence). Every one after that: a steady weekly rhythm, indefinitely — unlike email, there's no reason to ever stop reminding on a live LinkedIn contact; `active: false` (archiving) is the deliberate way to stop, not a cadence cap. */
const FIRST_FOLLOW_UP_DAYS = 3;
const STEADY_FOLLOW_UP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** null means "not tracked as due" — no contact yet (nothing to follow up on). */
export function nextFollowUpDueAt(events: LinkedInEvent[]): Date | null {
  if (events.length === 0) return null;
  const last = events[events.length - 1];
  const intervalDays = events.length === 1 ? FIRST_FOLLOW_UP_DAYS : STEADY_FOLLOW_UP_DAYS;
  return new Date(last.occurredAt.getTime() + intervalDays * DAY_MS);
}

export function isFollowUpDue(events: LinkedInEvent[], now: Date = new Date()): boolean {
  const dueAt = nextFollowUpDueAt(events);
  return dueAt != null && now >= dueAt;
}
