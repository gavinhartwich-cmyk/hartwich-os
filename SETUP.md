# Hartwich OS — Setup Checklist

Everything the code needs that only you and Noah can create: accounts, API
keys, and the few decisions the architecture doc left open. Work through
this top to bottom for a working local instance; the "Deploy" section at
the bottom takes it live.

Reference: the full design is in the **Hartwich OS — System Architecture**
doc (published as a Claude artifact). Section numbers below (§3, §4, …)
point back to it.

---

## 1. Supabase (database, auth, storage) — §3, §4

1. Create a free project at [supabase.com](https://supabase.com) — name it
   `hartwich-os` (or `hartwich-os-dev` if you want separate dev/prod
   projects, recommended once you're past Phase 0).
2. **Settings → API** → copy into `.env.local`:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **Settings → Database → Connection string** → choose **Transaction**
   pooler (port 6543) → copy into `DATABASE_URL`. This pooler is required
   because Vercel functions are serverless (§1 of the architecture doc).
4. **Authentication → Providers → Google** → toggle on. You'll need the
   Google OAuth client id/secret from step 2 below before this works —
   come back to this after that step.
5. **Authentication → URL Configuration** → set:
   - Site URL: `http://localhost:3000` for now (update to your real
     domain once deployed — see §7).
   - Redirect URLs: add `http://localhost:3000/auth/callback` (and later
     your production `https://.../auth/callback`).

## 2. Google Cloud (OAuth login + Places API) — §4, §5

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
   — name it `hartwich-os`.
2. **APIs & Services → OAuth consent screen** → External → fill in app
   name (`Hartwich OS`), your email as support contact. You don't need
   Google's app verification for a 2-person allow-listed app in testing
   mode, but add both your emails as **test users** or it will reject
   sign-in.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → type: Web application.
   - Authorized redirect URI: use the callback URL Supabase shows you on
     the Google provider screen (step 4 above) — looks like
     `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Copy the generated **Client ID** and **Client Secret** into
     Supabase's Google provider screen (step 4 above) and save.
4. **APIs & Services → Library** → enable **Places API (New)**.
5. **APIs & Services → Credentials → Create Credentials → API key** →
   restrict it to the Places API → copy into `.env.local` as
   `GOOGLE_PLACES_API_KEY`. (Needed starting Phase 2 — fine to leave
   blank for now.)

## 3. Anthropic (AI qualification + outreach drafting) — §5, §6

1. Create a key at [console.anthropic.com](https://console.anthropic.com) →
   `ANTHROPIC_API_KEY`. Needed starting Phase 2 — fine to leave blank for
   now.

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

- **Inngest** (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`) — needed
  starting Phase 2, sign up at [inngest.com](https://inngest.com) when
  you get there.
- **Twilio** — needed starting Phase 4.
- **Apollo.io** — needed starting Phase 5.
- **Custom domain** — buy whenever you're ready (any registrar); pointing
  it at Vercel is a DNS change, not a rebuild.

---

## Running it locally

```bash
cp .env.example .env.local   # then fill in the Supabase + Google values above
npm install
npm run db:push              # creates all tables from src/db/schema.ts
npm run db:seed              # seeds the default pipeline stages
npm run dev                  # http://localhost:3000
```

Sign in with `gavinhartwich@gmail.com` or `noahhartwich@gmail.com` — any
other Google account is rejected (§4).

## What's already built (Phase 0)

- Next.js app, deployed to Vercel, installable as a PWA.
- Full database schema (`src/db/schema.ts`) for every table in the
  architecture doc — companies, contacts, deals, pipeline stages,
  activities, messages, templates, sequences, tasks, AI run logs, lead
  source config, audit log.
- Google OAuth sign-in restricted to the two-person allow-list
  (`src/lib/auth/allowlist.ts`), enforced in `src/proxy.ts` on every
  request plus again in the OAuth callback.
- Default pipeline stage seed script.

## What's next (Phase 1)

Once this checklist is done and `npm run dev` shows a signed-in home
page, the next phase is the CRM board itself — manual lead entry,
company/contact pages, the Kanban board, and activity logging — no new
accounts required for that phase.
