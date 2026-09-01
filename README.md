# Hartwich OS

Internal sales operating system for Hartwich Labs — HVAC lead sourcing,
qualification, CRM pipeline, and AI-assisted outreach.

**New here?** Start with [`SETUP.md`](./SETUP.md) — it's the checklist of
accounts and API keys needed to run this locally or deploy it. The full
system design (stack, database, AI pipeline, phased build plan) lives in
the *Hartwich OS — System Architecture* doc.

**Moving hosting off Zo Computer?** See [`MIGRATION.md`](./MIGRATION.md) —
current state, what's already portable, and the exact remaining steps.

## ⚠️ Cost Constraint — Development Budget: $0

Hartwich OS development must incur **zero additional spend**. Gavin's
existing Claude Code subscription is the only paid development tool/service
permitted. Until this is explicitly lifted, do **not** introduce:

- Anthropic API billing or usage-based API spend
- Any other paid or usage-based API
- Paid SaaS signups or plan upgrades (Inngest, Slack, etc. — free tiers only)
- An upgraded Supabase plan (free tier only)
- Any other recurring or usage-based cost

Google Places (free-tier/quota-based), Groq's free tier, Inngest's free
tier, Slack's free incoming webhooks, and Supabase's free tier are all fine
as currently used. **Anthropic API usage is currently blocked** under this
constraint — see [`SETUP.md`](./SETUP.md) §3. It isn't used by any code
path yet; it's reserved for Phase 3 outreach drafting.

## Stack

Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth,
Storage, Realtime) · Drizzle ORM · Inngest (background workflows) · Groq
API (Phase 2 AI qualification + enrichment) · Anthropic Claude API
(reserved for Phase 3, blocked under the $0 dev constraint — see above) ·
Google Places API · Gmail API · deployed on Vercel.

## Local development

```bash
cp .env.example .env.local   # fill in values — see SETUP.md
npm install
npm run db:push
npm run db:seed
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply `src/db/schema.ts` to the database (dev) |
| `npm run db:generate` / `db:migrate` | Generate/apply versioned SQL migrations (prod) |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run db:seed` | Seed default pipeline stages |
| `npm run auth:create-users` | One-time: create Supabase Auth accounts for the allow-listed users |
| `npm run inngest:dev` | Local Inngest dev server — run alongside `dev` for lead mining |
