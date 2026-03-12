# Database Setup Guide

## The 5-Minute Path (Supabase)

### 1. Create a database

Go to [supabase.com](https://supabase.com) → New Project → pick a region close to you.
Copy the connection string from Settings → Database → Connection string (URI).

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and paste your connection string:
# DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
```

### 3. Install and initialize

```bash
npm install
npx prisma migrate dev --name init
npx prisma db seed
```

That's it. Your database now has all the demo data. Run `npm run dev` and the app works exactly as before, but persisted.

---

## Alternative: Neon (Serverless Postgres)

```bash
# 1. Create project at neon.tech
# 2. Copy connection string
# 3. Same steps:
cp .env.example .env
npm install
npx prisma migrate dev --name init
npx prisma db seed
```

## Alternative: Local Docker

```bash
docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
# .env:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eco_insight"
npm install
npx prisma migrate dev --name init
npx prisma db seed
```

---

## Database Commands

| Command | What it does |
|---------|-------------|
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:migrate` | Create and run a new migration |
| `npm run db:push` | Push schema changes without migration (dev only) |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run db:reset` | Wipe DB and re-seed |

## Inspecting the database

```bash
npx prisma studio
# Opens a browser UI at localhost:5555
# Browse all tables, edit records, see relationships
```

---

## Schema Overview

```
users ──────────────────────────────────────────────
  │
  ├── owns → leads, accounts, opportunities, tasks, goals
  ├── assigned → tasks (many-to-many)
  └── authored → activities, task_comments

signals ────────────────────────────────────────────
  └── linked → leads (one-to-many)

accounts ───────────────────────────────────────────
  ├── has → contacts (one-to-many, cascade delete)
  ├── has → opportunities (one-to-many)
  ├── has → activities (one-to-many)
  ├── has → tasks (one-to-many)
  └── has → goals (one-to-many)

opportunities ──────────────────────────────────────
  ├── belongs to → account
  └── owned by → user

queue_items ────────────────────────────────────────
  └── references → account (optional, by accId)

tasks ──────────────────────────────────────────────
  ├── belongs to → account (optional)
  ├── owned by → user
  ├── assigned to → users (many-to-many)
  ├── reviewed by → user (optional)
  ├── grouped under → goal (optional)
  └── has → task_comments

inbox_emails ───────────────────────────────────────
  └── linked to → account (by accountId, denormalized)

meetings ───────────────────────────────────────────
  └── linked to → account (by accountId, denormalized)
```

## Key Design Decisions

**FIUAC scores are individual columns, not JSON.** This lets you query `WHERE scoreFit > 70 AND scoreIntent > 50` without JSON operators. Each Lead and Account has `scoreFit`, `scoreIntent`, `scoreUrgency`, `scoreAccess`, `scoreCommercial`.

**Deal health is individual columns too.** `healthEngagement`, `healthStakeholders`, `healthCompetitive`, `healthTimeline` on Opportunity. Same reason — you need `WHERE healthEngagement < 40` for the Pipeline Hygiene agent.

**Queue item payloads are JSON.** Each queue type has a different payload shape (outreach has to/subject/body, lead qualification has FIUAC scores, enrichment has before/after). JSON is correct here because the payload is type-discriminated and consumed whole, not queried field-by-field.

**Contacts are normalized.** They belong to an Account via foreign key. In v1 this is one-to-many. If you later need a person to appear at multiple accounts, add a join table.

**Emails and meetings are denormalized.** `accountName` is stored alongside `accountId` for display performance. This is intentional — these records come from external sync and the denormalized name avoids a join on every inbox render.

## Migration to production

When you're ready to go live:

1. Switch `DATABASE_URL` to your production Postgres
2. Run `npx prisma migrate deploy` (applies migrations without interactive prompts)
3. Seed is optional in production — only run it if you want demo data
4. Add `@prisma/client` to your build step (already done via `postinstall` script)

On Vercel: just set `DATABASE_URL` as an environment variable and deploy. The `postinstall` script handles Prisma client generation automatically.
