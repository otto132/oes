# Design: Ops & Privacy Documentation (P-01, O-05, O-06)

> Date: 2026-03-13
> Status: Reviewed
> Backlog items: P-01, O-05, O-06

## Goal

Create two root-level documentation files — `PRIVACY.md` and `OPS.md` — that cover personal data inventory, database backup strategy, deploy pipeline, and rollback procedures.

---

## Deliverable 1: PRIVACY.md

### 1. Overview

State the document's purpose (personal data inventory for Eco-Insight Revenue OS), scope, and last-updated date.

### 2. Data Inventory Table

Table with columns: **Model | Field | Type | Purpose | Source**

Models and PII fields to document:

| Model | Fields |
|-------|--------|
| User | name, email, initials |
| Contact | name, title, email, phone, linkedinUrl |
| InboxEmail | fromEmail, fromName, subject, preview, domain |
| Meeting | attendees, title, accountName |
| IntegrationToken | userEmail, accessToken, refreshToken |
| Invitation | email, token (security credential) |
| Activity | summary, detail (free-text, may contain PII) |
| QueueItem | payload, originalPayload (JSON, may contain contact details), accName, reasoning |
| TaskComment | text (free-text, may contain PII), mentions (user ID refs) |
| AgentConfig | parameters (JSON, content varies by agent — may contain business-sensitive config) |
| Opportunity | winNotes, lossNotes, lossReason (business-sensitive competitive intelligence) |

**Source** values: `user-input`, `microsoft-sync`, `ai-generated`, `admin-action`, `derived` (computed from other fields), `system-generated` (created by application logic).

### 3. Third-Party Data Flows

Document external integrations and what data crosses the boundary:

- **Microsoft Graph API** — OAuth tokens sent to Microsoft; emails and calendar events received. Data stored in IntegrationToken, InboxEmail, Meeting.
- **Vercel** — Application hosting. No PII stored by Vercel beyond standard request logs.
- **Neon** — Database hosting. All PII resides in Neon-hosted PostgreSQL. Subject to Neon's security/compliance posture.

### 4. Data Flow Summary

Text description of PII entry points:
- **User input**: contacts added manually, notes, task comments
- **Microsoft sync**: emails and calendar events pulled via Graph API every 15 min
- **AI-generated**: queue items created by agents with contact/account context
- **Admin actions**: user invitations with email addresses

### 5. Sensitive Data Notes

- OAuth tokens (accessToken, refreshToken) stored as plain text in IntegrationToken table — known risk, ref backlog item S-03
- Invitation tokens stored as plain text in Invitation table
- Security headers configured in next.config.ts: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-DNS-Prefetch-Control: on`
- **Known gap**: no `Content-Security-Policy` header configured — future improvement
- No PII in URL parameters
- CRON_SECRET protects the sync endpoint

### 6. GDPR-Ready Placeholders (stubbed)

Sections with `<!-- TODO before launch with EU customers -->` markers:
- **Legal Basis per Data Category** — stub table: data category, legal basis (legitimate interest / consent / contract), justification
- **Retention Periods** — stub table: data category, retention period, deletion trigger
- **Data Subject Rights** — stub descriptions for: access, erasure, portability, rectification
- **Deletion Procedures** — stub: how to delete a user's data across all tables, cascade behavior

---

## Deliverable 2: OPS.md

### 1. Database Backups

**Primary provider: Neon** (provider-agnostic structure so switching is straightforward)

**Neon-specific:**
- Neon provides automatic daily backups and point-in-time recovery (PITR) on paid plans
- How to verify: Neon dashboard → Project → Settings (check backup/PITR configuration)
- Restore procedure: create a new branch from a point-in-time, update `DATABASE_URL` to the branch connection string, verify data, then promote or keep as the new primary

**Provider-agnostic notes:**
- Checklist of what to verify with any Postgres host: automatic backups enabled, PITR available, backup frequency, restore tested, retention period documented
- If migrating to Supabase: enable PITR in dashboard, backups are automatic on Pro plan

### 2. Deploy Pipeline

- **Platform**: Vercel, connected via Git integration
- **Flow**: push to `main` → Vercel auto-builds → preview URL generated → production deploy
- **PR previews**: every PR gets a preview deployment automatically
- **Build command**: `npm run build` (Next.js production build)
- **Pre-deploy**: `npm run db:migrate` (runs `prisma migrate deploy` — forward-only, safe for production)
- **Environment variables**: managed in Vercel dashboard (Settings → Environment Variables). Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`. Required for sync: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`. Recommended: `CRON_SECRET` (optional but strongly recommended for production — protects the sync endpoint)

### 3. Rollback

- **Application rollback**: Vercel dashboard → Deployments → select previous successful deployment → "Promote to Production". Or via CLI: `vercel rollback`
- **Database rollback**: Prisma migrations are forward-only. To revert a migration: create a new migration that undoes the changes (`prisma migrate diff` to generate SQL), apply it forward. Neon branching can also be used: restore a branch from before the migration, test, then promote.
- **When to rollback**: build passes but runtime errors appear, API responses change unexpectedly, sync jobs start failing

### 4. Cron & Sync Monitoring

- `/api/sync` runs every 15 minutes via Vercel Cron (configured in `vercel.json`)
- Protected by `CRON_SECRET` header check
- Sync pulls emails and calendar events from Microsoft Graph for all connected users
- **Monitoring**: Vercel dashboard → Functions → `/api/sync` → check invocation logs for errors
- Future: backlog item O-04 adds in-app failure alerting

### 5. Health Checks (post-deploy)

After every production deploy, verify:

1. **Build succeeded** — Vercel dashboard shows green deployment
2. **DB migrations applied** — `prisma migrate status` shows no pending migrations
3. **App loads** — Visit production URL, confirm dashboard renders
4. **Sync endpoint responds** — `curl -H "Authorization: Bearer $CRON_SECRET" https://<app-url>/api/sync` returns 200
5. **No console errors** — Check browser console on key pages (Home, Pipeline, Settings)

### 6. First-Response Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| App returns 500 on all pages | DB connection failed | Check `DATABASE_URL` in Vercel env vars; verify Neon project is running |
| Meetings/emails not appearing | Sync cron failed or no tokens | Check Vercel function logs for `/api/sync`; verify IntegrationToken exists |
| Build fails on deploy | Migration or type error | Check build logs; run `npm run build` locally to reproduce |
| Settings page shows stale data | API route error | Check browser network tab for 4xx/5xx on `/api/settings/*` |
| OAuth callback fails | Redirect URI mismatch | Verify `MICROSOFT_REDIRECT_URI` matches Azure app registration |
| Cron not firing | Vercel cron misconfigured | Check `vercel.json` cron entry; verify project is on a paid Vercel plan (cron requires Pro) |

---

## File Placement

- `/PRIVACY.md` — root level, next to README.md and DATABASE.md
- `/OPS.md` — root level, next to README.md and DATABASE.md

## Out of Scope

- Implementing GDPR compliance features (deletion endpoints, consent management)
- Setting up actual monitoring/alerting infrastructure (covered by backlog O-04)
- Token encryption (covered by backlog S-03)
- CI/CD pipeline beyond Vercel's built-in Git integration
