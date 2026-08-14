# Hartwich OS — Setup Checklist

Everything the code needs that only you and Noah can create: accounts, API
keys, and the few decisions the architecture doc left open. Work through
this top to bottom for a working local instance; the "Deploy" section at
the bottom takes it live.

Reference: the full design is in the **Hartwich OS — System Architecture**
doc (published as a Claude artifact). Section numbers below (§3, §4, …)
point back to it.

---

## 0. ⚠️ Cost Constraint — Development Budget: $0

Hartwich OS development must incur **zero additional spend**. Gavin's
existing Claude Code subscription is the only paid development tool/service
permitted. Until this is explicitly lifted, do **not** introduce:

- Anthropic API billing or usage-based API spend
- Any other paid or usage-based API
- Paid SaaS signups or plan upgrades (Inngest, Slack, etc. — free tiers only)
- An upgraded Supabase plan (free tier only)
- Any other recurring or usage-based cost

Everything in this checklist (Supabase free tier, Google Places
free-tier/quota-based key, Groq's free tier, Inngest's local dev server,
Slack's free incoming webhooks) is compatible with the $0 constraint as
currently used. Phase 2's AI calls run on Groq (step 3 below), not
Anthropic — Anthropic billing stays off the table until it's explicitly
lifted for Phase 3.

## 1. Supabase (database, auth, storage) — §3, §4

1. Create a free project at [supabase.com](https://supabase.com) — name it
   `hartwich-os` (or `hartwich-os-dev` if you want separate dev/prod
   projects, recommended once you're past Phase 0).
2. **Settings → API** → copy into `.env.local`:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only —
     needed once, to run the account-creation script in step 4 below;
     never commit it or use it from client code).
3. **Settings → Database → Connection string** → choose **Transaction**
   pooler (port 6543) → copy into `DATABASE_URL`. This pooler is required
   because Vercel functions are serverless (§1 of the architecture doc).
4. Auth is email/password with no public sign-up — accounts are created
   directly via the Supabase Admin API, not through the dashboard's
   invite flow. After `npm install` and with `DATABASE_URL` and the two
   Supabase keys above set, run:
   ```bash
   npm run auth:create-users
   ```
   This creates one account per email in `src/lib/auth/allowlist.ts` and
   prints a one-time password for each — share them with Gavin/Noah over
   a secure channel.

## 2. Google Cloud (Places API) — §5

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
   — name it `hartwich-os`.
2. **APIs & Services → Library** → enable **Places API (New)**.
3. **APIs & Services → Credentials → Create Credentials → API key** →
   restrict it to the Places API → copy into `.env.local` as
   `GOOGLE_PLACES_API_KEY`. Needed for the "Find Leads" workflow (Phase 2,
   built) — the app runs fine without it, but discovery requests will fail
   until it's set.

Note: this is unrelated to logging in — Hartwich OS auth is Supabase
email/password (§1, step 4), not Google OAuth.

## 3. Groq (AI qualification + website enrichment) — §5

1. Create a free account at [console.groq.com](https://console.groq.com) —
   no credit card required.
2. **API Keys → Create API Key** → copy into `.env.local` as
   `GROQ_API_KEY`.

The code that calls it: `src/lib/ai/enrich-company.ts` (website-summary
step) and `src/lib/ai/qualify-lead.ts` (ICP scoring step), both on the
`openai/gpt-oss-120b` model via Groq's strict structured-output mode. With
`GROQ_API_KEY` unset, those two calls fail closed (enrichment returns null,
qualification routes to manual review) rather than throwing — the
lead-mining workflow still runs, just without the AI steps.

Anthropic (`src/lib/ai/claude.ts`, `ANTHROPIC_API_KEY`) is **not** used by
any Phase 2 code path — it's kept in the codebase and dependency tree
reserved for Phase 3 outreach drafting, still blocked under the $0
constraint (§0 above) until that's explicitly lifted.

## 3a. Inngest (background workflows) — §2, §5

Lead discovery runs as a background workflow (search → enrich → qualify →
persist, one company at a time, with retries) rather than inline in a
request, so it can take minutes without a serverless function timing out.

- **Local dev:** run `npm run inngest:dev` (or `npx inngest-cli@latest dev`)
  in a second terminal alongside `npm run dev`. It auto-discovers the app at
  `http://localhost:3000/api/inngest` — no keys needed locally.
- **Deployed:** sign up at [inngest.com](https://inngest.com), create an app,
  and copy `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` into your environment
  variables (Vercel too — see §5 below).

## 3b. Slack (optional lead-mining notifications) — §5

Each "Find Leads" run posts a one-line summary ("14 found, 9 qualified") to
Slack when configured. Entirely optional — skip this and leave
`SLACK_WEBHOOK_URL` blank; `src/lib/integrations/slack.ts` no-ops without it.

1. Slack → **Apps → Incoming Webhooks** → create one for the channel you
   want the summaries in → copy the webhook URL into `.env.local` as
   `SLACK_WEBHOOK_URL`.

## 4. GitHub

1. Create a **private** repo, e.g. `hartwich-labs/hartwich-os`.
2. I'll push the initial commit once you confirm the repo exists (or send
   me the remote URL and I'll add it).

## 5. Vercel — §7

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. Add every variable from `.env.example` under **Settings → Environment
   Variables** (same values as your `.env.local`, plus the production
   Supabase redirect URL once you know the Vercel-assigned domain).
3. Deploy. You'll get a free `*.vercel.app` URL immediately — no domain
   required to go live (§7 covers swapping in a custom domain later, and
   you confirmed none is registered yet).

## 6. Later, not blocking Phase 0

- **Twilio** — needed starting Phase 4.
- **Apollo.io** — needed starting Phase 5.
- **Custom domain** — buy whenever you're ready (any registrar); pointing
  it at Vercel is a DNS change, not a rebuild.

---

## Running it locally

```bash
cp .env.example .env.local   # fill in Supabase + Google + Groq values above; leave ANTHROPIC_API_KEY blank (§0)
npm install
npm run db:push              # creates all tables from src/db/schema.ts
npm run db:seed              # seeds default pipeline stages + lead source config
npm run auth:create-users    # one-time: creates the two Supabase Auth accounts
npm run dev                  # http://localhost:3000
npm run inngest:dev           # separate terminal — required for "Find Leads" to run
```

Sign in with `gavinhartwich@gmail.com` or `noahhartwich@gmail.com` and the
password `auth:create-users` printed for that email — any other email is
rejected (§4).

## What's already built (Phase 0)

- Next.js app, deployed to Vercel, installable as a PWA.
- Full database schema (`src/db/schema.ts`) for every table in the
  architecture doc — companies, contacts, deals, pipeline stages,
  activities, messages, templates, sequences, tasks, AI run logs, lead
  source config, audit log.
- Email/password sign-in restricted to the two-person allow-list
  (`src/lib/auth/allowlist.ts`), enforced in `src/proxy.ts` on every
  request; accounts are provisioned out-of-band with
  `scripts/create-auth-users.ts`.
- Default pipeline stage seed script.

## What's already built (Phase 1)

- Manual lead entry, company/contact pages, the Kanban pipeline board.
- Contacts panel and activity/note logging on the company detail page.

## What's already built (Phase 2 — AI Lead Mining v1)

The AI-calling steps (website enrichment summary, ICP qualification
scoring) run on Groq's free tier (`openai/gpt-oss-120b`, strict structured
outputs) — see §3 above for the key. Google Places discovery, dedupe
against existing companies, and the code-level auto-disqualify gates
(review-count/rating threshold, no-website-and-no-phone, franchise
blocklist match) were confirmed earlier with live diagnostic runs against
the dev database. Anthropic is not used anywhere in this phase.

- **Find Leads** (`/leads/find`) — kicks off `src/inngest/functions/discover-leads.ts`,
  an Inngest workflow: Google Places text search → dedupe against existing
  companies → Groq reads the site and produces a structured summary →
  Groq scores the lead 0–100 against the exact ICP rubric from the
  architecture doc §5 (the two numeric auto-disqualify gates run in code,
  not the model) → persists the company (and a deal, if it clears the
  auto-file threshold) → optional Slack summary.
- **Review Queue** (`/leads/review`) — leads that scored below the
  auto-file threshold, with "Move to board" / "Disqualify" actions.
- Every AI call logged to `ai_runs` for cost tracking.
- Apollo contact enrichment is **not** included — that's Phase 5.

## What's next (Phase 3)

Per-user Gmail OAuth, AI-drafted outreach messages, send-and-log flow,
inbound reply detection, automatic stage transitions.
