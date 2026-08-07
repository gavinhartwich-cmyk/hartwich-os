# Hartwich OS

Internal sales operating system for Hartwich Labs — HVAC lead sourcing,
qualification, CRM pipeline, and AI-assisted outreach.

**New here?** Start with [`SETUP.md`](./SETUP.md) — it's the checklist of
accounts and API keys needed to run this locally or deploy it. The full
system design (stack, database, AI pipeline, phased build plan) lives in
the *Hartwich OS — System Architecture* doc.

## Stack

Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth,
Storage, Realtime) · Drizzle ORM · Inngest (background workflows) ·
Anthropic Claude API · Google Places API · Gmail API · deployed on Vercel.

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
