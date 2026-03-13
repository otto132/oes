# Integrations Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Microsoft Graph integration for production: reliable dedup, multi-user sync, sync visibility, manual trigger, and OAuth safety.

**Architecture:** Incremental patches to existing sync files + new `runSync` helper for shared token iteration/refresh/logging. New `SyncLog` model for run history. Settings API returns real data instead of hardcoded status.

**Tech Stack:** Next.js 15, Prisma (PostgreSQL), NextAuth, React Query, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-integrations-hardening-design.md`

---

## Chunk 1: Schema & Migration

### Task 1: Schema changes — add IntegrationTokenStatus enum, externalId fields, SyncLog model

**Files:**
- Modify: `prisma/schema.prisma:530-598`

- [ ] **Step 1: Add IntegrationTokenStatus enum and update IntegrationToken model**

In `prisma/schema.prisma`, add before the `IntegrationToken` model:

```prisma
enum IntegrationTokenStatus {
  active
  error
  revoked
}
```

Update the `IntegrationToken` model to add `status`:

```prisma
model IntegrationToken {
  id           String                 @id @default(cuid())
  provider     String
  accessToken  String                 @db.Text
  refreshToken String                 @db.Text
  expiresAt    DateTime
  userEmail    String
  userId       String
  user         User                   @relation(fields: [userId], references: [id])
  status       IntegrationTokenStatus @default(active)
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt

  @@unique([provider, userId])
  @@map("integration_tokens")
}
```

- [ ] **Step 2: Add externalId to InboxEmail**

In `InboxEmail` model, add after `domain` field:

```prisma
  externalId  String?  @unique // Microsoft Graph message ID
```

- [ ] **Step 3: Update Meeting model — DateTime startTime, Int duration, externalId, attendeeEmails**

Replace the entire `Meeting` model:

```prisma
model Meeting {
  id             String            @id @default(cuid())
  title          String
  startTime      DateTime          // ISO datetime (was String "HH:MM")
  duration       Int               // minutes (was String "30 min")
  date           DateTime
  attendees      String[]          // display names
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

- [ ] **Step 4: Add SyncLog model and User relation**

Add new model after `Meeting`:

```prisma
model SyncLog {
  id          String   @id @default(cuid())
  type        String   // "email" | "calendar"
  status      String   // "success" | "partial" | "failed"
  itemsSynced Int      @default(0)
  errors      String[]
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  startedAt   DateTime @default(now())
  completedAt DateTime?

  @@index([userId, type, startedAt(sort: Desc)])
  @@map("sync_logs")
}
```

Add `syncLogs SyncLog[]` relation to the `User` model (after the `integrationTokens` relation field).

- [ ] **Step 5: Run migration**

Run: `npx prisma migrate dev --name integrations-hardening`
Expected: Migration created successfully, Prisma client regenerated.

Note: This is a destructive change for Meeting (String→DateTime, String→Int). If migration fails on existing data, reset with `npx prisma migrate reset` (pre-production).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add SyncLog model, externalId fields, IntegrationTokenStatus enum

- Add IntegrationTokenStatus enum (active/error/revoked) to IntegrationToken
- Add externalId to InboxEmail and Meeting for Graph API dedup
- Change Meeting.startTime from String to DateTime, duration from String to Int
- Add Meeting.attendeeEmails for re-matching
- Add SyncLog model for sync run history tracking

Part of integrations hardening (I-01 through I-05, DB-02)"
```

---

### Task 2: Update seed data for new Meeting field types

**Files:**
- Modify: `prisma/seed.ts:158-163`

- [ ] **Step 1: Update meeting seed data**

Replace the meeting seed section (lines 158-163):

```typescript
  // ── Meetings ───────────────────────────────────
  await prisma.meeting.createMany({ data: [
    { title: 'E.ON API Integration Review', startTime: new Date('2026-03-11T10:00:00Z'), duration: 60, date: new Date('2026-03-11'), attendees: ['Kai Mueller', 'Thomas Weber'], attendeeEmails: ['kai.mueller@eon.com', 'thomas.weber@eon.com'], prepStatus: 'ready', accountId: 'a3', accountName: 'E.ON Energy Markets' },
    { title: 'RWE Discovery Call', startTime: new Date('2026-03-20T14:00:00Z'), duration: 30, date: new Date('2026-03-20'), attendees: ['Maria Hoffmann'], attendeeEmails: ['maria.hoffmann@rwe.com'], prepStatus: 'draft', accountId: 'a6', accountName: 'RWE Renewables Europe' },
    { title: 'Axpo QBR — Q1 Review', startTime: new Date('2026-03-28T09:00:00Z'), duration: 90, date: new Date('2026-03-28'), attendees: ['Erik Sandvik', 'Nick Schoch'], attendeeEmails: ['erik.sandvik@axpo.com', 'nick.schoch@axpo.com'], prepStatus: 'ready', accountId: 'a5', accountName: 'Axpo Nordic AS' },
  ]});
```

- [ ] **Step 2: Run seed to verify**

Run: `npx prisma db seed`
Expected: Seed completes without errors, "✓ 3 meetings" printed.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix(seed): update meeting seed data for DateTime/Int field types"
```

---

### Task 3: Update adaptMeeting adapter and tests

**Files:**
- Modify: `src/lib/adapters.ts:450-473`
- Modify: `src/lib/__tests__/adapters.test.ts:689-722`

- [ ] **Step 1: Update the adaptMeeting test fixtures first (TDD)**

In `src/lib/__tests__/adapters.test.ts`, update the `adaptMeeting` describe block (lines 689-722):

```typescript
describe('adaptMeeting', () => {
  const base = {
    id: 'm1',
    title: 'Discovery Call',
    startTime: new Date('2025-06-20T10:00:00Z'),
    duration: 30,
    date: new Date('2025-06-20T00:00:00Z'),
    attendees: ['Alice', 'Bob'],
    attendeeEmails: ['alice@test.com', 'bob@test.com'],
    prepStatus: 'ready',
    accountId: 'a1' as string | null,
    accountName: 'Acme Corp' as string | null,
  };

  it('maps all fields correctly', () => {
    const result = adaptMeeting(base);
    expect(result).toEqual({
      id: 'm1',
      title: 'Discovery Call',
      time: '10:00',
      dur: '30 min',
      date: '2025-06-20T00:00:00.000Z',
      acc: 'Acme Corp',
      accId: 'a1',
      who: ['Alice', 'Bob'],
      prep: 'ready',
    });
  });

  it('formats duration as hours when >= 60 min', () => {
    const result = adaptMeeting({ ...base, duration: 90 });
    expect(result.dur).toBe('1h 30m');
  });

  it('formats duration as exact hours', () => {
    const result = adaptMeeting({ ...base, duration: 120 });
    expect(result.dur).toBe('2h');
  });

  it('defaults acc/accId to empty string when null', () => {
    const result = adaptMeeting({ ...base, accountId: null, accountName: null });
    expect(result.acc).toBe('');
    expect(result.accId).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/adapters.test.ts --reporter=verbose`
Expected: FAIL — `adaptMeeting` expects `string` for startTime/duration but receives `Date`/`number`.

- [ ] **Step 3: Update adaptMeeting implementation**

In `src/lib/adapters.ts`, replace the `adaptMeeting` function (lines 450-473):

```typescript
export function adaptMeeting(m: {
  id: string;
  title: string;
  startTime: Date;
  duration: number;
  date: Date;
  attendees: string[];
  prepStatus: string;
  accountId: string | null;
  accountName: string | null;
  [k: string]: unknown;
}): UIMeeting {
  // Format DateTime to "HH:MM" for display
  const hours = m.startTime.getUTCHours().toString().padStart(2, '0');
  const mins = m.startTime.getUTCMinutes().toString().padStart(2, '0');
  const time = `${hours}:${mins}`;

  // Format duration (minutes) to display string
  let dur: string;
  if (m.duration < 60) {
    dur = `${m.duration} min`;
  } else if (m.duration % 60 === 0) {
    dur = `${m.duration / 60}h`;
  } else {
    dur = `${Math.floor(m.duration / 60)}h ${m.duration % 60}m`;
  }

  return {
    id: m.id,
    title: m.title,
    time,
    dur,
    date: m.date.toISOString(),
    acc: m.accountName ?? '',
    accId: m.accountId ?? '',
    who: m.attendees,
    prep: m.prepStatus as UIMeeting['prep'],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/adapters.test.ts --reporter=verbose`
Expected: All adaptMeeting tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat(adapters): update adaptMeeting for DateTime/Int field types

startTime is now Date (formatted to HH:MM for UI), duration is now
Int in minutes (formatted to display string)."
```

---

## Chunk 2: runSync Helper & Sync Refactoring

### Task 4: Create runSync helper

**Files:**
- Create: `src/lib/integrations/run-sync.ts`

- [ ] **Step 1: Create the runSync helper**

Create `src/lib/integrations/run-sync.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// Shared Sync Runner
// ═══════════════════════════════════════════════════════════════
// Handles: user iteration, token refresh, error handling, SyncLog writes.
// Email and calendar sync pass their specific logic as syncFn.

import { db } from '@/lib/db';
import { refreshAccessToken } from './microsoft-graph';
import type { IntegrationToken, User } from '@prisma/client';

export interface SyncResult {
  synced: number;
  errors: string[];
}

interface RunSyncOptions {
  type: 'email' | 'calendar';
  syncFn: (token: IntegrationToken & { user: User }, accessToken: string) => Promise<SyncResult>;
}

export async function runSync({ type, syncFn }: RunSyncOptions): Promise<SyncResult> {
  const tokens = await db.integrationToken.findMany({
    where: { provider: 'microsoft', status: 'active', user: { isActive: true } },
    include: { user: true },
  });

  if (tokens.length === 0) {
    return { synced: 0, errors: ['No active Microsoft tokens found — users need to connect Outlook'] };
  }

  let totalSynced = 0;
  const allErrors: string[] = [];

  for (const tokenRow of tokens) {
    const startedAt = new Date();

    try {
      // Refresh token if expired
      let accessToken = tokenRow.accessToken;
      if (tokenRow.expiresAt < new Date()) {
        try {
          const refreshed = await refreshAccessToken(tokenRow.refreshToken);
          accessToken = refreshed.access_token;
          await db.integrationToken.update({
            where: { id: tokenRow.id },
            data: {
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
              status: 'active',
            },
          });
        } catch (err) {
          // Mark token as error so Settings shows "Reconnect"
          await db.integrationToken.update({
            where: { id: tokenRow.id },
            data: { status: 'error' },
          });
          const errorMsg = `Token refresh failed for ${tokenRow.userEmail} — reconnect Outlook`;
          allErrors.push(errorMsg);

          // Log failed sync
          await db.syncLog.create({
            data: {
              type,
              status: 'failed',
              itemsSynced: 0,
              errors: [errorMsg],
              userId: tokenRow.userId,
              startedAt,
              completedAt: new Date(),
            },
          });
          continue;
        }
      }

      // Run the sync function for this user
      const result = await syncFn(tokenRow, accessToken);
      totalSynced += result.synced;
      allErrors.push(...result.errors);

      // Log sync result
      await db.syncLog.create({
        data: {
          type,
          status: result.errors.length === 0 ? 'success' : 'partial',
          itemsSynced: result.synced,
          errors: result.errors,
          userId: tokenRow.userId,
          startedAt,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      const errorMsg = `Sync failed for user ${tokenRow.userEmail}: ${err}`;
      allErrors.push(errorMsg);

      await db.syncLog.create({
        data: {
          type,
          status: 'failed',
          itemsSynced: 0,
          errors: [errorMsg],
          userId: tokenRow.userId,
          startedAt,
          completedAt: new Date(),
        },
      });
    }
  }

  return { synced: totalSynced, errors: allErrors };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/integrations/run-sync.ts
git commit -m "feat(sync): add runSync helper for shared token iteration and SyncLog"
```

---

### Task 5: Refactor email sync to use runSync and externalId dedup

**Files:**
- Modify: `src/lib/integrations/email-sync.ts`

- [ ] **Step 1: Rewrite syncEmails to use runSync**

Replace the entire `syncEmails` function (lines 84-179) with:

```typescript
export async function syncEmails(): Promise<{ synced: number; errors: string[] }> {
  return runSync({
    type: 'email',
    syncFn: async (tokenRow, accessToken) => {
      let synced = 0;
      const errors: string[] = [];

      // Fetch emails from last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let graphEmails: GraphEmail[];
      try {
        graphEmails = await fetchRecentEmails(accessToken, since);
      } catch (err) {
        errors.push(`Graph API error for ${tokenRow.userEmail}: ${err}`);
        return { synced, errors };
      }

      for (const ge of graphEmails) {
        try {
          const graphId = ge.id;

          // Dedup by externalId (Graph message ID) using upsert for race safety
          if (graphId) {
            const existing = await db.inboxEmail.findUnique({
              where: { externalId: graphId },
              select: { id: true },
            });
            if (existing) continue;
          } else {
            // Fallback dedup for emails without Graph ID (backward compat)
            const existing = await db.inboxEmail.findFirst({
              where: {
                subject: ge.subject,
                fromEmail: ge.from.emailAddress.address,
                receivedAt: new Date(ge.receivedDateTime),
              },
            });
            if (existing) continue;
          }

          // Match to account
          const match = await matchDomainToAccount(ge.from.emailAddress.address);
          const domain = ge.from.emailAddress.address.split('@')[1];

          // Classify
          let { cls, conf } = classifyEmail(ge.subject, ge.bodyPreview, ge.from.emailAddress.address);
          if (!match && cls !== 'auto_reply' && cls !== 'bounce') {
            cls = 'new_domain';
          }

          // Store
          await db.inboxEmail.create({
            data: {
              externalId: graphId || null,
              subject: ge.subject,
              fromEmail: ge.from.emailAddress.address,
              fromName: ge.from.emailAddress.name,
              preview: ge.bodyPreview.slice(0, 500),
              receivedAt: new Date(ge.receivedDateTime),
              isUnread: !ge.isRead,
              classification: cls,
              classificationConf: conf,
              isLinked: !!match,
              accountId: match?.accountId || null,
              accountName: match?.accountName || null,
              domain: !match ? domain : null,
            },
          });
          synced++;
        } catch (err) {
          errors.push(`Failed to sync email "${ge.subject}": ${err}`);
        }
      }

      return { synced, errors };
    },
  });
}
```

Update imports at the top of the file — add `runSync`:

```typescript
import { db } from '@/lib/db';
import { fetchRecentEmails, refreshAccessToken, type GraphEmail } from './microsoft-graph';
import { runSync } from './run-sync';
```

Note: `refreshAccessToken` import can be kept for now (it's used by `runSync` internally but removing unused imports is fine too).

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/integrations/email-sync.ts
git commit -m "feat(email-sync): use runSync helper and externalId dedup

- Dedup by Graph message ID (externalId) instead of subject+from+receivedAt
- Use runSync for multi-user token iteration and SyncLog writes
- Token refresh failures now mark token status as error"
```

---

### Task 6: Refactor calendar sync — runSync, externalId, ISO times, attendee emails

**Files:**
- Modify: `src/lib/integrations/calendar-sync.ts`

- [ ] **Step 1: Rewrite calendar sync**

Replace the entire file content:

```typescript
// ═══════════════════════════════════════════════════════════════
// Calendar Sync Service
// ═══════════════════════════════════════════════════════════════
// Fetches calendar events from Microsoft Graph, matches attendees
// to contacts/accounts, and stores in meetings table.

import { db } from '@/lib/db';
import { fetchUpcomingEvents, type GraphEvent } from './microsoft-graph';
import { runSync } from './run-sync';

// Match attendee email to a contact → account
async function matchAttendeeToAccount(email: string): Promise<{ accountId: string; accountName: string } | null> {
  const contact = await db.contact.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { account: { select: { id: true, name: true } } },
  });
  if (contact) return { accountId: contact.account.id, accountName: contact.account.name };
  return null;
}

export async function syncCalendar(): Promise<{ synced: number; errors: string[] }> {
  return runSync({
    type: 'calendar',
    syncFn: async (tokenRow, accessToken) => {
      let synced = 0;
      const errors: string[] = [];

      // Fetch next 14 days of events
      let events: GraphEvent[];
      try {
        events = await fetchUpcomingEvents(accessToken, 14);
      } catch (err) {
        errors.push(`Graph API error for ${tokenRow.userEmail}: ${err}`);
        return { synced, errors };
      }

      for (const ev of events) {
        try {
          if (ev.isAllDay) continue;

          const graphId = ev.id;

          // Dedup by externalId (Graph event ID)
          if (graphId) {
            const existing = await db.meeting.findUnique({
              where: { externalId: graphId },
              select: { id: true },
            });
            if (existing) continue;
          } else {
            // Fallback dedup by title + date
            const evDate = new Date(ev.start.dateTime);
            const startOfDay = new Date(evDate); startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(evDate); endOfDay.setHours(23, 59, 59, 999);
            const existing = await db.meeting.findFirst({
              where: { title: ev.subject, date: { gte: startOfDay, lte: endOfDay } },
            });
            if (existing) continue;
          }

          // Parse start/end times
          const startTime = new Date(ev.start.dateTime);
          const endTime = new Date(ev.end.dateTime);
          const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

          // Match attendees to accounts
          const externalAttendees = ev.attendees.filter(a => a.type !== 'organizer');
          const attendeeNames = externalAttendees.map(a => a.emailAddress.name);
          const attendeeEmails = externalAttendees.map(a => a.emailAddress.address);
          let accountMatch: { accountId: string; accountName: string } | null = null;

          for (const att of externalAttendees) {
            const match = await matchAttendeeToAccount(att.emailAddress.address);
            if (match) { accountMatch = match; break; }
          }

          await db.meeting.create({
            data: {
              externalId: graphId || null,
              title: ev.subject,
              startTime,
              duration,
              date: new Date(ev.start.dateTime),
              attendees: attendeeNames,
              attendeeEmails,
              prepStatus: 'draft',
              accountId: accountMatch?.accountId || null,
              accountName: accountMatch?.accountName || null,
            },
          });
          synced++;
        } catch (err) {
          errors.push(`Failed to sync event "${ev.subject}": ${err}`);
        }
      }

      return { synced, errors };
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/integrations/calendar-sync.ts
git commit -m "feat(calendar-sync): use runSync, externalId dedup, ISO times, attendee emails

- Dedup by Graph event ID instead of title+date
- Store startTime as DateTime, duration as Int (minutes)
- Store attendeeEmails alongside attendee names
- Use runSync for multi-user token iteration and SyncLog writes"
```

---

### Task 7: Update home route for new Meeting types

**Files:**
- Modify: `src/app/api/home/route.ts:22`

- [ ] **Step 1: Update meeting query orderBy**

In `src/app/api/home/route.ts` line 22, `orderBy: { startTime: 'asc' }` still works with DateTime. No code change needed — `startTime` as DateTime sorts correctly.

Verify the `adaptMeeting` call on line 50 still works: `todayMeetings.map(adaptMeeting)` — yes, Prisma returns `Date` objects for DateTime fields which matches the updated adapter signature.

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors related to home route.

- [ ] **Step 3: Commit (skip if no changes needed)**

If no changes were needed, skip this commit.

---

## Chunk 3: OAuth Hardening

### Task 8: Harden OAuth connect route

**Files:**
- Modify: `src/app/api/auth/connect/route.ts`

- [ ] **Step 1: Add session check**

Replace the full file:

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAuthUrl } from '@/lib/integrations/microsoft-graph';

// GET /api/auth/connect — redirect user to Microsoft login
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    // Return to connect flow after signing in
    return NextResponse.redirect(new URL('/auth/signin?callbackUrl=/api/auth/connect', process.env.NEXTAUTH_URL || 'http://localhost:3000'));
  }

  const url = getAuthUrl('outlook_connect');
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/auth/connect/route.ts
git commit -m "fix(oauth): add session check to connect route

Unauthenticated users are redirected to sign-in with a callbackUrl
that returns them to the connect flow after authentication."
```

---

### Task 9: Harden OAuth callback route — state validation

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Add state parameter validation**

In `src/app/api/auth/callback/route.ts`, add state validation after the `code` check (after line 17). Insert before the session check:

```typescript
  // CSRF prevention: validate state parameter
  const state = req.nextUrl.searchParams.get('state');
  if (state !== 'outlook_connect') {
    return NextResponse.redirect(new URL('/settings?error=invalid_state', req.url));
  }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/callback/route.ts
git commit -m "fix(oauth): add state parameter validation to callback route

Validates state === 'outlook_connect' to prevent CSRF attacks on
the OAuth callback endpoint."
```

---

## Chunk 4: Settings API & Frontend

### Task 10: Rewrite Settings integrations API with real data

**Files:**
- Modify: `src/app/api/settings/integrations/route.ts`

- [ ] **Step 1: Rewrite the GET handler**

Replace the full file:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const userId = session.user.id;

  // Fetch user's Microsoft token
  const msToken = await db.integrationToken.findUnique({
    where: { provider_userId: { provider: 'microsoft', userId } },
    select: { status: true, expiresAt: true, updatedAt: true },
  });

  // Fetch latest sync logs for this user
  const [lastEmailSync, lastCalendarSync] = await Promise.all([
    db.syncLog.findFirst({
      where: { userId, type: 'email' },
      orderBy: { startedAt: 'desc' },
      select: { status: true, itemsSynced: true, errors: true, completedAt: true, startedAt: true },
    }),
    db.syncLog.findFirst({
      where: { userId, type: 'calendar' },
      orderBy: { startedAt: 'desc' },
      select: { status: true, itemsSynced: true, errors: true, completedAt: true, startedAt: true },
    }),
  ]);

  // Fetch sync history (last 5 entries)
  const syncHistory = await db.syncLog.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: { id: true, type: true, status: true, itemsSynced: true, errors: true, startedAt: true, completedAt: true },
  });

  // Counts
  const [emailCount, meetingCount] = await Promise.all([
    db.inboxEmail.count(),
    db.meeting.count(),
  ]);

  const isConnected = msToken !== null && msToken.status === 'active' && msToken.expiresAt > new Date();
  const needsReconnect = msToken?.status === 'error' || msToken?.status === 'revoked';

  const lastEmailError = lastEmailSync?.status === 'failed' || lastEmailSync?.status === 'partial'
    ? lastEmailSync.errors[0] || null
    : null;
  const lastCalendarError = lastCalendarSync?.status === 'failed' || lastCalendarSync?.status === 'partial'
    ? lastCalendarSync.errors[0] || null
    : null;

  const integrations = [
    {
      provider: 'microsoft',
      name: 'Microsoft 365 / Outlook',
      status: isConnected ? 'connected' : needsReconnect ? 'error' : 'disconnected',
      active: isConnected,
      needsReconnect,
      lastSyncAt: lastEmailSync?.completedAt?.toISOString() || null,
      emailsSynced: emailCount,
      lastError: lastEmailError,
    },
    {
      provider: 'calendar',
      name: 'Calendar Sync',
      status: isConnected ? 'connected' : needsReconnect ? 'error' : 'disconnected',
      active: isConnected,
      needsReconnect,
      lastSyncAt: lastCalendarSync?.completedAt?.toISOString() || null,
      meetingsSynced: meetingCount,
      lastError: lastCalendarError,
    },
    {
      provider: 'linkedin',
      name: 'LinkedIn (manual)',
      status: 'manual',
      active: false,
      needsReconnect: false,
      lastSyncAt: null,
      lastError: null,
    },
  ];

  return NextResponse.json({
    data: integrations,
    syncHistory: syncHistory.map(s => ({
      id: s.id,
      type: s.type,
      status: s.status,
      itemsSynced: s.itemsSynced,
      errorCount: s.errors.length,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() || null,
    })),
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/integrations/route.ts
git commit -m "feat(settings-api): return real integration status, sync history, counts

- Query scoped to session.user.id for data isolation
- Returns token status, last sync timestamps, email/meeting counts
- Includes last 5 SyncLog entries as syncHistory
- Shows needsReconnect flag when token is in error state"
```

---

### Task 11: Update settings integrations test

**Files:**
- Modify: `src/app/api/__tests__/settings-integrations.test.ts`

- [ ] **Step 1: Rewrite tests for new response shape**

Replace the full file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      integrationToken: { findUnique: fn(), findFirst: fn() },
      syncLog: { findFirst: fn(), findMany: fn() },
      inboxEmail: { count: fn() },
      meeting: { count: fn() },
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import { GET } from '../settings/integrations/route';

function mockAuth(userId = 'user-1') {
  mockAuthFn.mockResolvedValue({ user: { id: userId } });
}

function setupDefaultMocks() {
  mockDb.syncLog.findFirst.mockResolvedValue(null);
  mockDb.syncLog.findMany.mockResolvedValue([]);
  mockDb.inboxEmail.count.mockResolvedValue(0);
  mockDb.meeting.count.mockResolvedValue(0);
}

describe('GET /api/settings/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns disconnected when no Microsoft token exists', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(3);
    expect(json.data[0]).toMatchObject({
      provider: 'microsoft',
      status: 'disconnected',
      active: false,
      needsReconnect: false,
    });
  });

  it('returns error status when token status is error', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue({
      status: 'error',
      expiresAt: new Date(Date.now() + 3600_000),
      updatedAt: new Date(),
    });

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({
      status: 'error',
      active: false,
      needsReconnect: true,
    });
  });

  it('returns connected when valid active token exists', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue({
      status: 'active',
      expiresAt: new Date(Date.now() + 3600_000),
      updatedAt: new Date('2026-03-13T10:00:00Z'),
    });
    mockDb.inboxEmail.count.mockResolvedValue(42);
    mockDb.meeting.count.mockResolvedValue(5);

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({
      provider: 'microsoft',
      status: 'connected',
      active: true,
      emailsSynced: 42,
    });
    expect(json.data[1]).toMatchObject({
      provider: 'calendar',
      status: 'connected',
      active: true,
      meetingsSynced: 5,
    });
  });

  it('includes syncHistory in response', async () => {
    mockAuth();
    mockDb.integrationToken.findUnique.mockResolvedValue(null);
    mockDb.syncLog.findMany.mockResolvedValue([
      { id: 's1', type: 'email', status: 'success', itemsSynced: 10, errors: [], startedAt: new Date(), completedAt: new Date() },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(json.syncHistory).toHaveLength(1);
    expect(json.syncHistory[0]).toMatchObject({ id: 's1', type: 'email', errorCount: 0 });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/app/api/__tests__/settings-integrations.test.ts --reporter=verbose`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/__tests__/settings-integrations.test.ts
git commit -m "test(settings): update integrations test for new response shape

Tests: disconnected state, error/reconnect state, connected with
counts, syncHistory inclusion."
```

---

### Task 12: Add useSyncMutation hook

**Files:**
- Modify: `src/lib/queries/settings.ts`

- [ ] **Step 1: Add the hook**

Add at the end of `src/lib/queries/settings.ts`, before the closing of the file:

```typescript
// Trigger manual sync
export function useSyncMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: string = 'all') => api.sync.trigger(type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.integrations() });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/settings.ts
git commit -m "feat(queries): add useSyncMutation hook for manual sync trigger"
```

---

### Task 13: Update IntegrationsTab with Sync Now button and enriched status

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx:390-415`

- [ ] **Step 1: Update IntegrationsTab component**

Add import for `useSyncMutation` at the top of the file alongside other settings imports. Also import `useSession` from next-auth if not already imported.

Replace the `IntegrationsTab` function (lines 390-415):

```typescript
function IntegrationsTab() {
  const integrations = useIntegrationsQuery();
  const syncMutation = useSyncMutation();
  const session = useSession();
  const isAdmin = session.data?.user?.role === 'ADMIN';

  function handleSync() {
    syncMutation.mutate('all');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Integrations</span>
        {isAdmin && (
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="px-3 py-1 text-[10px] font-medium bg-brand text-white rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
          >
            {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>

      {syncMutation.isSuccess && (
        <div className="text-[10px] text-brand bg-brand/10 px-3 py-1.5 rounded-md">
          Sync complete — {syncMutation.data?.synced ?? 0} items synced
          {(syncMutation.data?.errors?.length ?? 0) > 0 && `, ${syncMutation.data.errors.length} errors`}
        </div>
      )}
      {syncMutation.isError && (
        <div className="text-[10px] text-red-400 bg-red-400/10 px-3 py-1.5 rounded-md">
          Sync failed — {syncMutation.error instanceof Error ? syncMutation.error.message : 'Unknown error'}
        </div>
      )}

      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        {integrations.isLoading ? (
          <div className="text-[11px] text-muted py-2">Loading integrations...</div>
        ) : integrations.isError ? (
          <div className="text-[11px] text-red-400 py-2">Failed to load integrations</div>
        ) : (
          integrations.data?.data?.map((i: any) => (
            <div key={i.provider || i.name} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[12.5px]">{i.name}</span>
                <div className="flex items-center gap-2 text-[9px] text-muted">
                  {i.lastSyncAt && <span>Last sync: {new Date(i.lastSyncAt).toLocaleString()}</span>}
                  {i.emailsSynced != null && <span>{i.emailsSynced} emails</span>}
                  {i.meetingsSynced != null && <span>{i.meetingsSynced} meetings</span>}
                </div>
                {i.lastError && (
                  <span className="text-[9px] text-red-400">{i.lastError}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${i.active ? 'text-brand' : i.needsReconnect ? 'text-red-400' : 'text-muted'}`}>
                  {i.active ? 'Connected' : i.needsReconnect ? 'Reconnect' : i.status === 'manual' ? 'Manual' : 'Disconnected'}
                </span>
                {i.provider !== 'linkedin' && (
                  <button className="px-2 py-1 text-[11px] text-sub hover:bg-[var(--hover)] rounded-md transition-colors">
                    {i.needsReconnect ? 'Reconnect' : i.active ? 'Disconnect' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Ensure imports are correct**

At the top of the settings page file, ensure these are imported:

```typescript
import { useIntegrationsQuery, useSyncMutation, /* ... other existing imports */ } from '@/lib/queries/settings';
```

Also ensure `useSession` is available (check if it's already imported from next-auth/react).

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat(settings): add Sync Now button and enriched integration status

- Sync Now button (admin-only) triggers manual sync
- Shows sync result feedback (success count or error)
- Displays last sync time, email/meeting counts, last error
- Shows Reconnect state when token is in error"
```

---

## Chunk 5: Verification

### Task 14: Run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Fix any failures**

If any test or build fails, fix the issue and re-run. Common issues:
- Import paths
- Missing mock setup for new DB methods
- Type mismatches from Meeting field type changes

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address test/build issues from integrations hardening"
```

---

### Task 15: Update BACKLOG.md status

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Mark completed items as Done**

Update the following rows in BACKLOG.md, changing `Not started` to `Done`:
- I-01: Verify Microsoft OAuth flow end-to-end
- I-02: Add per-user token storage
- I-03: Email sync dedup by Graph message ID
- I-04: Add sync status visibility to Settings
- I-05: Add manual "Sync Now" button
- DB-02: Add externalId to InboxEmail for Graph dedup

- [ ] **Step 2: Commit**

```bash
git add BACKLOG.md
git commit -m "docs: mark I-01 through I-05 and DB-02 as Done in backlog"
```
