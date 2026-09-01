# Hartwich OS — Migration off Zo Computer

Handoff doc for whichever AI/agent finishes moving this app's *hosting* off
Zo Computer. Written so that agent needs no prior context beyond this file
plus the repo itself. Supersedes SETUP.md §5 ("Vercel") for deployment
purposes — that section predates Phase 6 and is stale.

**Why this matters:** the owner (Gavin) wants Hartwich OS to keep running
even if his Zo Computer is unavailable. Today the *app process* and two
background loops run on Zo; nothing else does.

## Already true — do not re-migrate these

- **Database**: Supabase Postgres, not Zo. `DATABASE_URL` points at
  `aws-0-ca-central-1.pooler.supabase.com`. Auth also runs through
  Supabase (`@supabase/ssr`, `@supabase/supabase-js`).
- **Source code**: already on GitHub at
  `https://github.com/gavinhartwich-cmyk/hartwich-os`, branch `main`, up
  to date as of commit `7f5dca1`.
- **No hardcoded Zo references** anywhere in `src/` (verified by grep). The
  only Zo-specific line in the whole repo is `allowedDevOrigins` in
  `next.config.ts`, which only affects the local dev server — harmless to
  leave, fine to delete.

## What's actually Zo-dependent right now

1. **The app itself** — runs as a Zo "user service" (`next start`,
   persistent process) at `https://hartwich-os-dev-ev0.zocomputer.io`.
2. **Two polling loops**, also Zo user services (`mode: process`, no
   public endpoint), each an infinite `while true; sleep 900` shell loop:
   - `scripts/sync-replies-loop.sh` → `POST /api/cron/sync-replies` every
     15 min (pulls Gmail replies into the CRM across 3 inboxes).
   - `scripts/send-booking-reminders-loop.sh` → `POST
     /api/cron/send-reminders` every 15 min (24h/1h booking reminders).
   Both authenticate with `Authorization: Bearer $CRON_SECRET`, read from
   `.env.local` on the Zo box.

That's the entire list. Fixing these two things (hosting + the two loops)
is the entire migration.

## Already fixed in code (nothing further needed here)

`src/lib/actions/discover-leads.ts` used to kick off the "Find Leads"
background enrichment job with `setImmediate(...)`. That only reliably
finishes on an always-on process like Zo's — serverless platforms
(Vercel included) can freeze the invocation the instant the HTTP response
is sent, killing the callback mid-run. This was replaced with Next's
`after()` (`next/server`), which hooks into the platform's real
keep-alive mechanism, plus `export const maxDuration = 60;` on
`src/app/(app)/leads/find/page.tsx` to raise the execution ceiling as far
as free/Hobby tiers allow. Commit `7f5dca1`.

**Known residual limit, not a bug:** on a 60s-capped free tier, a very
large "Find Leads" target count (radius auto-expansion chasing e.g. 100+
qualified leads) can still get cut off before finishing. Whatever was
found and qualified before the cutoff is already persisted to Supabase
(companies are written as they're created, not batched at the end) — the
run just shows as incomplete and the user re-runs to keep going. If this
becomes a real pain point later, raising Vercel's plan (Pro gives ~800s
via Fluid Compute) or moving this one job to a GitHub Actions
`workflow_dispatch` runner (free, no serverless time cap) would remove
the limit entirely — not needed for initial migration.

## Remaining tasks

### 1. Deploy on Vercel (free Hobby tier)

1. [vercel.com/new](https://vercel.com/new) → import
   `gavinhartwich-cmyk/hartwich-os`, branch `main`.
2. Add every one of these as Environment Variables before first deploy.
   **Values live only in the project's `.env.local` (gitignored, never
   committed) — get them from Gavin directly (have him paste into
   Vercel's dashboard himself, or via a private channel), don't ask him
   to repaste secrets into a chat transcript that isn't already tracking
   them:**

   ```
   DATABASE_URL
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   GOOGLE_PLACES_API_KEY
   GROQ_API_KEY
   CRON_SECRET
   GMAIL_CLIENT_ID
   GMAIL_CLIENT_SECRET
   GMAIL_ACCESS_TOKEN_1 / GMAIL_REFRESH_TOKEN_1 / GMAIL_FROM_ADDRESS_1
   GMAIL_ACCESS_TOKEN_2 / GMAIL_REFRESH_TOKEN_2 / GMAIL_FROM_ADDRESS_2
   GMAIL_ACCESS_TOKEN_3 / GMAIL_REFRESH_TOKEN_3 / GMAIL_FROM_ADDRESS_3
   GOOGLE_CALENDAR_CLIENT_ID
   GOOGLE_CALENDAR_CLIENT_SECRET
   GOOGLE_CALENDAR_ACCESS_TOKEN
   GOOGLE_CALENDAR_REFRESH_TOKEN
   ```

   Optional/unused today, safe to skip: `ANTHROPIC_API_KEY` (blocked by
   the $0 cost constraint in README.md — do not enable),
   `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` (Inngest is installed and
   has a route + one function scaffolded at `src/inngest/`, but
   production lead discovery does **not** go through it — it's dead
   scaffolding, safe to leave blank), `SLACK_WEBHOOK_URL` (optional
   notifications, no-ops if blank), `TWILIO_*` (SMS reminders not wired
   up yet, email reminders work without it), `APOLLO_API_KEY` (unused).

3. Deploy. Note the resulting URL (`https://hartwich-os-xxxx.vercel.app`
   or a custom domain if one gets added later).

### 2. Add the cron workflow (replaces the two Zo loop scripts)

Create `.github/workflows/cron.yml` on the `main` branch with:

```yaml
name: Cron jobs

on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch: {}

jobs:
  sync-replies:
    runs-on: ubuntu-latest
    steps:
      - name: Sync Gmail replies
        run: |
          curl -sf -m 30 -X POST "${{ secrets.HARTWICH_APP_URL }}/api/cron/sync-replies" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Accept: application/json"

  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Send booking reminders
        run: |
          curl -sf -m 30 -X POST "${{ secrets.HARTWICH_APP_URL }}/api/cron/send-reminders" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Accept: application/json"
```

Then in the repo's **Settings → Secrets and variables → Actions**, add:
- `HARTWICH_APP_URL` — the Vercel URL from step 1, no trailing slash.
- `CRON_SECRET` — same value as the `CRON_SECRET` env var above.

(If pushing this file via `git push` from an agent's GitHub connection
fails with "refusing to allow an OAuth App to create or update workflow
... without `workflow` scope" — that's GitHub blocking OAuth apps without
that scope from touching `.github/workflows/*` over the API/git. Fastest
fix: add the file directly through GitHub's own web UI — `Add file →
Create new file` — which isn't subject to that restriction.)

### 3. Verify before cutting over

- Visit the Vercel URL: `/login` works, `/book` renders (booking
  availability itself depends on Gavin's Google Calendar actually having
  free slots — a calendar-content issue, not code — so "no open times"
  there is expected until he opens a slot).
- Log in, spot-check `/companies`, `/board`, `/calendar/settings`
  (should still be locked to `gavinhartwich@gmail.com` only — server-side
  check, not just hidden nav).
- Manually trigger both GitHub Actions jobs once via **Actions → Cron
  jobs → Run workflow** and confirm both return `{"...": ...}` success
  JSON, not an auth or 500 error.
- Run a small "Find Leads" (target ~10-20) end to end and confirm
  companies land in the review queue.

### 4. Decommission Zo

Once the above is confirmed working on Vercel:
- Stop/delete the Zo user services: `hartwich-os-dev` (the app) and the
  two loop services running `sync-replies-loop.sh` /
  `send-booking-reminders-loop.sh`.
- Give Gavin the new permanent URL to replace the
  `hartwich-os-dev-ev0.zocomputer.io` link he sent Noah.
