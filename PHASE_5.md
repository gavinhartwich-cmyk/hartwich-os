# Phase 5: Calendar / Booking

## ✅ What's Built

### Database Layer
- Extended the existing `tasks` table (didn't add a parallel `meetings`
  table — a task with a due date + duration *is* a calendar entry here):
  - `durationMinutes`: default 30
  - `location`: free text (phone, Zoom, address...)
  - `googleEventId` / `googleEventSyncedAt`: sync tracking

### Calendar Page
- **`/calendar`** — month-agenda view (prev/next month nav), grouped by
  day. Create a follow-up/meeting, optionally tied to a company. Mark
  done or delete inline.

### Google Calendar Sync (optional)
- `src/lib/integrations/google-calendar.ts` — single account (your own
  calendar). No-ops until env vars are set, so the calendar page works
  fully without it.
- Create/update/delete mirrored automatically when a task is created
  with "Sync to Google Calendar" checked, or deleted.

### API Routes
1. **GET `/api/tasks?from=&to=`** — list tasks in a date range
2. **POST `/api/tasks`** — create a task (+ optional calendar sync)
3. **PATCH `/api/tasks/[id]`** — complete or reschedule
4. **DELETE `/api/tasks/[id]`** — delete (removes synced calendar event too)

These also double as the endpoint a future voice assistant (JARVIS/Home
Assistant) could call to book a meeting by voice — no separate booking
API needed later.

## 🔧 Setup Required (optional — only for Google Calendar sync)

```
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_ACCESS_TOKEN=
GOOGLE_CALENDAR_REFRESH_TOKEN=
```

Same OAuth dance as the Gmail setup in `PHASE_3.md` — Google Cloud
Console, enable the Calendar API, generate a refresh token — see
`.env.example` for the full comment. Same blocker class as the Gmail
tokens: needs your manual Google Cloud Console action, not something I
can do from here.

The `/calendar` page itself needs **none of this** — it's fully usable
today against just the CRM database.

---

Live on the production deployment as of 2026-08-23. Nothing else required to start using it.
