/**
 * Hartwich OS has no public sign-up (architecture doc §4). Accounts are
 * created out-of-band by an admin (see scripts/create-auth-users.ts);
 * anyone who authenticates but isn't on this list gets rejected at
 * session-check time, in proxy.ts.
 *
 * To add a teammate: add their email here and run the create-users
 * script again. That's the whole change — no schema migration, no
 * redeploy of anything else.
 */
export const ALLOWED_EMAILS = [
  "gavinhartwich@gmail.com",
  "noahhartwich@gmail.com",
] as const;

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase() as (typeof ALLOWED_EMAILS)[number]);
}

/**
 * The booking system (Phase 6) is Gavin-only — his own calendar/availability,
 * so Noah shouldn't see or manage booking settings, the questionnaire, or
 * the bookings list even though he's otherwise a full allow-listed user.
 */
const BOOKING_ADMIN_EMAIL = "gavinhartwich@gmail.com";

export function isBookingAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === BOOKING_ADMIN_EMAIL;
}
