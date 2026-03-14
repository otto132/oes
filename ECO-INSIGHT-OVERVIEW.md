# Eco-Insight Revenue OS — App Overview

**Version:** 0.2.0 | **Updated:** 2026-03-14

---

## What Is It?

Eco-Insight is an AI-assisted Revenue Operations (RevOps) platform built for the Guarantees of Origin (GoO), renewable certificates, and PPA market. It combines a lightweight CRM with AI agents that automate market intelligence, lead qualification, email classification, and deal health monitoring — all with human-in-the-loop approval.

**Tech stack:** Next.js 15 (App Router) + React 19 + TypeScript, PostgreSQL via Prisma ORM, NextAuth v5 (Google SSO), Anthropic Claude API, Zustand + React Query, deployed on Vercel.

---

## Key Features & Workflows

### CRM Core

| Feature | Description |
|---------|-------------|
| **Signals** | Market intelligence items from RSS feeds, scored by AI, convertible to Leads |
| **Leads (Kanban)** | Sales prospects tracked through stages: New → Researching → Qualified → Converted / Disqualified |
| **Accounts** | Company records with FIUAC scoring, contacts, activities, opportunities, AI-generated briefs |
| **Pipeline** | Deals tracked through a 10-stage pipeline with health scoring across 4 dimensions |
| **Contacts** | People at accounts with roles (Champion, Economic Buyer, etc.) and warmth tracking |
| **Activities** | Timeline of emails, meetings, calls, and notes linked to accounts |
| **Tasks** | Prioritized action items with assignees, reviewers, goal linkage, and follow-ups |
| **Inbox** | Synced Outlook emails with AI classification (positive reply, objection, meeting request, etc.) |
| **Meetings** | Calendar sync with prep status tracking and outcome logging |

### AI Agents (6 active)

Each agent creates **Queue Items** that require human approval before taking effect.

| Agent | What It Does |
|-------|-------------|
| **Signal Hunter** | Scans RSS feeds, matches signals to accounts, scores relevance |
| **Lead Qualifier** | Auto-scores new leads using FIUAC criteria |
| **Inbox Classifier** | Classifies incoming emails into 9 categories with confidence scores |
| **Account Enricher** | Generates account briefs (pain points, why-now, competitors) |
| **Outreach Drafter** | Drafts outbound emails for review |
| **Pipeline Hygiene** | Monitors at-risk deals, suggests next actions |

### Microsoft Integration

- **Email sync** from Outlook via Microsoft Graph (domain matching to accounts, dedup)
- **Calendar sync** with attendee matching and timezone handling
- Per-user OAuth token management with refresh

### Other

- **Approval Queue** — Central hub for reviewing all agent-generated items before they take effect
- **Global Search** — Cmd+K palette across accounts, opportunities, leads, signals
- **Home Dashboard** — Next-best-actions, pipeline stats, today's meetings, recent activity
- **Team Management** — Invite users, assign roles (Admin/Member/Viewer), activate/deactivate
- **Notifications** — In-app notifications with badge counts
- **Admin Dashboard** — Team health, sync status, agent performance

---

## What's Working vs. What's Not

### Fully Working

- Google SSO authentication with RBAC (Admin / Member / Viewer)
- All API endpoints (45+) with Zod validation
- Team management (invite, roles, activate/deactivate)
- Microsoft email & calendar sync (OAuth, dedup, domain matching)
- All 6 AI agents with structured output and queue creation
- Queue workflow (approve with payload editing, reject, side-effects)
- All frontend pages rendering with real data via React Query
- Notifications system (create, list, mark-read, badge counts)
- Settings (Team, Integrations, Agents, Profile)
- Home dashboard with live stats and next-best-actions
- Global search (Cmd+K)
- Data export

### Partially Working

- **Leads Kanban** — Renders with real data; stage movement exists but not all side-effects fully tested
- **Meeting Workflows** — List/detail pages exist; prep and outcome logging partially done
- **Win/Loss Analysis** — Data model and agent exist; UI not fully built

### Not Yet Implemented

| Item | Priority | Notes |
|------|----------|-------|
| Pipeline Kanban columns | P1 | Currently a flat list; needs drag-drop stage columns |
| Multi-tenant support | P1 | Schema ready (`Tenant` model exists); query-level isolation not wired |
| Undo queue items | P2 | 30-second undo window designed but not coded |
| API rate limiting | P2 | No protection against abuse |
| Idempotency keys | P2 | Duplicate requests could create duplicate records |
| Session timeout | P2 | Sessions are long-lived with no refresh handling |
| Onboarding flow | P2 | No guided first-run experience |
| Frontend component tests | — | No React Testing Library tests; only API + agent unit tests exist |

---

## Developer Glossary

These terms have specific meaning in this codebase. Use them consistently.

| Term | Definition |
|------|-----------|
| **FIUAC** | Scoring framework: **F**it, **I**nterest, **U**rgency, **A**uthority, **C**apacity — used for both Leads and Accounts (scores 0-100 each) |
| **Signal** | A piece of market intelligence (RSS item, news, regulatory change) detected by the Signal Hunter agent |
| **Queue Item** | An action proposed by an AI agent that requires human approval before it takes effect |
| **Side-effect** | The actual mutation (create lead, update account, log activity) triggered when a Queue Item is approved |
| **NBA** | Next Best Action — prioritized suggestions on the Home dashboard |
| **Deal Health** | 4-dimension score on opportunities: Engagement, Stakeholder, Technical, Timeline (0-100 each) |
| **Warmth** | Contact engagement level: Cold, Warm, or Hot |
| **Contact Role** | One of: Champion, Economic Buyer, Technical Buyer, Influencer, Blocker |
| **Stage (Lead)** | New → Researching → Qualified → Converted / Disqualified |
| **Stage (Opp)** | Prospect → Discovery → Solution Design → Proposal → Negotiation → Verbal Commit → Contracting → Won / Lost / Churned |
| **Agent** | An autonomous AI workflow that runs on a schedule or trigger, creates Queue Items for approval |
| **Agent Run** | A single execution of an agent, tracked with metrics (items scanned, created, errors, duration) |
| **Agent Event** | An event emitted by an agent for inter-agent coordination |
| **Tenant** | A workspace/organization. Currently single-tenant; schema supports multi-tenant |
| **Adapter** | Functions in `lib/adapters.ts` that convert Prisma DB types into frontend UI types |
| **Scoped DB** | `scopedDb()` — Helper that filters queries by user ownership for data isolation |

### Key File Locations

| What | Where |
|------|-------|
| Database schema | `prisma/schema.prisma` |
| UI type definitions | `src/lib/types.ts` |
| Prisma → UI adapters | `src/lib/adapters.ts` |
| API routes | `src/app/api/` |
| AI agents | `src/lib/agents/` |
| Agent registry | `src/lib/agents/registry.ts` |
| React Query hooks | `src/lib/api.ts` |
| Zustand store | `src/lib/store.ts` |
| Auth config | `src/auth.ts` + `src/auth.config.ts` |
| Middleware (auth) | `src/middleware.ts` |
| Pages | `src/app/(dashboard)/` |
| Unit tests | `src/lib/agents/__tests__/`, `src/app/api/__tests__/` |
| E2E tests | `e2e/` |

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Session encryption key |
| `NEXTAUTH_URL` | Yes | App canonical URL |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth |
| `ANTHROPIC_API_KEY` | For agents | Claude API key |
| `MICROSOFT_CLIENT_ID` | For email sync | Microsoft OAuth |
| `MICROSOFT_CLIENT_SECRET` | For email sync | Microsoft OAuth |
| `MICROSOFT_REDIRECT_URI` | For email sync | OAuth callback URL |
| `CRON_SECRET` | Recommended | Protects cron endpoints |

### Cron Jobs (Vercel)

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Daily midnight | `/api/sync` | Email + calendar sync |
| Daily noon | `/api/sync?type=agents` | Run due AI agents |
| Weekly Sun 3 AM | `/api/retention` | Archive old emails, dismissed signals, stale logs |
