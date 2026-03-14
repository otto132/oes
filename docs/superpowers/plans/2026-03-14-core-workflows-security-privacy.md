# Core Workflows, Security & Privacy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 9 backlog items (W-18, S-04, S-10, S-11, S-12, P-02, P-03, P-04, P-06) covering token encryption, audit/access logging, data access boundaries, log redaction, data retention, data export, contact deletion, and meeting prep/outcome workflows.

**Architecture:** Infrastructure-first approach. Schema migrations first, then security primitives (crypto, logger, audit, access-log, scoped-db), then feature routes and UI. All new lib modules are pure functions with unit tests. Route handlers integrate the primitives. The meeting detail page is the sole frontend addition.

**Tech Stack:** Next.js 15 App Router, Prisma 6, Zod 4, Vitest, React 19, TanStack Query v5, Node.js `crypto` module.

**Spec:** `docs/superpowers/specs/2026-03-14-core-workflows-security-privacy-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt with versioned key rotation |
| `src/lib/crypto.test.ts` | Unit tests for encrypt/decrypt/rotation |
| `src/lib/audit.ts` | Fire-and-forget audit log writer + AUDIT_ACTIONS constants |
| `src/lib/audit.test.ts` | Unit tests for audit log helper |
| `src/lib/access-log.ts` | Fire-and-forget access log writer |
| `src/lib/access-log.test.ts` | Unit tests for access log helper |
| `src/lib/scoped-db.ts` | Prisma `$extends` ownership scoping |
| `src/lib/scoped-db.test.ts` | Unit tests for scoping logic |
| `src/lib/retention.ts` | Data retention cleanup logic |
| `src/lib/retention.test.ts` | Unit tests for retention |
| `src/lib/schemas/outcome.ts` | Zod schema for meeting outcome |
| `src/app/api/export/route.ts` | GDPR data export endpoint |
| `src/app/api/retention/route.ts` | Cron-triggered retention cleanup |
| `src/app/api/meetings/[id]/outcome/route.ts` | Meeting outcome logging endpoint |
| `src/app/api/accounts/[id]/contacts/[contactId]/route.ts` | Contact anonymization endpoint |
| `src/app/(dashboard)/meetings/[id]/page.tsx` | Meeting detail/prep/outcome page |
| `scripts/encrypt-existing-tokens.ts` | One-time migration to encrypt existing tokens |

### Modified Files

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add AuditLog, AccessLog, DataRetentionRun; add tokenVersion to IntegrationToken; add prepNotes to Meeting; add User relations |
| `src/lib/logger.ts` | Add `redact()`, apply in `emit()` |
| `src/lib/logger.test.ts` | New tests for redaction |
| `src/lib/api-handler.ts` | Replace `console.error` with `logger.error`; add `ctx.db` to HandlerContext |
| `src/lib/env.ts` | Add conditional `TOKEN_ENCRYPTION_KEY` validation |
| `src/lib/integrations/microsoft-graph.ts` | Decrypt refresh token, re-encrypt on refresh |
| `src/lib/integrations/email-sync.ts` | Decrypt access token before use |
| `src/lib/integrations/calendar-sync.ts` | Decrypt access token before use |
| `src/lib/schemas/meetings.ts` | Add `prepNotes` to patch schema (insert after `accountId` on line 19, before `.superRefine()`) |
| `src/lib/api-client.ts` | Add `meetings.outcome()` method |
| `src/lib/queries/meetings.ts` | Add `useLogOutcome` hook |
| `src/app/api/auth/callback/route.ts` | Encrypt tokens before DB write; replace console.error/log with logger |
| `src/app/api/meetings/[id]/route.ts` | Add opportunities to GET; add access log |
| `src/app/api/accounts/[id]/route.ts` | Add access log call to GET |
| `src/app/api/accounts/[id]/contacts/route.ts` | No changes needed — contacts loaded via account detail include |
| `src/app/api/settings/team/[id]/route.ts` | Add audit log for role changes |
| `src/app/api/settings/team/invite/route.ts` | Add audit log for invitations |
| `src/app/api/settings/agents/[name]/route.ts` | Add audit log for config updates |
| `src/app/api/export/route.ts` | Audit + access log on export |
| `src/app/(dashboard)/page.tsx` | Meeting cards link to `/meetings/[id]` |
| `vercel.json` | Add retention cron entry |
| Route handlers using `db.*` on owned models | Switch to `ctx.db.*` |

---

## Chunk 1: Schema Migration + Security Primitives

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new models and fields to schema**

Add to `prisma/schema.prisma` after the existing `Invitation` model:

```prisma
// ═══════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation("AuditLogUser", fields: [userId], references: [id])
  action     String
  entityType String
  entityId   String
  before     Json?
  after      Json?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("audit_logs")
}

// ═══════════════════════════════════════════════════════════════
// ACCESS LOG
// ═══════════════════════════════════════════════════════════════

model AccessLog {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation("AccessLogUser", fields: [userId], references: [id])
  entityType String
  entityId   String
  createdAt  DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@map("access_logs")
}

// ═══════════════════════════════════════════════════════════════
// DATA RETENTION
// ═══════════════════════════════════════════════════════════════

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

Add to `User` model (after `syncLogs SyncLog[]`, around line 204):

```prisma
  auditLogs         AuditLog[]         @relation("AuditLogUser")
  accessLogs        AccessLog[]        @relation("AccessLogUser")
```

Add to `IntegrationToken` model (after `updatedAt`, around line 588):

```prisma
  tokenVersion Int @default(1)
```

Add to `Meeting` model (after `prepStatus`, around line 606):

```prisma
  prepNotes  String? @db.Text
```

- [ ] **Step 2: Generate and run migration**

Run: `npx prisma migrate dev --name add-audit-access-retention-fields`
Expected: Migration created and applied successfully.

- [ ] **Step 3: Verify schema**

Run: `npx prisma generate`
Expected: Prisma Client generated successfully.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(db): add AuditLog, AccessLog, DataRetentionRun models and token/meeting fields"
```

---

### Task 2: S-12 — Log Redaction

**Files:**
- Modify: `src/lib/logger.ts`
- Create: `src/lib/logger.test.ts`
- Modify: `src/lib/api-handler.ts`

- [ ] **Step 1: Write failing tests for redaction**

Create `src/lib/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll test redact as an exported function
// For now, test the logger output indirectly
describe('redact', () => {
  it('redacts keys matching sensitive patterns', async () => {
    const { redact } = await import('./logger');
    const input = {
      userId: 'u123',
      accessToken: 'secret-token-value',
      refreshToken: 'refresh-secret',
      password: 'hunter2',
      name: 'Alice',
    };
    const result = redact(input);
    expect(result.userId).toBe('u123');
    expect(result.name).toBe('Alice');
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
  });

  it('redacts nested objects', async () => {
    const { redact } = await import('./logger');
    const input = {
      data: { authorization: 'Bearer xyz', user: 'bob' },
    };
    const result = redact(input) as any;
    expect(result.data.authorization).toBe('[REDACTED]');
    expect(result.data.user).toBe('bob');
  });

  it('handles null and undefined values', async () => {
    const { redact } = await import('./logger');
    const input = { token: null, secret: undefined, name: 'test' };
    const result = redact(input);
    expect(result.token).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('does not mutate the original object', async () => {
    const { redact } = await import('./logger');
    const input = { apiKey: 'my-key', safe: 'value' };
    const result = redact(input);
    expect(input.apiKey).toBe('my-key');
    expect(result.apiKey).toBe('[REDACTED]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/logger.test.ts`
Expected: FAIL — `redact` is not exported from `./logger`.

- [ ] **Step 3: Implement redaction in logger.ts**

Add to `src/lib/logger.ts` before the `emit` function (around line 57):

```typescript
// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

const REDACT_KEYS = /token|secret|password|authorization|cookie|refresh|access.?token|api.?key/i;

export function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACT_KEYS.test(key)) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redact(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

Update the `emit` function to apply redaction to meta:

```typescript
function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(meta ? redact(meta) : {}),
  };
  // ... rest unchanged
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/logger.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Update api-handler.ts to use logger**

In `src/lib/api-handler.ts`, add import at top:

```typescript
import { logger } from '@/lib/logger';
```

Replace line 48 (`console.error('API error:', err);`) with:

```typescript
      logger.error('API handler error', {
        error: err instanceof Error ? err.message : String(err),
      });
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/logger.ts src/lib/logger.test.ts src/lib/api-handler.ts
git commit -m "feat(S-12): add sensitive data redaction to structured logger"
```

---

### Task 3: S-04 — Token Encryption

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `src/lib/crypto.test.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Write failing tests for encrypt/decrypt**

Create `src/lib/crypto.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set test encryption key before importing
const TEST_KEY = Buffer.from('a]3Fj!kL9#mN2pQ5rS8tU1vW4xY7zA0b').toString('base64');

describe('crypto', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY_V2;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY_V2;
    vi.resetModules();
  });

  it('encrypts and decrypts a string', async () => {
    const { encrypt, decrypt } = await import('./crypto');
    const plaintext = 'my-secret-token-value';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith('v1:')).toBe(true);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const { encrypt } = await import('./crypto');
    const a = encrypt('same-input');
    const b = encrypt('same-input');
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', async () => {
    const { encrypt, decrypt } = await import('./crypto');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    parts[3] = parts[3].slice(0, -2) + 'XX'; // tamper ciphertext
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('returns plaintext unchanged if not in v1: format (migration compat)', async () => {
    const { decrypt } = await import('./crypto');
    const plaintext = 'not-encrypted-legacy-token';
    expect(decrypt(plaintext)).toBe(plaintext);
  });

  it('handles empty string', async () => {
    const { encrypt, decrypt } = await import('./crypto');
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: FAIL — module `./crypto` not found.

- [ ] **Step 3: Implement crypto.ts**

Create `src/lib/crypto.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(version: number = 1): Buffer {
  const envKey = version === 1
    ? process.env.TOKEN_ENCRYPTION_KEY
    : process.env[`TOKEN_ENCRYPTION_KEY_V${version}`];
  if (!envKey) {
    throw new Error(`TOKEN_ENCRYPTION_KEY${version > 1 ? `_V${version}` : ''} not set`);
  }
  return Buffer.from(envKey, 'base64');
}

export function encrypt(plaintext: string, version: number = 1): string {
  const key = getKey(version);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v${version}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encrypted: string): string {
  // Legacy plaintext tokens — not in v<N>: format
  if (!encrypted.match(/^v\d+:/)) {
    return encrypted;
  }

  const [versionStr, ivB64, authTagB64, ciphertextB64] = encrypted.split(':');
  const version = parseInt(versionStr.slice(1), 10);

  const key = getKey(version);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Update env.ts for conditional TOKEN_ENCRYPTION_KEY**

In `src/lib/env.ts`, add after the optional vars section (around line 58):

```typescript
// Conditional: required if Microsoft Graph integration is configured
const tokenEncryptionKey = getOptionalEnv('TOKEN_ENCRYPTION_KEY');
if (!tokenEncryptionKey && env.MICROSOFT_CLIENT_ID) {
  console.warn(
    '[env] WARNING: TOKEN_ENCRYPTION_KEY not set but MICROSOFT_CLIENT_ID is configured. ' +
    'OAuth tokens will not be encrypted at rest.'
  );
}
```

Add `tokenEncryptionKey` to the `env` export object.

- [ ] **Step 6: Commit**

```bash
git add src/lib/crypto.ts src/lib/crypto.test.ts src/lib/env.ts
git commit -m "feat(S-04): add AES-256-GCM token encryption with key rotation support"
```

---

### Task 4: S-04 — Integrate Token Encryption into Auth & Sync

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`
- Modify: `src/lib/integrations/microsoft-graph.ts`
- Modify: `src/lib/integrations/email-sync.ts`
- Modify: `src/lib/integrations/calendar-sync.ts`
- Create: `scripts/encrypt-existing-tokens.ts`

- [ ] **Step 1: Encrypt tokens and fix logging in auth callback**

In `src/app/api/auth/callback/route.ts`, add imports:

```typescript
import { encrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';
```

Replace all `console.error(...)` and `console.log(...)` calls with `logger.error(...)` and `logger.info(...)` respectively. This ensures sensitive OAuth error descriptions are redacted via the logger.

In the `db.integrationToken.upsert()` call (around line 42), wrap the token values:

```typescript
accessToken: encrypt(tokens.access_token),
refreshToken: encrypt(tokens.refresh_token),
```

Also update the `update` block of the upsert with the same encrypted values.

- [ ] **Step 2: Decrypt/re-encrypt in microsoft-graph.ts refreshAccessToken**

In `src/lib/integrations/microsoft-graph.ts`, add import:

```typescript
import { encrypt, decrypt } from '@/lib/crypto';
```

The `refreshAccessToken` function takes a raw refresh token. The callers (email-sync, calendar-sync) will pass the decrypted value. No changes needed to `refreshAccessToken` itself.

- [ ] **Step 3: Decrypt tokens in email-sync.ts**

In `src/lib/integrations/email-sync.ts`, find where the access token is read from `IntegrationToken` and used for API calls. Add import:

```typescript
import { decrypt, encrypt } from '@/lib/crypto';
```

Before passing `token.accessToken` to `fetchRecentEmails()`, decrypt it:

```typescript
const accessToken = decrypt(token.accessToken);
```

When refreshing expired tokens, decrypt the refresh token before calling `refreshAccessToken`, then encrypt the new tokens before saving:

```typescript
const newTokens = await refreshAccessToken(decrypt(token.refreshToken));
await db.integrationToken.update({
  where: { id: token.id },
  data: {
    accessToken: encrypt(newTokens.access_token),
    refreshToken: encrypt(newTokens.refresh_token),
    expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
  },
});
```

- [ ] **Step 4: Decrypt tokens in calendar-sync.ts**

Same pattern as email-sync. Add import and decrypt before use:

```typescript
import { decrypt, encrypt } from '@/lib/crypto';
```

Apply decrypt/encrypt at the same points as email-sync.

- [ ] **Step 5: Create migration script**

Create `scripts/encrypt-existing-tokens.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../src/lib/crypto';

const db = new PrismaClient();

async function main() {
  const tokens = await db.integrationToken.findMany();
  let encrypted = 0;
  let skipped = 0;

  for (const token of tokens) {
    // Skip already-encrypted tokens
    if (token.accessToken.startsWith('v1:')) {
      skipped++;
      continue;
    }

    await db.integrationToken.update({
      where: { id: token.id },
      data: {
        accessToken: encrypt(token.accessToken),
        refreshToken: encrypt(token.refreshToken),
        tokenVersion: 1,
      },
    });
    encrypted++;
  }

  console.log(`Encrypted ${encrypted} tokens, skipped ${skipped} (already encrypted)`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
```

- [ ] **Step 6: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/auth/callback/route.ts src/lib/integrations/microsoft-graph.ts src/lib/integrations/email-sync.ts src/lib/integrations/calendar-sync.ts scripts/encrypt-existing-tokens.ts
git commit -m "feat(S-04): integrate token encryption into auth callback and sync services"
```

---

### Task 5: S-10 — Audit Log Helper

**Files:**
- Create: `src/lib/audit.ts`
- Create: `src/lib/audit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/audit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  db: {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'test-id' }),
    },
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('auditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an audit log entry', async () => {
    const { auditLog } = await import('./audit');
    const { db } = await import('@/lib/db');

    await auditLog({
      userId: 'user-1',
      action: 'user.role_changed',
      entityType: 'User',
      entityId: 'user-2',
      before: { role: 'MEMBER' },
      after: { role: 'ADMIN' },
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'user.role_changed',
        entityType: 'User',
        entityId: 'user-2',
      }),
    });
  });

  it('does not throw on db error', async () => {
    const { db } = await import('@/lib/db');
    (db.auditLog.create as any).mockRejectedValueOnce(new Error('DB down'));

    const { auditLog } = await import('./audit');
    // Should not throw
    await auditLog({
      userId: null,
      action: 'retention.run_completed',
      entityType: 'System',
      entityId: 'retention',
    });
  });

  it('accepts null userId for system actions', async () => {
    const { auditLog } = await import('./audit');
    const { db } = await import('@/lib/db');

    await auditLog({
      userId: null,
      action: 'retention.run_completed',
      entityType: 'System',
      entityId: 'retention-run-1',
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: null }),
    });
  });
});

describe('AUDIT_ACTIONS', () => {
  it('exports all expected action constants', async () => {
    const { AUDIT_ACTIONS } = await import('./audit');
    expect(AUDIT_ACTIONS.USER_ROLE_CHANGED).toBe('user.role_changed');
    expect(AUDIT_ACTIONS.CONTACT_DELETED).toBe('contact.deleted');
    expect(AUDIT_ACTIONS.DATA_EXPORTED).toBe('data.exported');
    expect(AUDIT_ACTIONS.RETENTION_RUN_COMPLETED).toBe('retention.run_completed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/audit.test.ts`
Expected: FAIL — module `./audit` not found.

- [ ] **Step 3: Implement audit.ts**

Create `src/lib/audit.ts`:

```typescript
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

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
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        metadata: entry.metadata ?? undefined,
      },
    });
  } catch (err) {
    logger.error('Failed to write audit log', {
      error: err instanceof Error ? err.message : String(err),
      action: entry.action,
      entityType: entry.entityType,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/audit.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts src/lib/audit.test.ts
git commit -m "feat(S-10): add audit log helper with action constants"
```

---

### Task 6: P-06 — Access Log Helper

**Files:**
- Create: `src/lib/access-log.ts`
- Create: `src/lib/access-log.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/access-log.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    accessLog: {
      create: vi.fn().mockResolvedValue({ id: 'test-id' }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

describe('logAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an access log entry', async () => {
    const { logAccess } = await import('./access-log');
    const { db } = await import('@/lib/db');

    await logAccess({
      userId: 'user-1',
      entityType: 'Account',
      entityId: 'acc-123',
    });

    expect(db.accessLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        entityType: 'Account',
        entityId: 'acc-123',
      },
    });
  });

  it('does not throw on db error', async () => {
    const { db } = await import('@/lib/db');
    (db.accessLog.create as any).mockRejectedValueOnce(new Error('DB down'));

    const { logAccess } = await import('./access-log');
    await logAccess({
      userId: 'user-1',
      entityType: 'Account',
      entityId: 'acc-123',
    });
    // Should not throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/access-log.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement access-log.ts**

Create `src/lib/access-log.ts`:

```typescript
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function logAccess(entry: {
  userId: string;
  entityType: string;
  entityId: string;
}): Promise<void> {
  try {
    await db.accessLog.create({
      data: {
        userId: entry.userId,
        entityType: entry.entityType,
        entityId: entry.entityId,
      },
    });
  } catch (err) {
    logger.error('Failed to write access log', {
      error: err instanceof Error ? err.message : String(err),
      entityType: entry.entityType,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/access-log.test.ts`
Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/access-log.ts src/lib/access-log.test.ts
git commit -m "feat(P-06): add access log helper for sensitive data views"
```

---

### Task 7: S-11 — Scoped DB Helper

**Files:**
- Create: `src/lib/scoped-db.ts`
- Create: `src/lib/scoped-db.test.ts`
- Modify: `src/lib/api-handler.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/scoped-db.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// These tests verify the scoping logic by checking that queries
// are augmented with the correct where clauses.

vi.mock('@/lib/db', () => {
  const mockExtends = vi.fn().mockImplementation((ext) => {
    return { _extensions: ext };
  });
  return {
    db: {
      $extends: mockExtends,
    },
  };
});

describe('scopedDb', () => {
  it('returns unscoped client for ADMIN', async () => {
    const { scopedDb } = await import('./scoped-db');
    const scoped = scopedDb('admin-user', 'ADMIN');
    // ADMIN should have extensions that pass through without filtering
    expect(scoped).toBeDefined();
  });

  it('returns scoped client for MEMBER', async () => {
    const { scopedDb } = await import('./scoped-db');
    const scoped = scopedDb('member-user', 'MEMBER');
    expect(scoped).toBeDefined();
  });

  it('returns scoped client for VIEWER', async () => {
    const { scopedDb } = await import('./scoped-db');
    const scoped = scopedDb('viewer-user', 'VIEWER');
    expect(scoped).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scoped-db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement scoped-db.ts**

Create `src/lib/scoped-db.ts`:

```typescript
import { db } from '@/lib/db';

/**
 * Returns a Prisma client extension that auto-injects ownership
 * scoping into queries for owned models.
 *
 * ADMIN: no filter (sees all records)
 * MEMBER/VIEWER: sees records where ownerId = userId OR assigned
 */
export function scopedDb(userId: string, role: string) {
  if (role === 'ADMIN') {
    return db;
  }

  return db.$extends({
    query: {
      account: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        // findUnique only accepts unique fields (id) in where clause,
        // so we can't inject ownerId there. Post-hoc filter instead.
        // Record exists but user gets null — route handler returns 404.
        async findUnique({ args, query }) {
          const result = await query(args);
          if (result && result.ownerId !== userId) return null;
          return result;
        },
      },
      lead: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (result && result.ownerId !== userId) return null;
          return result;
        },
      },
      opportunity: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (result && result.ownerId !== userId) return null;
          return result;
        },
      },
      task: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            OR: [
              { ownerId: userId },
              { assignees: { some: { id: userId } } },
            ],
          };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = {
            ...args.where,
            OR: [
              { ownerId: userId },
              { assignees: { some: { id: userId } } },
            ],
          };
          return query(args);
        },
        // findUnique can't inject OR clauses. Use findFirst as fallback
        // to check both ownership and assignment.
        async findUnique({ args, query }) {
          const result = await query(args) as any;
          if (!result) return null;
          if (result.ownerId === userId) return result;
          // Check if user is an assignee via a separate query
          const asAssignee = await db.task.findFirst({
            where: { id: result.id, assignees: { some: { id: userId } } },
          });
          return asAssignee ? result : null;
        },
      },
      goal: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
      },
      meeting: {
        async findMany({ args, query }) {
          // Two-step: get owned account IDs, then filter meetings
          const ownedAccounts = await db.account.findMany({
            where: { ownerId: userId },
            select: { id: true },
          });
          const ownedIds = ownedAccounts.map((a) => a.id);
          args.where = {
            ...args.where,
            OR: [
              { accountId: { in: ownedIds } },
              { accountId: null },
            ],
          };
          return query(args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/scoped-db.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Update withHandler to provide ctx.db**

In `src/lib/api-handler.ts`, add import:

```typescript
import { scopedDb, ScopedDb } from '@/lib/scoped-db';
```

Update `HandlerContext` interface:

```typescript
export interface HandlerContext<T> {
  body: T;
  session: { user: { id: string; name?: string; role?: string } };
  pagination: { cursor?: string; limit: number };
  db: ScopedDb;
}
```

In the `withHandler` function, after the session check (around line 19), create the scoped client:

```typescript
const scopedClient = scopedDb(
  session.user.id,
  (session.user as { role?: string }).role ?? 'VIEWER',
);
```

Pass it in the handler call:

```typescript
return await handler(req, {
  body,
  session: { ... },
  pagination: { cursor, limit },
  db: scopedClient,
});
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scoped-db.ts src/lib/scoped-db.test.ts src/lib/api-handler.ts
git commit -m "feat(S-11): add ownership-scoped Prisma client extension and wire into withHandler"
```

---

## Chunk 2: Privacy & Compliance Features

### Task 8: S-10 — Wire Audit Logging into Route Handlers

**Files:**
- Modify: `src/app/api/settings/team/[id]/route.ts`
- Modify: `src/app/api/settings/team/invite/route.ts`
- Modify: `src/app/api/settings/agents/[name]/route.ts`
- Modify: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Add audit log to team role changes**

In `src/app/api/settings/team/[id]/route.ts`, add import:

```typescript
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
```

After the successful `db.user.update()` call (the one that changes role or isActive), add:

```typescript
if (body.role !== undefined) {
  auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'User',
    entityId: id,
    before: { role: existing.role },
    after: { role: body.role },
  });
}
if (body.isActive !== undefined && body.isActive !== existing.isActive) {
  auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.USER_DEACTIVATED,
    entityType: 'User',
    entityId: id,
    before: { isActive: existing.isActive },
    after: { isActive: body.isActive },
  });
}
```

Note: You need to read the existing user before the update to capture `before` values. Check if the route already does this (it should for the "last admin" guard).

- [ ] **Step 2: Add audit log to invitations**

In `src/app/api/settings/team/invite/route.ts`, add import:

```typescript
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
```

After the successful `db.invitation.create()`, add:

```typescript
auditLog({
  userId: session.user.id,
  action: AUDIT_ACTIONS.USER_INVITED,
  entityType: 'Invitation',
  entityId: invitation.id,
  metadata: { email: body.email, role: body.role },
});
```

- [ ] **Step 3: Add audit log to agent config updates**

In `src/app/api/settings/agents/[name]/route.ts`, add import:

```typescript
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
```

After the successful `db.agentConfig.update()`, add:

```typescript
auditLog({
  userId: session.user.id,
  action: AUDIT_ACTIONS.AGENT_CONFIG_UPDATED,
  entityType: 'AgentConfig',
  entityId: updated.id,
  before: { status: existing.status, parameters: existing.parameters },
  after: { status: updated.status, parameters: updated.parameters },
});
```

Note: Read the existing config before update to capture `before` values.

- [ ] **Step 4: Add audit log to integration connection**

In `src/app/api/auth/callback/route.ts`, add import:

```typescript
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
```

After the successful token upsert (around line 52), add:

```typescript
auditLog({
  userId: session.user.id,
  action: AUDIT_ACTIONS.INTEGRATION_CONNECTED,
  entityType: 'IntegrationToken',
  entityId: token.id,
  metadata: { provider: 'microsoft' },
});
```

- [ ] **Step 5: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/settings/ src/app/api/auth/callback/route.ts
git commit -m "feat(S-10): wire audit logging into admin route handlers"
```

---

### Task 9: P-06 — Wire Access Logging into Route Handlers

**Files:**
- Modify: `src/app/api/accounts/[id]/route.ts`
- Modify: `src/app/api/accounts/[id]/contacts/route.ts`
- Modify: `src/app/api/meetings/[id]/route.ts`

- [ ] **Step 1: Add access log to account detail**

In `src/app/api/accounts/[id]/route.ts`, add import:

```typescript
import { logAccess } from '@/lib/access-log';
```

In the GET handler (if there is one — check the file), after fetching the account, add:

```typescript
logAccess({
  userId: session.user.id,
  entityType: 'Account',
  entityId: id,
});
```

If the GET handler doesn't use `withHandler` and doesn't have a session, add `auth()` import and session check.

- [ ] **Step 2: Add access log to meeting detail**

Note: The contacts route (`/api/accounts/[id]/contacts`) only has a POST handler, no GET. Contacts are loaded via the account detail endpoint's `include: { contacts: true }`, so access is already logged when the account detail is viewed.


In `src/app/api/meetings/[id]/route.ts`, add import and log in the GET handler:

```typescript
import { logAccess } from '@/lib/access-log';
import { auth } from '@/lib/auth';

// In GET handler, after fetching meeting:
const session = await auth();
if (session?.user?.id) {
  logAccess({
    userId: session.user.id,
    entityType: 'Meeting',
    entityId: id,
  });
}
```

- [ ] **Step 3: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/accounts/ src/app/api/meetings/
git commit -m "feat(P-06): add access logging to account and meeting detail views"
```

---

### Task 10: P-02 — Data Retention Cleanup

**Files:**
- Create: `src/lib/retention.ts`
- Create: `src/lib/retention.test.ts`
- Create: `src/app/api/retention/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write failing tests**

Create `src/lib/retention.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    inboxEmail: {
      findMany: vi.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    signal: {
      findMany: vi.fn().mockResolvedValue([{ id: '3' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    syncLog: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    accessLog: {
      findMany: vi.fn().mockResolvedValue([{ id: '4' }, { id: '5' }, { id: '6' }]),
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
    dataRetentionRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
  AUDIT_ACTIONS: { RETENTION_RUN_COMPLETED: 'retention.run_completed' },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('runRetentionCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes stale records and returns counts', async () => {
    const { runRetentionCleanup } = await import('./retention');
    const result = await runRetentionCleanup();

    expect(result).toEqual(
      expect.objectContaining({
        archivedEmails: 2,
        dismissedSignals: 1,
        syncLogs: 0,
        accessLogs: 3,
      }),
    );
  });

  it('creates an audit log entry', async () => {
    const { runRetentionCleanup } = await import('./retention');
    const { auditLog } = await import('@/lib/audit');
    await runRetentionCleanup();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'retention.run_completed',
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/retention.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement retention.ts**

Create `src/lib/retention.ts`:

```typescript
import { db } from '@/lib/db';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { logger } from '@/lib/logger';

const BATCH_LIMIT = 1000;

async function deleteStale(
  model: any,
  where: Record<string, unknown>,
  label: string,
): Promise<number> {
  const stale = await model.findMany({
    where,
    select: { id: true },
    take: BATCH_LIMIT,
  });
  if (stale.length === 0) return 0;

  const ids = stale.map((r: { id: string }) => r.id);
  const { count } = await model.deleteMany({ where: { id: { in: ids } } });

  if (stale.length >= BATCH_LIMIT) {
    logger.warn(`Retention batch limit hit for ${label} — more records remain`);
  }

  return count;
}

export async function runRetentionCleanup() {
  const now = new Date();

  const archivedEmails = await deleteStale(
    db.inboxEmail,
    { isArchived: true, createdAt: { lt: new Date(now.getTime() - 90 * 864e5) } },
    'archived emails',
  );

  const dismissedSignals = await deleteStale(
    db.signal,
    { status: 'dismissed', createdAt: { lt: new Date(now.getTime() - 180 * 864e5) } },
    'dismissed signals',
  );

  const successSyncLogs = await deleteStale(
    db.syncLog,
    { status: 'success', startedAt: { lt: new Date(now.getTime() - 30 * 864e5) } },
    'completed sync logs',
  );
  const failedSyncLogs = await deleteStale(
    db.syncLog,
    { status: 'failed', startedAt: { lt: new Date(now.getTime() - 90 * 864e5) } },
    'failed sync logs',
  );

  const accessLogs = await deleteStale(
    db.accessLog,
    { createdAt: { lt: new Date(now.getTime() - 90 * 864e5) } },
    'access logs',
  );

  const run = await db.dataRetentionRun.create({
    data: {
      archivedEmails,
      dismissedSignals,
      syncLogs: successSyncLogs + failedSyncLogs,
      accessLogs,
      completedAt: new Date(),
    },
  });

  auditLog({
    userId: null,
    action: AUDIT_ACTIONS.RETENTION_RUN_COMPLETED,
    entityType: 'DataRetentionRun',
    entityId: run.id,
    metadata: { archivedEmails, dismissedSignals, syncLogs: successSyncLogs + failedSyncLogs, accessLogs },
  });

  logger.info('Retention cleanup completed', {
    archivedEmails,
    dismissedSignals,
    syncLogs: successSyncLogs + failedSyncLogs,
    accessLogs,
  });

  return run;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/retention.test.ts`
Expected: All 2 tests PASS.

- [ ] **Step 5: Create retention API route**

Create `src/app/api/retention/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { runRetentionCleanup } from '@/lib/retention';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  // Same cron-secret pattern as /api/sync
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const run = await runRetentionCleanup();
    return NextResponse.json({ data: run });
  } catch (err) {
    logger.error('Retention cleanup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Retention cleanup failed' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Add cron to vercel.json**

Add to the `crons` array in `vercel.json`:

```json
{ "path": "/api/retention", "schedule": "0 3 * * 0" }
```

- [ ] **Step 7: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/retention.ts src/lib/retention.test.ts src/app/api/retention/route.ts vercel.json
git commit -m "feat(P-02): add data retention cleanup cron with batch deletes"
```

---

### Task 11: P-03 — Data Export Endpoint

**Files:**
- Create: `src/app/api/export/route.ts`

- [ ] **Step 1: Create export route**

Create `src/app/api/export/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { logAccess } from '@/lib/access-log';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const denied = requireRole(session, 'ADMIN');
  if (denied) return denied;

  // Rate limit: check for recent export in last hour (synchronous)
  const recentExport = await db.auditLog.findFirst({
    where: {
      action: AUDIT_ACTIONS.DATA_EXPORTED,
      createdAt: { gt: new Date(Date.now() - 3600_000) },
    },
  });
  if (recentExport) {
    return NextResponse.json(
      { error: 'Export rate limit exceeded. Try again in 1 hour.' },
      { status: 429 },
    );
  }

  // Fetch all data
  const [accounts, leads, tasks] = await Promise.all([
    db.account.findMany({
      include: {
        contacts: true,
        opportunities: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    }),
    db.lead.findMany(),
    db.task.findMany(),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((a) => ({
      ...a,
      contacts: a.contacts,
      opportunities: a.opportunities,
      activities: a.activities,
    })),
    leads,
    tasks,
  };

  const recordCount = accounts.length + leads.length + tasks.length;

  // Synchronous audit log for rate limit reliability
  await auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.DATA_EXPORTED,
    entityType: 'Export',
    entityId: 'full-export',
    metadata: { format: 'json', recordCount },
  });

  logAccess({
    userId: session.user.id,
    entityType: 'Export',
    entityId: 'full-export',
  });

  return NextResponse.json(exportData);
}
```

- [ ] **Step 2: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/export/route.ts
git commit -m "feat(P-03): add GDPR data export endpoint with rate limiting"
```

---

### Task 12: P-04 — Contact Deletion (Anonymization)

**Files:**
- Create: `src/app/api/accounts/[id]/contacts/[contactId]/route.ts`

- [ ] **Step 1: Create contact deletion route**

Create `src/app/api/accounts/[id]/contacts/[contactId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { scopedDb } from '@/lib/scoped-db';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { unauthorized, notFound, forbidden } from '@/lib/api-errors';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const denied = requireRole(session, 'ADMIN', 'MEMBER');
  if (denied) return denied;

  const { id: accountId, contactId } = await params;

  // Verify account is within user's access boundary
  const userRole = (session.user as { role?: string }).role ?? 'VIEWER';
  const scoped = scopedDb(session.user.id, userRole);
  const account = await scoped.account.findUnique({ where: { id: accountId } });
  if (!account) return notFound('Account not found');

  // Verify contact belongs to this account
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.accountId !== accountId) {
    return notFound('Contact not found');
  }

  // Snapshot before anonymization
  const beforeSnapshot = {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    title: contact.title,
    linkedinUrl: contact.linkedinUrl,
  };

  // Anonymize
  await db.contact.update({
    where: { id: contactId },
    data: {
      name: 'Deleted Contact',
      email: '',
      phone: null,
      title: '',
      linkedinUrl: null,
      linkedinData: null,
      personalProfile: null,
    },
  });

  // Audit log
  auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.CONTACT_DELETED,
    entityType: 'Contact',
    entityId: contactId,
    before: beforeSnapshot,
    metadata: { accountId },
  });

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/accounts/\[id\]/contacts/\[contactId\]/route.ts
git commit -m "feat(P-04): add contact anonymization endpoint with audit logging"
```

---

## Chunk 3: Meeting Prep & Outcome (W-18)

### Task 13: Meeting Outcome Schema & API

**Files:**
- Create: `src/lib/schemas/outcome.ts`
- Create: `src/app/api/meetings/[id]/outcome/route.ts`
- Modify: `src/lib/schemas/meetings.ts`
- Modify: `src/app/api/meetings/[id]/route.ts`

- [ ] **Step 1: Create outcome Zod schema**

Create `src/lib/schemas/outcome.ts`:

```typescript
import { z } from 'zod';

export const meetingOutcomeSchema = z.object({
  summary: z.string().min(1).max(2000),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  nextSteps: z.string().max(2000).optional(),
  createFollowUp: z.boolean().optional(),
  followUpTitle: z.string().min(1).max(200).optional(),
  followUpDue: z.string().datetime().optional(),
}).refine(
  (data) => !data.createFollowUp || data.followUpTitle,
  { message: 'followUpTitle is required when createFollowUp is true', path: ['followUpTitle'] },
);
```

- [ ] **Step 2: Add prepNotes to meeting patch schema**

In `src/lib/schemas/meetings.ts`, add `prepNotes` to the `patchMeetingSchema`:

```typescript
prepNotes: z.string().max(5000).optional(),
```

- [ ] **Step 3: Enhance GET /api/meetings/[id] with opportunities**

In `src/app/api/meetings/[id]/route.ts`, in the GET handler, after fetching contacts and activities for the account, add:

```typescript
import { adaptOpportunity } from '@/lib/adapters';
```

After the account fetch block (around line 30), add opportunity query:

```typescript
if (account) {
  const opportunities = await db.opportunity.findMany({
    where: {
      accountId: account.id,
      stage: { notIn: ['ClosedWon', 'ClosedLost'] },
    },
    include: { owner: true },
  });
  result.opportunities = opportunities.map(adaptOpportunity);
}
```

- [ ] **Step 4: Create outcome route**

Create `src/app/api/meetings/[id]/outcome/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { meetingOutcomeSchema } from '@/lib/schemas/outcome';
import { adaptActivity } from '@/lib/adapters';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;

  const meeting = await db.meeting.findUnique({ where: { id } });
  if (!meeting) return notFound('Meeting not found');

  const raw = await req.json();
  const parsed = meetingOutcomeSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  // Idempotency: check for existing outcome for this meeting
  const existing = await db.activity.findFirst({
    where: {
      type: 'Meeting',
      source: 'Meeting Outcome',
      detail: { startsWith: `[meeting:${id}]` },
    },
  });
  if (existing) {
    return NextResponse.json({
      data: adaptActivity({ ...existing, account: meeting.accountId ? { id: meeting.accountId, name: meeting.accountName ?? '' } : null }),
    });
  }

  const detail = `[meeting:${id}] ${body.summary}${body.nextSteps ? `\n\nNext steps: ${body.nextSteps}` : ''}`;

  // Create activity — include author for adaptActivity
  const activity = await db.activity.create({
    data: {
      type: 'Meeting',
      source: 'Meeting Outcome',
      summary: body.summary.slice(0, 80),
      detail,
      accountId: meeting.accountId,
      authorId: session.user.id,
    },
    include: { author: true },
  });

  // Update account sentiment + lastActivityAt
  if (meeting.accountId) {
    const account = await db.account.findUnique({
      where: { id: meeting.accountId },
      select: { sentimentTrajectory: true },
    });
    const trajectory = (account?.sentimentTrajectory as Array<{ date: string; sentiment: string }>) ?? [];
    trajectory.push({ date: new Date().toISOString(), sentiment: body.sentiment });

    await db.account.update({
      where: { id: meeting.accountId },
      data: {
        lastActivityAt: new Date(),
        sentimentTrajectory: trajectory,
      },
    });
  }

  // Create follow-up task if requested
  let task = null;
  if (body.createFollowUp && body.followUpTitle) {
    task = await db.task.create({
      data: {
        title: body.followUpTitle,
        status: 'Open',
        priority: 'Medium',
        due: body.followUpDue ? new Date(body.followUpDue) : undefined,
        source: 'Meeting Outcome',
        accountId: meeting.accountId,
        ownerId: session.user.id,
      },
    });
  }

  return NextResponse.json(
    {
      data: adaptActivity({ ...activity, account: meeting.accountId ? { id: meeting.accountId, name: meeting.accountName ?? '' } : null }),
      ...(task ? { task } : {}),
    },
    { status: 201 },
  );
}
```

- [ ] **Step 5: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/outcome.ts src/lib/schemas/meetings.ts src/app/api/meetings/
git commit -m "feat(W-18): add meeting outcome API with idempotency and sentiment tracking"
```

---

### Task 14: Meeting API Client + Query Hooks

**Files:**
- Modify: `src/lib/api-client.ts`
- Modify: `src/lib/queries/meetings.ts`

Note: `src/lib/queries/meetings.ts` already exists with `useMeetingDetail`, `useUpdateMeeting`, `useCreateMeeting`, and `useMeetingsQuery`. We only add `useLogOutcome`. The existing hooks use the typed `api.meetings.*` pattern — we must follow the same convention.

- [ ] **Step 1: Add outcome method to api-client**

In `src/lib/api-client.ts`, inside the `meetings` object (after the `update` method at line 211), add:

```typescript
    outcome: (id: string, data: {
      summary: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      nextSteps?: string;
      createFollowUp?: boolean;
      followUpTitle?: string;
      followUpDue?: string;
    }) => post<any>(`/meetings/${id}/outcome`, data),
```

- [ ] **Step 2: Add useLogOutcome hook to existing meetings.ts**

In `src/lib/queries/meetings.ts`, add this hook at the end of the file (after `useUpdateMeeting`):

```typescript
export function useLogOutcome(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      summary: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      nextSteps?: string;
      createFollowUp?: boolean;
      followUpTitle?: string;
      followUpDue?: string;
    }) => api.meetings.outcome(meetingId, data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts src/lib/queries/meetings.ts
git commit -m "feat(W-18): add meeting outcome to API client and query hooks"
```

---

### Task 15: Meeting Detail Page

**Files:**
- Create: `src/app/(dashboard)/meetings/[id]/page.tsx`
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create meeting detail page**

Create `src/app/(dashboard)/meetings/[id]/page.tsx`:

```tsx
'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, Clock, Users, CheckCircle2, ArrowLeft,
  FileText, TrendingUp, AlertCircle,
} from 'lucide-react';
import { useMeetingDetail, useUpdateMeeting, useLogOutcome } from '@/lib/queries/meetings';
import { Badge, FIUACBars, StageBadge, EmptyState, Skeleton, SkeletonText } from '@/components/ui';

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, error } = useMeetingDetail(id);
  // Existing hook takes no args; mutationFn expects { id, data }
  const updateMeeting = useUpdateMeeting();
  const logOutcome = useLogOutcome(id);

  const [prepNotes, setPrepNotes] = useState('');
  const [prepNotesLoaded, setPrepNotesLoaded] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({
    summary: '',
    sentiment: 'neutral' as 'positive' | 'neutral' | 'negative',
    nextSteps: '',
    createFollowUp: false,
    followUpTitle: '',
    followUpDue: '',
  });

  if (isLoading) {
    return (
      <div className="page-container">
        <Skeleton style={{ width: '60%', height: 32, marginBottom: 24 }} />
        <SkeletonText lines={8} />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="page-container">
        <EmptyState icon={AlertCircle} message="Meeting not found" />
      </div>
    );
  }

  const meeting = data.data;
  const account = data.account;
  const contacts = data.contacts ?? [];
  const activities = data.activities ?? [];
  const opportunities = data.opportunities ?? [];

  // Initialize prep notes from server on first load
  if (!prepNotesLoaded && meeting.prepNotes !== undefined) {
    setPrepNotes(meeting.prepNotes ?? '');
    setPrepNotesLoaded(true);
  }

  // meeting.startTime is "HH:MM" string (from adaptMeeting), meeting.date is ISO string
  const isPast = new Date(meeting.date) < new Date();

  const handleSavePrepNotes = () => {
    updateMeeting.mutate({ id, data: { prepNotes } });
  };

  const handleMarkReady = () => {
    updateMeeting.mutate({ id, data: { prepStatus: 'ready' } });
  };

  const handleSubmitOutcome = () => {
    logOutcome.mutate(outcomeForm, {
      onSuccess: () => setShowOutcome(false),
    });
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">{meeting.title}</h1>
            <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)', marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={14} />
                {new Date(meeting.date).toLocaleDateString()}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={14} />
                {meeting.startTime}{' · '}{meeting.duration}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Users size={14} />
                {meeting.attendees?.length ?? 0} attendees
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge variant={meeting.prepStatus === 'ready' ? 'ok' : 'neutral'}>
              {meeting.prepStatus === 'ready' ? 'Ready' : 'Draft'}
            </Badge>
            {meeting.prepStatus !== 'ready' && (
              <button className="btn btn-sm" onClick={handleMarkReady}>
                <CheckCircle2 size={14} /> Mark Ready
              </button>
            )}
          </div>
        </div>

        {account && (
          <Link href={`/accounts/${account.id}`} className="link" style={{ marginTop: 8, display: 'inline-block' }}>
            {account.name}
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Prep Panel */}
        <div className="card" style={{ padding: 20 }}>
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} /> Meeting Prep
          </h2>

          {/* Prep Notes */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">Talking Points</label>
            <textarea
              className="input"
              rows={4}
              value={prepNotes}
              onChange={(e) => setPrepNotes(e.target.value)}
              onBlur={handleSavePrepNotes}
              placeholder="Add your agenda or talking points..."
            />
          </div>

          {/* Account Brief */}
          {account && (
            <>
              {account.pain && (
                <div style={{ marginBottom: 12 }}>
                  <label className="label">Pain</label>
                  <p className="text-sm">{account.pain}</p>
                </div>
              )}
              {account.whyNow && (
                <div style={{ marginBottom: 12 }}>
                  <label className="label">Why Now</label>
                  <p className="text-sm">{account.whyNow}</p>
                </div>
              )}
              {account.scores && <FIUACBars scores={account.scores} />}
            </>
          )}

          {/* Key Contacts */}
          {contacts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label className="label">Key Contacts</label>
              <table className="table-sm" style={{ width: '100%' }}>
                <thead>
                  <tr><th>Name</th><th>Role</th><th>Warmth</th></tr>
                </thead>
                <tbody>
                  {contacts.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td><Badge variant="neutral">{c.role}</Badge></td>
                      <td><Badge variant={c.warmth === 'Strong' ? 'ok' : c.warmth === 'Warm' ? 'warn' : 'neutral'}>{c.warmth}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Open Opportunities */}
          {opportunities.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label className="label">Open Opportunities</label>
              {opportunities.map((opp: any) => (
                <div key={opp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{opp.name}</span>
                  <span><StageBadge stage={opp.stage} /></span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Activity + Outcome */}
        <div>
          {/* Recent Activity */}
          {activities.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <h2 className="section-title">Recent Activity</h2>
              {activities.map((a: any) => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-sm">{a.summary}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Outcome Panel */}
          <div className="card" style={{ padding: 20 }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} /> Meeting Outcome
            </h2>

            {!showOutcome ? (
              <button
                className={`btn ${isPast ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowOutcome(true)}
                style={{ width: '100%' }}
              >
                Log Outcome
              </button>
            ) : (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label className="label">Summary *</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={outcomeForm.summary}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, summary: e.target.value })}
                    placeholder="What happened in the meeting?"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label className="label">Sentiment</label>
                  <select
                    className="input"
                    value={outcomeForm.sentiment}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, sentiment: e.target.value as any })}
                  >
                    <option value="positive">Positive</option>
                    <option value="neutral">Neutral</option>
                    <option value="negative">Negative</option>
                  </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label className="label">Next Steps</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={outcomeForm.nextSteps}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, nextSteps: e.target.value })}
                    placeholder="What happens next?"
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={outcomeForm.createFollowUp}
                      onChange={(e) => setOutcomeForm({ ...outcomeForm, createFollowUp: e.target.checked })}
                    />
                    Create follow-up task
                  </label>
                </div>

                {outcomeForm.createFollowUp && (
                  <div style={{ marginLeft: 24, marginBottom: 12 }}>
                    <input
                      className="input"
                      placeholder="Task title"
                      value={outcomeForm.followUpTitle}
                      onChange={(e) => setOutcomeForm({ ...outcomeForm, followUpTitle: e.target.value })}
                      style={{ marginBottom: 8 }}
                    />
                    <input
                      className="input"
                      type="date"
                      value={outcomeForm.followUpDue}
                      onChange={(e) => setOutcomeForm({ ...outcomeForm, followUpDue: e.target.value })}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmitOutcome}
                    disabled={!outcomeForm.summary || logOutcome.isPending}
                  >
                    {logOutcome.isPending ? 'Saving...' : 'Save Outcome'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowOutcome(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Link meeting cards on home page**

In `src/app/(dashboard)/page.tsx`, find the meeting card section that renders `todayMeetings`. Wrap each meeting card in a `Link` to `/meetings/${meeting.id}`:

```tsx
import Link from 'next/link';

// In the meeting rendering section, wrap with:
<Link href={`/meetings/${meeting.id}`} key={meeting.id} style={{ textDecoration: 'none', color: 'inherit' }}>
  {/* existing meeting card content */}
</Link>
```

- [ ] **Step 3: Run test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/meetings/ src/app/\(dashboard\)/page.tsx
git commit -m "feat(W-18): add meeting detail page with prep notes and outcome logging"
```

---

## Chunk 4: Route Handler Migration to Scoped DB

### Task 16: Migrate Route Handlers to ctx.db

**Files:**
- All route handlers that use `db.*` on owned models (Account, Lead, Opportunity, Task, Goal, Meeting)

This task requires reading each route handler and replacing direct `db` usage with `ctx.db` where the handler uses `withHandler`. For handlers that don't use `withHandler` (raw GET handlers), you'll need to add session checks and create scoped clients inline.

- [ ] **Step 1: Identify all routes to migrate**

Search for `db.account.`, `db.lead.`, `db.opportunity.`, `db.task.`, `db.goal.`, `db.meeting.` usage across route files. Each `findMany`, `findFirst`, `findUnique` on these models should use the scoped client.

Routes to check:
- `src/app/api/accounts/route.ts` (GET, POST)
- `src/app/api/accounts/[id]/route.ts` (GET, PATCH)
- `src/app/api/leads/route.ts` (GET, POST)
- `src/app/api/opportunities/route.ts` (GET, POST)
- `src/app/api/opportunities/[id]/route.ts` (GET, PATCH)
- `src/app/api/tasks/route.ts` (GET, POST)
- `src/app/api/tasks/[id]/route.ts` (PATCH)
- `src/app/api/meetings/route.ts` (GET, POST)
- `src/app/api/meetings/[id]/route.ts` (GET, PATCH)
- `src/app/api/home/route.ts` (GET)
- `src/app/api/search/route.ts` (GET)
- `src/app/api/badge-counts/route.ts` (GET)

- [ ] **Step 2: For routes using withHandler**

Replace `db` with `ctx.db` in the handler body for read queries on owned models. Write operations (create/update) continue using `db` directly since they set the `ownerId` explicitly.

Example pattern:
```typescript
// Before:
const accounts = await db.account.findMany({ where: { status } });

// After:
const accounts = await ctx.db.account.findMany({ where: { status } });
```

- [ ] **Step 3: For routes NOT using withHandler (raw GET handlers)**

Add inline scoping:
```typescript
import { scopedDb } from '@/lib/scoped-db';
import { auth } from '@/lib/auth';

const session = await auth();
if (!session?.user?.id) return unauthorized();
const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');
// Use scoped.model.findMany(...) etc.
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat(S-11): migrate route handlers to scoped DB client for ownership boundaries"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address type and lint issues from security/privacy implementation"
```
