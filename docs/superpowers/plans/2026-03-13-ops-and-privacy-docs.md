# Ops & Privacy Documentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `PRIVACY.md` and `OPS.md` at the project root, covering personal data inventory, database backup strategy, deploy pipeline, and rollback procedures.

**Architecture:** Two standalone markdown files. `PRIVACY.md` documents all PII/sensitive data in the system with GDPR-ready placeholder sections. `OPS.md` is an operations runbook covering Neon backups, Vercel deployment, rollback, cron monitoring, health checks, and troubleshooting.

**Tech Stack:** Markdown documentation. Source of truth: `prisma/schema.prisma`, `vercel.json`, `next.config.ts`, `.env.local.example`.

**Spec:** `docs/superpowers/specs/2026-03-13-ops-and-privacy-docs-design.md`

---

## Chunk 1: PRIVACY.md

### Task 1: Create PRIVACY.md

**Files:**
- Create: `PRIVACY.md`

- [ ] **Step 1: Write PRIVACY.md**

Create `PRIVACY.md` at the project root with the following content:

```markdown
# Personal Data Inventory

> Last updated: 2026-03-13

This document inventories all personally identifiable information (PII), security credentials, and business-sensitive data stored by Eco-Insight Revenue OS. It is structured to support future GDPR compliance work.

## Data Inventory

| Model | Field | Type | Purpose | Source |
|-------|-------|------|---------|--------|
| User | name | String | Display name for team member | user-input |
| User | email | String | Login identity, unique identifier | user-input |
| User | initials | String | Avatar fallback display | derived |
| Contact | name | String | Contact person at customer account | user-input |
| Contact | title | String | Job title | user-input |
| Contact | email | String | Business email for outreach | user-input |
| Contact | phone | String? | Phone number | user-input |
| Contact | linkedinUrl | String? | LinkedIn profile URL | user-input |
| InboxEmail | fromEmail | String | Sender email address | microsoft-sync |
| InboxEmail | fromName | String | Sender display name | microsoft-sync |
| InboxEmail | subject | String | Email subject line | microsoft-sync |
| InboxEmail | preview | String | First ~200 chars of email body | microsoft-sync |
| InboxEmail | domain | String? | Sender domain for new-domain detection | derived |
| Meeting | attendees | String[] | Names of meeting participants | microsoft-sync |
| Meeting | title | String | Calendar event title | microsoft-sync |
| Meeting | accountName | String? | Denormalized account name | derived |
| IntegrationToken | userEmail | String | Email of user who connected the integration | user-input |
| IntegrationToken | accessToken | String | OAuth access token (sensitive) | microsoft-sync |
| IntegrationToken | refreshToken | String | OAuth refresh token (sensitive) | microsoft-sync |
| Invitation | email | String | Invited user's email address | admin-action |
| Invitation | token | String | Invitation acceptance credential (sensitive) | system-generated |
| Activity | summary | String | Activity description (may reference people) | user-input |
| Activity | detail | String | Free-text notes (may contain PII) | user-input |
| QueueItem | payload | Json | Type-specific data (may contain contact details, outreach text) | ai-generated |
| QueueItem | originalPayload | Json? | Snapshot before edit (may contain PII) | ai-generated |
| QueueItem | accName | String | Denormalized account name | derived |
| QueueItem | reasoning | String | AI reasoning text (may reference people/companies) | ai-generated |
| TaskComment | text | String | Free-text comment (may contain PII) | user-input |
| TaskComment | mentions | String[] | User IDs referenced in comment | user-input |
| AgentConfig | parameters | Json | Agent-specific configuration (content varies) | admin-action |
| Opportunity | winNotes | String? | Notes on won deals (business-sensitive) | user-input |
| Opportunity | lossNotes | String? | Notes on lost deals (business-sensitive) | user-input |
| Opportunity | lossReason | String? | Why the deal was lost (competitive intelligence) | user-input |

**Source values:** `user-input` (entered by team members), `microsoft-sync` (pulled from Graph API), `ai-generated` (created by AI agents), `admin-action` (administrative operations), `derived` (computed from other fields), `system-generated` (created by application logic).

> **Note:** Activity records may also originate from `microsoft-sync` (Outlook Sync, Calendar Sync) depending on the Activity's `source` field — not exclusively `user-input`.

## Data Flow Summary

PII enters the system through four channels:

- **User input** — contacts added manually, notes, task comments, account briefs
- **Microsoft sync** — emails and calendar events pulled via Graph API every 15 minutes
- **AI-generated** — queue items created by agents containing contact/account context and outreach drafts
- **Admin actions** — user invitations with email addresses

## Third-Party Data Flows

| Third Party | Data Sent | Data Received | Storage |
|-------------|-----------|---------------|---------|
| Microsoft Graph API | OAuth tokens (access + refresh) | Emails, calendar events, attendee names | IntegrationToken, InboxEmail, Meeting |
| Vercel | Application code, env vars | — | Standard request logs only (no PII stored) |
| Neon | — | — | All PII resides in Neon-hosted PostgreSQL |

## Sensitive Data Notes

- **OAuth tokens** (`accessToken`, `refreshToken`) stored as plain text in the `IntegrationToken` table. Known risk — see backlog item S-03 for planned encryption.
- **Invitation tokens** stored as plain text in the `Invitation` table.
- **Security headers** configured in `next.config.ts`:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `X-DNS-Prefetch-Control: on`
- **Known gap:** no `Content-Security-Policy` header configured yet.
- No PII is passed in URL parameters.
- `CRON_SECRET` protects the `/api/sync` endpoint from unauthorized invocation.

<!-- TODO before launch with EU customers -->

## Legal Basis per Data Category

| Data Category | Legal Basis | Justification |
|---------------|-------------|---------------|
| Team member data (User) | _TBD_ | _TBD_ |
| Customer contact data (Contact) | _TBD_ | _TBD_ |
| Synced communications (InboxEmail, Meeting) | _TBD_ | _TBD_ |
| AI-generated content (QueueItem) | _TBD_ | _TBD_ |

## Retention Periods

| Data Category | Retention Period | Deletion Trigger |
|---------------|-----------------|------------------|
| _TBD_ | _TBD_ | _TBD_ |

## Data Subject Rights

- **Right of access** — _TBD: procedure for exporting a user's data_
- **Right to erasure** — _TBD: procedure for deleting a user's data across all tables_
- **Right to portability** — _TBD: export format and delivery method_
- **Right to rectification** — _TBD: procedure for correcting inaccurate data_

## Deletion Procedures

_TBD: Document cascade behavior when deleting a User, Contact, or Account. Reference Prisma schema `onDelete` settings._
```

- [ ] **Step 2: Verify PRIVACY.md renders correctly**

Run: `head -5 PRIVACY.md`
Expected: Shows the title and last-updated date.

- [ ] **Step 3: Commit**

```bash
git add PRIVACY.md
git commit -m "docs: add personal data inventory (P-01)"
```

---

## Chunk 2: OPS.md

### Task 2: Create OPS.md

**Files:**
- Create: `OPS.md`

- [ ] **Step 1: Write OPS.md**

Create `OPS.md` at the project root with the following content:

```markdown
# Operations Runbook

> Last updated: 2026-03-13

Covers database backups, deployment, rollback, sync monitoring, and troubleshooting for Eco-Insight Revenue OS.

## Database Backups

**Primary provider: Neon** — this section is structured to be provider-agnostic so switching is straightforward.

### Neon

- Neon provides automatic daily backups and point-in-time recovery (PITR) on paid plans.
- **Verify backups are enabled:** Neon dashboard → Project → Settings (check backup/PITR configuration).
- **Restore procedure:**
  1. Open Neon dashboard → Branches.
  2. Create a new branch from a specific point in time.
  3. Update `DATABASE_URL` to the new branch's connection string.
  4. Verify data integrity (spot-check key tables).
  5. Promote the branch to primary, or keep it and update production env vars.

### Provider-Agnostic Checklist

When evaluating or switching Postgres hosts, verify:

- [ ] Automatic backups enabled
- [ ] PITR (point-in-time recovery) available
- [ ] Backup frequency documented
- [ ] Restore procedure tested at least once
- [ ] Backup retention period documented

**If migrating to Supabase:** enable PITR in the Supabase dashboard. Backups are automatic on the Pro plan.

## Deploy Pipeline

**Platform:** Vercel, connected via Git integration.

### Flow

```
push to main → Vercel auto-builds → production deploy
push to PR branch → Vercel builds preview deployment
```

### Build Details

- **Build command:** `npm run build` (Next.js production build)
- **Pre-deploy migration:** `npm run db:migrate` (runs `prisma migrate deploy` — forward-only, safe for production)
- **PR previews:** every pull request gets a preview deployment URL automatically

### Environment Variables

Managed in Vercel dashboard (Settings → Environment Variables).

**Required:**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `NEXTAUTH_SECRET` | Session encryption key (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App canonical URL (e.g. `https://eco-insight.vercel.app`) |
| `AZURE_AD_CLIENT_ID` | Azure Entra ID application client ID |
| `AZURE_AD_CLIENT_SECRET` | Azure Entra ID application secret |
| `AZURE_AD_TENANT_ID` | Azure Entra ID tenant ID |

**Required for sync:**

| Variable | Purpose |
|----------|---------|
| `MICROSOFT_CLIENT_ID` | Microsoft Graph API client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft Graph API secret |
| `MICROSOFT_REDIRECT_URI` | OAuth callback URL (e.g. `https://eco-insight.vercel.app/api/integrations/microsoft/callback`) |

**Recommended:**

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Protects `/api/sync` from unauthorized invocation. Optional but strongly recommended for production. |

## Rollback

### Application Rollback

Revert to a previous deployment:

- **Vercel dashboard:** Deployments → select previous successful deployment → "Promote to Production"
- **CLI:** `vercel rollback`

### Database Rollback

Prisma migrations are forward-only. To revert a schema change:

1. Generate a revert migration: `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --script > revert.sql`
2. Review the generated SQL carefully.
3. Create a new forward migration that applies the revert: `npx prisma migrate dev --name revert_<description>`
4. Alternatively, use Neon branching: restore a branch from before the migration, verify, then promote.

### When to Rollback

- Build passes but runtime errors appear in production
- API responses return unexpected data or errors
- Sync jobs start failing after a deploy

## Cron & Sync Monitoring

- `/api/sync` runs every 15 minutes via Vercel Cron (configured in `vercel.json`).
- Protected by `CRON_SECRET` header — requests without the correct secret are rejected.
- Sync pulls emails and calendar events from Microsoft Graph for all users with connected tokens.
- **Check logs:** Vercel dashboard → Functions → `/api/sync` → Invocation logs.
- **Future:** backlog item O-04 will add in-app failure alerting.

## Health Checks (Post-Deploy)

After every production deploy, verify:

1. **Build succeeded** — Vercel dashboard shows a green deployment status.
2. **Migrations applied** — Run `npx prisma migrate status` against the production database. No pending migrations.
3. **App loads** — Visit the production URL. Confirm the dashboard renders without errors.
4. **Sync endpoint responds** — `curl -H "Authorization: Bearer $CRON_SECRET" https://$NEXTAUTH_URL/api/sync` returns HTTP 200.
5. **No console errors** — Open browser dev tools on Home, Pipeline, and Settings pages. No red errors in console.

## First-Response Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| App returns 500 on all pages | Database connection failed | Check `DATABASE_URL` in Vercel env vars. Verify Neon project is running in the dashboard. |
| Meetings/emails not appearing | Sync cron failed or no OAuth tokens | Check Vercel function logs for `/api/sync`. Verify an `IntegrationToken` record exists for the user. |
| Build fails on deploy | Migration or TypeScript error | Check Vercel build logs. Run `npm run build` locally to reproduce. |
| Settings page shows stale data | API route returning errors | Check browser network tab for 4xx/5xx on `/api/settings/*` endpoints. |
| OAuth callback fails | Redirect URI mismatch | Verify `MICROSOFT_REDIRECT_URI` in Vercel env vars matches the redirect URI in the Azure app registration. |
| Cron not firing | Vercel cron misconfigured or plan limitation | Check `vercel.json` has the cron entry. Verify the project is on a Vercel Pro plan (cron requires Pro). |
```

- [ ] **Step 2: Verify OPS.md renders correctly**

Run: `head -5 OPS.md`
Expected: Shows the title and last-updated date.

- [ ] **Step 3: Commit**

```bash
git add OPS.md
git commit -m "docs: add operations runbook (O-05, O-06)"
```

---

## Chunk 3: Backlog Update & Final Commit

### Task 3: Update BACKLOG.md

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Mark P-01, O-05, O-06 as Done in BACKLOG.md**

Find each of these three rows and change `Not started` to `Done`:
- `P-01` — Document personal data inventory
- `O-05` — Database backup strategy
- `O-06` — Deploy pipeline and rollback plan

- [ ] **Step 2: Commit**

```bash
git add BACKLOG.md
git commit -m "chore: mark P-01, O-05, O-06 as done in backlog"
```
