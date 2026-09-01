# Phase 6: Public Booking Page (Calendly-style)

## ✅ What's Built

### Database Layer
- `booking_settings` — single-row config: how many days out prospects can
  book, meeting length, minimum notice, timezone, working days/hours.
- `booking_questions` — the customizable questionnaire shown after a
  prospect picks a time. Three core fields (Full name / Email / Phone) are
  seeded and can't be deleted from the UI since reminders depend on them;
  anything else Gavin adds is free-form (text/paragraph/dropdown).
- `bookings` — one row per confirmed slot: prospect info, full
  questionnaire answers, the linked Google Calendar event id, and four
  reminder-sent timestamps (email/SMS × 24h/1h before).

### Public booking page — `/book`
- No login required, no nav chrome — a standalone page.
- Step 1: pick a day/time from **real availability**, computed live from
  Gavin's Google Calendar free/busy (not a guess — see "What's needed"
  below).
- Step 2: the customizable questionnaire.
- Step 3: confirmation. A confirmation email goes to the prospect and a
  notification email goes to Gavin, both from the `hartwichlabs@gmail.com`
  outreach account.
- Optional `?company=<id>&contact=<id>&deal=<id>` query params link the
  booking back to a CRM record (e.g. from a button on a company page or an
  outreach email) — the page works as a bare public link too.
- Booking a slot creates a real event on Gavin's Google Calendar with the
  prospect as an attendee, and re-checks the slot is still free
  server-side right before confirming (race guard).

### Booking admin — `/calendar/settings` (**Gavin-only**)
- Not visible to Noah at all: hidden from the nav, and every
  `/api/booking/*` admin route 401s for anyone whose email isn't
  `gavinhartwich@gmail.com` (see `isBookingAdmin` in
  `lib/auth/allowlist.ts`) — Noah stays a full CRM user, just not a
  booking admin.
- Copy-able booking link.
- Availability rules: booking window (days out — this is the "don't let
  them book 4 months out" control), meeting length, minimum notice,
  working days/hours, timezone.
- Questionnaire builder: add/edit/reorder/remove questions (core fields
  protected from removal).
- Upcoming bookings list with one-click cancel (removes the Google
  Calendar event too).

### Reminders
- `src/lib/booking/reminders.ts` + `/api/cron/send-reminders`, polled
  every 15 min by a new Zo background service
  (`hartwich-os-booking-reminders`, same pattern as the existing
  reply-sync loop) — sends an email 24h and 1h before each booking.
- SMS reminders at the same 24h/1h marks, via Twilio — **no-ops until
  Twilio is configured** (see below), same "optional, fails closed"
  pattern as Slack notifications. Email reminders always fire regardless.
- Idempotent — each reminder is a nullable timestamp column, so a missed
  cron tick just catches up on the next run rather than double-sending.

## 🔧 Setup Required

### Required: Google Calendar OAuth
Without this, `/book` shows "booking isn't available" — it deliberately
refuses to invent availability rather than risk double-booking you.
Same OAuth Playground process as Gmail, but scope `.../auth/calendar`
against your own Google account:
```
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_REFRESH_TOKEN=
```

### Optional: Twilio (SMS reminders)
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```
Get these from console.twilio.com. Without them, prospects still get
email reminders — they just don't get texts. One known limitation: a
booking's SMS-sent flag only gets set when an SMS actually goes out, but
the reminder is only re-checked while its *email* flag is still unset —
so if Twilio gets configured after a booking has already had its email
reminder sent, that particular booking won't retroactively get a text.
New bookings made after Twilio is configured are unaffected.

## Known trade-offs
- Bookings are **not** shown on the internal `/calendar` page (the one
  both Gavin and Noah use for CRM follow-ups) — keeping the prospect
  questionnaire answers and the booking list Gavin-only, per the "Noah
  doesn't need this" requirement, was simpler than building a second
  visibility layer into the shared calendar. Upcoming bookings are visible
  on `/calendar/settings` instead.
- No calendar/questionnaire UI library was added — the day/time picker and
  admin forms are hand-rolled Tailwind, matching how `/calendar` (Phase 5)
  was built, to stay inside the project's existing zero-extra-frontend-
  dependency convention.

---

Live on the production deployment as of 2026-08-23. The booking page,
admin settings, and reminder loop all work end-to-end today — the single
blocker is the Google Calendar OAuth tokens above.
