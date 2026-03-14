# Core Workflows, Security & Privacy — Design Spec

**Date:** 2026-03-14
**Scope:** W-18, S-04, S-10, S-11, S-12, P-02, P-03, P-04, P-06
**Dropped:** W-16 (done), W-17 (done), P-05 (deferred — no analytics planned)

---

## 1. Overview

Nine backlog items across three categories, ordered by dependency:

**Infrastructure (build first):**
1. S-04 — Encrypt OAuth tokens at rest
2. S-12 — Sensitive data log redaction
3. S-10 — Admin action audit logging
4. S-11 — Data access boundary enforcement
5. P-06 — Access logging for sensitive data views

**Features (build after infrastructure):**
6. P-02 — Data retention policy & cleanup
7. P-03 — Data export for contacts/accounts
8. P-04 — Contact deletion with cascade
9. W-18 — Meeting prep & outcome logging

---

## 2. Schema Changes

### 2.1 New Models

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  userId     String?  // null for system-triggered actions (cron jobs)
  user       User?    @relation("AuditLogUser", fields: [userId], references: [id])
  action     String   // constants from AUDIT_ACTIONS, not an enum
  entityType String   // "User", "Contact", "AgentConfig", etc.
  entityId   String
  before     Json?    // snapshot before mutation
  after      Json?    // snapshot after mutation
  metadata   Json?    // extra context (e.g., export format, retention counts)
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("audit_logs")
}

model AccessLog {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation("AccessLogUser", fields: [userId], references: [id])
  entityType String   // "Account", "Meeting", "Export"
  entityId   String
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@map("access_logs")
}
```

Note: Both models have a formal `@relation` to `User` for FK integrity and join support. The `User` model gains corresponding relation fields:
```prisma
// Add to User model:
auditLogs  AuditLog[]  @relation("AuditLogUser")
accessLogs AccessLog[] @relation("AccessLogUser")

model DataRetentionRun {
  id               String    @id @default(cuid())
  archivedEmails   Int       @default(0)
  dismissedSignals Int       @default(0)
  syncLogs         Int       @default(0)
  accessLogs       Int       @default(0)
  startedAt        DateTime  @default(now())
  completedAt      DateTime?

  @@map("data_retention_runs")
}
```

### 2.2 Modified Models

**IntegrationToken** — add field:
```prisma
tokenVersion Int @default(1) // encryption key version for rotation
```

**Meeting** — add field:
```prisma
prepNotes String? @db.Text // user's talking points / agenda
```

### 2.3 Models NOT Changed

No `workspaceId` added anywhere. Workspace/tenant model is deferred to A-09. Data access boundaries (S-11) use existing `ownerId` fields.

---

## 3. Security Infrastructure

### 3.1 S-04 — Token Encryption at Rest

**New file:** `src/lib/crypto.ts`

```
encrypt(plaintext: string): string
  → returns "v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>"

decrypt(encrypted: string): string
  → parses version prefix, decrypts with matching key
```

- Algorithm: AES-256-GCM (authenticated encryption)
- Key source: `TOKEN_ENCRYPTION_KEY` env var (32 bytes, base64-encoded)
- Version prefix (`v1:`) enables key rotation

**Key rotation flow:**
- When `TOKEN_ENCRYPTION_KEY_V2` is present in env:
  - `decrypt()` tries current key first, falls back to V1
  - On successful read, if `tokenVersion < 2`, re-encrypt with V2 key and bump `tokenVersion`
  - Rotation happens lazily on next token access

**Integration points:**

Note: Microsoft was removed as a *login* provider (commit `b1f2840`), but Microsoft Graph is still used for email and calendar sync via a separate OAuth flow. The `IntegrationToken` table stores Graph API tokens for this sync — these are the tokens being encrypted.

- `src/app/api/auth/callback/route.ts` — encrypt before `db.integrationToken.create()` (Graph OAuth callback)
- `src/lib/integrations/microsoft-graph.ts` — `refreshAccessToken()` decrypts refresh token, re-encrypts new tokens on save
- `src/lib/integrations/email-sync.ts` — decrypt access token before Graph API calls
- `src/lib/integrations/calendar-sync.ts` — same

**Migration:** One-time script `scripts/encrypt-existing-tokens.ts`:
- Reads all `IntegrationToken` records
- Encrypts `accessToken` and `refreshToken` in place
- Sets `tokenVersion = 1`
- Run manually after deploy, idempotent (skips already-encrypted tokens by checking `v1:` prefix)

**Env validation:** Add `TOKEN_ENCRYPTION_KEY` to `src/lib/env.ts` as **conditionally required** — required if any `IntegrationToken` records exist or if the Microsoft Graph integration is configured (`MICROSOFT_CLIENT_ID` is set). Otherwise emit a startup warning. This avoids crashing local dev environments that don't use the Graph integration.

### 3.2 S-12 — Sensitive Data Log Redaction

**Changes to `src/lib/logger.ts`:**

Add `redact()` function:
```
const REDACT_KEYS = /token|secret|password|authorization|cookie|refresh|access.?token|api.?key/i;

function redact(obj: Record<string, unknown>): Record<string, unknown>
  → deep-clones obj, replaces values of matching keys with "[REDACTED]"
  → applied in emit() before JSON.stringify
```

**Changes to `src/lib/api-handler.ts`:**
- Replace `console.error('API error:', err)` with `logger.error('API handler error', { error: err.message })`
- Ensure caught ZodError responses don't echo back raw token values — already safe since `zodError()` returns field-level errors only

### 3.3 S-10 — Admin Action Audit Logging

**New file:** `src/lib/audit.ts`

```typescript
// Action constants — use these instead of raw strings
export const AUDIT_ACTIONS = {
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_INVITED: 'user.invited',
  USER_DEACTIVATED: 'user.deactivated',
  AGENT_CONFIG_UPDATED: 'agent.config_updated',
  INTEGRATION_CONNECTED: 'integration.connected',
  INTEGRATION_REVOKED: 'integration.revoked',
  CONTACT_DELETED: 'contact.deleted',
  DATA_EXPORTED: 'data.exported',
  RETENTION_RUN_COMPLETED: 'retention.run_completed',
} as const;

export async function auditLog(entry: {
  userId: string | null;  // null for system/cron-triggered actions
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}): Promise<void>
```

- Fire-and-forget: `db.auditLog.create()` wrapped in try/catch, errors logged not thrown
- Never blocks the request that triggered it

**Integration points (route handlers that get audit calls):**
- `PATCH /api/settings/[section]` — agent config changes (`AGENT_CONFIG_UPDATED`)
- `POST /api/settings/[section]` — invitations (`USER_INVITED`)
- `PATCH /api/agents/[name]` — agent status/params (`AGENT_CONFIG_UPDATED`)
- `POST /api/auth/callback` — integration connected (`INTEGRATION_CONNECTED`)
- `DELETE /api/accounts/[id]/contacts/[contactId]` — contact deletion (`CONTACT_DELETED`)
- `GET /api/export` — data export (`DATA_EXPORTED`)
- Retention cron — (`RETENTION_RUN_COMPLETED`)

### 3.4 S-11 — Data Access Boundary Enforcement

**New file:** `src/lib/scoped-db.ts`

Uses Prisma `$extends` client extension to auto-inject ownership scoping:

```typescript
export function scopedDb(userId: string, role: string) {
  return db.$extends({
    query: {
      account: { /* inject ownerId filter for non-ADMIN */ },
      lead:    { /* inject ownerId filter for non-ADMIN */ },
      opportunity: { /* inject ownerId filter for non-ADMIN */ },
      task: { /* inject ownerId OR assignee filter for non-ADMIN */ },
      // ... other owned models
    }
  });
}
```

**Scoping rules:**
- **ADMIN** — no filter, sees all records
- **MEMBER** — sees records where `ownerId = userId` OR explicitly assigned (task assignees)
- **VIEWER** — same visibility as MEMBER (already write-blocked by middleware)

**Models scoped by `ownerId`:** Account, Lead, Opportunity, Task, Goal
**Models scoped transitively (via parent joins):** Contact (→Account), Activity (→Account), Opportunity (→Account)
**Meeting scoping:** Meeting has a nullable `accountId` (no Prisma relation). For non-ADMIN users, the `scopedDb` extension uses a two-step approach: (1) query the user's owned account IDs, (2) filter meetings where `accountId IN (ownedAccountIds) OR accountId IS NULL`. Meetings without an account link (accountId = null) are visible to all authenticated users since they can't be ownership-scoped.
**Models not scoped (shared):** Signal, QueueItem, InboxEmail, AgentConfig (visible to all authenticated users)

**Integration with `withHandler`:**
- `HandlerContext` gains `ctx.db` — the scoped Prisma client (type: `ReturnType<typeof scopedDb>`)
- All route handlers switch from `db.model.findMany(...)` to `ctx.db.model.findMany(...)`
- Route handlers that need unscoped access (e.g., admin endpoints) continue using `db` directly

---

## 4. Privacy & Compliance

### 4.1 P-06 — Access Logging for Sensitive Data

**New file:** `src/lib/access-log.ts`

```typescript
export async function logAccess(entry: {
  userId: string;
  entityType: string;
  entityId: string;
}): Promise<void>
```

- Fire-and-forget, same pattern as `auditLog()`

**Logged views:**
| Route | Entity Type | Entity ID |
|-------|-------------|-----------|
| `GET /api/accounts/[id]` | Account | account.id |
| `GET /api/accounts/[id]/contacts` | Account | account.id |
| `GET /api/meetings/[id]` | Meeting | meeting.id |
| `GET /api/export` | Export | "full-export" |

**Not logged (low-sensitivity):** list views (signals, queue, tasks, leads, home dashboard), search results.

### 4.2 P-02 — Data Retention Policy & Cleanup

**Retention periods:**
| Data | Condition | Retention |
|------|-----------|-----------|
| Archived emails | `isArchived: true` | 90 days |
| Dismissed signals | `status: dismissed` | 180 days |
| Completed sync logs | `status: success` | 30 days |
| Failed sync logs | `status: failed` | 90 days |
| Access logs | all | 90 days |

**New file:** `src/lib/retention.ts`

```typescript
export async function runRetentionCleanup(): Promise<DataRetentionRun>
```

- Batch deletes: find IDs with `findMany({ where, select: { id: true }, take: 1000 })`, then `deleteMany({ where: { id: { in: ids } } })`. Prisma's `deleteMany` doesn't support `LIMIT`, so this two-step pattern is used.
- If a batch hits 1000, logs a warning (next scheduled run will catch the rest)
- Creates `DataRetentionRun` record with counts
- Creates audit log entry (`RETENTION_RUN_COMPLETED`) with `userId: null` (cron-triggered, no user session)

**New route:** `POST /api/retention`
- Protected by `x-cron-secret` header (same pattern as `/api/sync`)
- Scheduled weekly via Vercel cron

### 4.3 P-03 — Data Export (GDPR Article 20)

**New route:** `GET /api/export?format=json`

- ADMIN-only (`requireRole(session, 'ADMIN')`)
- JSON format only (CSV deferred)
- Response structure:
  ```json
  {
    "exportedAt": "ISO timestamp",
    "accounts": [{
      "...account fields",
      "contacts": [...],
      "opportunities": [...],
      "activities": [...]
    }],
    "leads": [...],
    "tasks": [...]
  }
  ```
- Uses `ReadableStream` for large datasets
- Rate-limited: uses a **synchronous** (awaited, not fire-and-forget) AuditLog check for `DATA_EXPORTED` action in last hour, returns 429 if found. The audit log write for exports is also synchronous to ensure the rate limit check is reliable.
- Creates audit log entry with metadata: `{ format: "json", recordCount: N }`
- Creates access log entry (entityType: "Export")

### 4.4 P-04 — Contact Deletion with Cascade

**New route:** `DELETE /api/accounts/[id]/contacts/[contactId]`

- ADMIN or MEMBER (`requireRole(session, 'ADMIN', 'MEMBER')`)
- Scoped: contact must belong to the specified account, AND the account must be within the user's access boundary (use `ctx.db` scoped client to verify account ownership)
- **Anonymizes** rather than hard-deletes:
  - `name → "Deleted Contact"`
  - `email → ""`
  - `phone → null`
  - `title → ""`
  - `linkedinUrl → null`
  - `linkedinData → null`
  - `personalProfile → null`
- Activity text is **left unchanged** — it describes events, not PII, and text-matching redaction is fragile
- Meeting attendee arrays are **left unchanged** — names are display strings, not FK-linked, and modifying them risks corrupting unrelated attendee entries
- Creates audit log entry (`CONTACT_DELETED`) with `before` snapshot of the contact for compliance proof
- Returns 204

---

## 5. Core Workflows

### 5.1 W-18 — Meeting Prep & Outcome Logging

#### Schema Addition

`Meeting` model gains `prepNotes String? @db.Text`.

#### New Page: `src/app/(dashboard)/meetings/[id]/page.tsx`

**Three sections:**

**Header:**
- Title, date/time, duration, attendees
- Account link (clickable → `/accounts/[id]`)
- Prep status badge (draft / ready)
- "Mark Ready" button → `PATCH /api/meetings/[id]` with `{ prepStatus: 'ready' }`

**Prep Panel:**
- Prep notes textarea (auto-saves on blur via PATCH)
- Account brief: pain, whyNow, FIUAC scores
- Key contacts table: name, role, warmth, title
- Open opportunities for this account (name, stage, amount)
- Recent activity timeline (last 5)

**Outcome Panel:**
- Always visible via "Log Outcome" button
- After meeting time passes, button becomes visually prominent (primary color)
- Form fields:
  - Summary textarea (required)
  - Sentiment select: positive / neutral / negative
  - Follow-up task: checkbox → reveals title + due date inputs
  - Next steps textarea (optional)
- Submit → `POST /api/meetings/[id]/outcome`

#### API Changes

**Enhance `GET /api/meetings/[id]`:**
- Add open opportunities for the linked account to the response:
  ```json
  {
    "data": { "...meeting" },
    "account": { "..." },
    "contacts": [...],
    "activities": [...],
    "opportunities": [...]  // NEW: open opps for this account
  }
  ```

**New route: `POST /api/meetings/[id]/outcome`**

Zod schema:
```typescript
{
  summary: z.string().min(1).max(2000),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  nextSteps: z.string().max(2000).optional(),
  createFollowUp: z.boolean().optional(),
  followUpTitle: z.string().optional(),  // required if createFollowUp
  followUpDue: z.string().datetime().optional(),
}
```

Actions:
1. Create `Activity` (type: `Meeting`, source: `"Meeting Outcome"`) linked to account
2. Append `{ date, sentiment }` to `account.sentimentTrajectory` JSON array
3. Update `account.lastActivityAt`
4. If `createFollowUp`: create `Task` linked to account, owned by current user
5. Return created activity + optional task

**Idempotency:** Before creating, check if an Activity with `type: Meeting` and `source: "Meeting Outcome"` already exists where the detail contains the meeting ID (stored as metadata in the detail field, e.g., `[meeting:${meetingId}]` prefix). This handles multiple meetings with the same account on the same day. If found, return the existing one with 200 (not 201).

#### React Query Hooks

**New file:** `src/lib/queries/meetings.ts` (or extend existing)
- `useMeetingDetail(id: string)` — `GET /api/meetings/[id]`
- `useLogOutcome()` — mutation for `POST /api/meetings/[id]/outcome`
- `useUpdateMeeting()` — mutation for `PATCH /api/meetings/[id]` (prep notes, mark ready)

#### Navigation

- Home page meeting cards link to `/meetings/[id]`
- Add `/meetings` to sidebar? — No, meetings are accessed contextually from Home. No standalone list page needed.

---

## 6. New Files Summary

| File | Purpose |
|------|---------|
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt for tokens |
| `src/lib/audit.ts` | Audit log helper + action constants |
| `src/lib/access-log.ts` | Access log helper for sensitive views |
| `src/lib/scoped-db.ts` | Prisma `$extends` ownership scoping |
| `src/lib/retention.ts` | Data retention cleanup logic |
| `src/lib/schemas/export.ts` | Zod schema for export params |
| `src/lib/schemas/outcome.ts` | Zod schema for meeting outcome |
| `src/lib/queries/meetings.ts` | React Query hooks for meeting detail |
| `src/app/api/export/route.ts` | Data export endpoint |
| `src/app/api/retention/route.ts` | Retention cron endpoint |
| `src/app/api/meetings/[id]/outcome/route.ts` | Meeting outcome endpoint |
| `src/app/api/accounts/[id]/contacts/[contactId]/route.ts` | Contact deletion endpoint |
| `src/app/(dashboard)/meetings/[id]/page.tsx` | Meeting detail page |
| `scripts/encrypt-existing-tokens.ts` | One-time token encryption migration |

## 7. Modified Files Summary

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add AuditLog, AccessLog, DataRetentionRun models; add tokenVersion to IntegrationToken; add prepNotes to Meeting |
| `src/lib/logger.ts` | Add `redact()` function, apply in `emit()` |
| `src/lib/api-handler.ts` | Replace `console.error` with `logger.error`; add `ctx.db` (scoped client) to HandlerContext |
| `src/lib/env.ts` | Add `TOKEN_ENCRYPTION_KEY` validation |
| `src/lib/integrations/microsoft-graph.ts` | Encrypt/decrypt token calls |
| `src/lib/integrations/email-sync.ts` | Decrypt token before use |
| `src/lib/integrations/calendar-sync.ts` | Decrypt token before use |
| `src/app/api/meetings/[id]/route.ts` | Add opportunities to GET response |
| `src/app/api/auth/callback/route.ts` | Encrypt tokens before save |
| `src/app/api/settings/*/route.ts` | Add audit log calls |
| `src/app/api/agents/[name]/route.ts` | Add audit log call |
| `src/app/api/accounts/[id]/route.ts` | Add access log call |
| `src/app/(dashboard)/page.tsx` | Meeting cards link to `/meetings/[id]` |
| All route handlers using `db.*` on owned models | Switch to `ctx.db.*` |

## 8. Migration Strategy

Three Prisma migrations in sequence:

1. **`add-audit-access-retention`** — Creates AuditLog, AccessLog, DataRetentionRun tables
2. **`add-token-encryption-fields`** — Adds `tokenVersion` to IntegrationToken, `prepNotes` to Meeting
3. **Post-deploy script** — `scripts/encrypt-existing-tokens.ts` encrypts plaintext tokens

No workspace-related migrations. Workspace model deferred to A-09.

## 9. Vercel Cron Addition

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/retention",
    "schedule": "0 3 * * 0"
  }]
}
```
Runs weekly at 3 AM UTC on Sundays.
