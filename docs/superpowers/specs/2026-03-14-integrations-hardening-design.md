# Integrations Hardening — Design Spec

> Date: 2026-03-14
> Scope: I-01, I-02 (fix), I-03/DB-02, I-04, I-05, plus 5 improvements
> Approach: C — incremental patches + lightweight SyncLog + runSync helper

---

## Problem

The Microsoft Graph integration has working OAuth, email sync, and calendar sync code, but several reliability and visibility gaps make it unsuitable for production:

- Email dedup uses subject+from+receivedAt instead of Graph message ID (fragile)
- Calendar dedup uses title+date (equally fragile)
- Calendar stores formatted time strings instead of ISO datetimes (breaks timezone handling)
- Sync only processes the first user token found, not all users
- Token refresh failures are silent — no user feedback
- Settings shows hardcoded "Connected" with no real sync data
- No manual sync trigger from UI
- No sync run history for debugging
- Attendee emails discarded during calendar sync

## Scope

### Backlog Items

| ID | Summary |
|----|---------|
| I-01 | Harden OAuth connect/callback flow (error handling, state validation) |
| I-02 | Fix sync to iterate all user tokens (schema already supports per-user) |
| I-03 / DB-02 | Add `externalId` to InboxEmail for Graph message ID dedup |
| I-04 | Settings shows real sync status, counts, last error |
| I-05 | Manual "Sync Now" button in Settings |

### Additional Improvements

| # | Summary |
|---|---------|
| 1 | Add `externalId` to Meeting for Graph event ID dedup |
| 2 | Change Meeting `startTime` to DateTime, `duration` to Int (minutes) |
| 3 | Add SyncLog model for sync run history |
| 4 | Store attendee emails alongside names in Meeting |
| 5 | Mark token status on refresh failure (minimal I-07) |

---

## Schema Changes

### InboxEmail — add externalId

```prisma
model InboxEmail {
  // ... existing fields ...
  externalId String? @unique  // Microsoft Graph message ID
}
```

### Meeting — fix types, add externalId and attendeeEmails

```prisma
model Meeting {
  id             String            @id @default(cuid())
  title          String
  startTime      DateTime          // was String "HH:MM" — now ISO datetime
  duration       Int               // was String "1h 30m" — now minutes
  date           DateTime
  attendees      String[]          // display names (kept for backward compat)
  attendeeEmails String[]          // email addresses for re-matching
  externalId     String?  @unique  // Microsoft Graph event ID
  prepStatus     MeetingPrepStatus @default(draft)
  createdAt      DateTime          @default(now())

  accountId   String?
  accountName String?

  @@index([date])
  @@map("meetings")
}
```

### IntegrationToken — add status

```prisma
model IntegrationToken {
  // ... existing fields ...
  status String @default("active")  // active | error | revoked
}
```

### New: SyncLog

```prisma
model SyncLog {
  id          String   @id @default(cuid())
  type        String   // "email" | "calendar"
  status      String   // "success" | "partial" | "failed"
  itemsSynced Int      @default(0)
  errors      String[] // error messages from the run
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  startedAt   DateTime @default(now())
  completedAt DateTime?

  @@index([userId, type, startedAt(sort: Desc)])
  @@map("sync_logs")
}
```

Migration note: The Meeting `startTime` (String → DateTime) and `duration` (String → Int) changes require a data migration. Since this is pre-production, a destructive migration (drop and recreate Meeting data, re-seed) is acceptable. If existing meeting data must be preserved, a migration script will parse "HH:MM" strings into DateTimes and "Xh Ym" into minutes.

---

## runSync Helper

A shared helper function that encapsulates the common sync pattern. Not a class or abstraction layer — just a function that reduces duplication between email and calendar sync.

```typescript
// src/lib/integrations/run-sync.ts

interface RunSyncOptions {
  type: 'email' | 'calendar'
  syncFn: (token: IntegrationToken) => Promise<{ synced: number; errors: string[] }>
}

async function runSync({ type, syncFn }: RunSyncOptions): Promise<SyncRunResult> {
  // 1. Find all users with active tokens for provider "microsoft"
  // 2. For each user:
  //    a. Check token expiry, refresh if needed
  //    b. On refresh failure: mark token status='error', skip user, log error
  //    c. On success: call syncFn with refreshed token
  //    d. Create SyncLog entry with results
  // 3. Return aggregate results
}
```

Email sync and calendar sync each pass their specific fetch/store logic as `syncFn`. The helper handles: user iteration, token refresh, error handling, SyncLog writes, token status updates.

This structure makes future extraction to an adapter pattern trivial when more integrations arrive.

---

## Email Sync Changes

File: `src/lib/integrations/email-sync.ts`

1. **Dedup by externalId**: Check `InboxEmail.externalId` against Graph message `id` before insert. Fall back to subject+from+receivedAt for emails without an externalId (backward compat with existing data).
2. **Store externalId**: Save `email.id` from Graph response as `externalId` on insert.
3. **Use runSync**: Replace manual token iteration with `runSync({ type: 'email', syncFn })`.
4. **syncFn signature**: Accepts a single `IntegrationToken`, returns `{ synced, errors }`.

No changes to: domain matching, intent classification, account linking.

---

## Calendar Sync Changes

File: `src/lib/integrations/calendar-sync.ts`

1. **Dedup by externalId**: Check `Meeting.externalId` against Graph event `id`.
2. **Store ISO datetime**: Parse Graph event `start.dateTime` + `start.timeZone` into a proper `DateTime` for `startTime`. Store timezone info from Graph.
3. **Store duration as minutes**: Calculate `(end - start)` in minutes, store as `Int`.
4. **Store attendee emails**: Save `attendee.emailAddress.address` into `attendeeEmails[]` alongside display names in `attendees[]`.
5. **Use runSync**: Same pattern as email sync.

`formatTime()` and `formatDuration()` helpers become presentation-layer concerns (used in UI, not in storage).

---

## OAuth Hardening (I-01)

File: `src/app/api/auth/callback/route.ts`

1. **Validate state parameter**: Check `state === 'outlook_connect'` before processing.
2. **Error redirect**: On failure, redirect to `/settings?error=oauth_failed&message=...` instead of throwing.
3. **Missing code handling**: If `code` param missing, redirect with error.
4. **Session check**: If no session, redirect to `/auth/signin?callbackUrl=/settings`.

File: `src/app/api/auth/connect/route.ts`

1. **Session check**: Require active session before redirecting to Microsoft.

---

## Settings API Enrichment (I-04)

File: `src/app/api/settings/integrations/route.ts`

Replace hardcoded response with real data:

```typescript
// Per-user integration status
{
  provider: "microsoft",
  name: "Microsoft 365 / Outlook",
  status: token ? (token.status === 'active' ? 'connected' : 'error') : 'disconnected',
  needsReconnect: token?.status === 'error',
  lastSyncAt: lastSyncLog?.completedAt,      // from SyncLog
  emailsSynced: emailCount,                    // count from InboxEmail
  meetingsSynced: meetingCount,                // count from Meeting
  lastError: lastFailedLog?.errors?.[0],       // from SyncLog
  syncHistory: recentLogs                      // last 5 SyncLog entries
}
```

---

## Manual Sync Button (I-05)

### API

The `POST /api/sync` route already supports manual triggers with ADMIN auth. No API changes needed.

### Frontend

File: `src/app/(dashboard)/settings/page.tsx` (IntegrationsTab)

1. Add "Sync Now" button next to connection status.
2. On click: call `api.sync.trigger('all')`.
3. Show loading spinner during sync.
4. On completion: show toast with results ("Synced 12 emails, 3 meetings") or error.
5. Invalidate `['settings', 'integrations']` query to refresh status.
6. Button disabled during sync and for non-admin users.

### Query Hook

File: `src/lib/queries/settings.ts`

Add `useSyncMutation()` hook wrapping `api.sync.trigger()` with React Query mutation, including `onSuccess` invalidation and toast.

---

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add externalId to InboxEmail, refactor Meeting fields, add SyncLog model, add status to IntegrationToken |
| `src/lib/integrations/run-sync.ts` | New — shared sync runner helper |
| `src/lib/integrations/email-sync.ts` | Use runSync, dedup by externalId, store externalId |
| `src/lib/integrations/calendar-sync.ts` | Use runSync, dedup by externalId, ISO times, duration as int, store attendee emails |
| `src/app/api/auth/callback/route.ts` | State validation, error redirects, session check |
| `src/app/api/auth/connect/route.ts` | Session check |
| `src/app/api/settings/integrations/route.ts` | Real data from tokens + SyncLog + counts |
| `src/app/(dashboard)/settings/page.tsx` | Sync Now button, enriched status display |
| `src/lib/queries/settings.ts` | Add useSyncMutation hook |
| `src/lib/api-client.ts` | No changes needed (sync.trigger already exists) |
| `prisma/seed.ts` | Update Meeting seed data for new field types |
| `src/app/api/sync/route.ts` | Minor — pass through individual user results |
| `src/app/api/__tests__/settings-integrations.test.ts` | Update for new response shape |

---

## Testing Strategy

- **Unit tests**: runSync helper (mock token iteration, refresh, error cases), externalId dedup logic
- **Integration tests**: Settings API returns correct shape, sync endpoint creates SyncLog entries
- **Existing tests**: Update settings-integrations test for new response format
- **Manual verification**: OAuth flow (if credentials available), sync button UX

---

## Out of Scope

- Token encryption at rest (S-04) — separate security item
- Full token revocation handling (I-07) — only minimal status marking included
- Sync retry with exponential backoff (I-06) — separate ops item
- Future integration architecture (I-09) — deferred until third integration
- Calendar timezone display in UI (I-08 frontend) — storage fixed here, display is separate
