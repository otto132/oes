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
