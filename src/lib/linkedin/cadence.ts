// Pure — no DB, no clock other than what's passed in. Same reasoning as
// src/lib/emails/cadence.ts: figuring out "is this due" shouldn't need a
// database round-trip to unit-test.

export type LinkedInEventType =
  | "message_sent"
  | "follow_up_sent"
  | "reply_received"
  | "meeting_booked"
  | "not_interested"
  | "no_response";

export type LinkedInEvent = { occurredAt: Date; type: LinkedInEventType };

/** First follow-up: 3 days after the initial message (same urgency as the email cadence). Every one after that: a steady weekly rhythm, indefinitely — unlike email, there's no reason to ever stop reminding on a live LinkedIn contact; `active: false` (archiving) is the deliberate way to stop, not a cadence cap. */
const FIRST_FOLLOW_UP_DAYS = 3;
const STEADY_FOLLOW_UP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 2026-09-17: once someone actually replies, books a meeting, or says
 * they're not interested, there's nothing left to "follow up" on — the
 * conversation moved past the cold-outreach cadence entirely. Logging one
 * of these used to still leave the contact due for another follow-up in
 * 3-7 days ("Hartwich OS telling you to follow up with John when John
 * just replied to you" — the exact bug this fixes). A terminal event as
 * the LAST event stops the cadence outright; if a later event is logged
 * after a terminal one (e.g. the conversation cooled off after a reply
 * and it's worth a nudge again), the cadence picks back up from that
 * newer event, same as any other event.
 */
const TERMINAL_EVENT_TYPES = new Set<LinkedInEventType>(["reply_received", "meeting_booked", "not_interested"]);

/** null means "not tracked as due" — no contact yet, or the last thing that happened ended the cadence (see TERMINAL_EVENT_TYPES). */
export function nextFollowUpDueAt(events: LinkedInEvent[]): Date | null {
  if (events.length === 0) return null;
  const last = events[events.length - 1];
  if (TERMINAL_EVENT_TYPES.has(last.type)) return null;
  const intervalDays = events.length === 1 ? FIRST_FOLLOW_UP_DAYS : STEADY_FOLLOW_UP_DAYS;
  return new Date(last.occurredAt.getTime() + intervalDays * DAY_MS);
}

export function isFollowUpDue(events: LinkedInEvent[], now: Date = new Date()): boolean {
  const dueAt = nextFollowUpDueAt(events);
  return dueAt != null && now >= dueAt;
}

export type LinkedInStatus = "not_contacted" | "waiting_for_reply" | "replied" | "meeting_booked" | "not_interested" | "no_response";

const STATUS_FOR_TERMINAL: Partial<Record<LinkedInEventType, LinkedInStatus>> = {
  reply_received: "replied",
  meeting_booked: "meeting_booked",
  not_interested: "not_interested",
  no_response: "no_response",
};

/** Status is always derived from the event history, never stored/settable on its own — "Reply Received" IS what makes the status "Replied", there's no separate status field to fall out of sync with it. */
export function deriveLinkedInStatus(events: LinkedInEvent[]): LinkedInStatus {
  if (events.length === 0) return "not_contacted";
  const last = events[events.length - 1];
  return STATUS_FOR_TERMINAL[last.type] ?? "waiting_for_reply";
}
