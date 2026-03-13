# Epic 5: User Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete user management layer — admin team UI, profile settings, per-user integration tokens, and account ownership.

**Architecture:** Settings page reorganized into tabs (Team, Integrations, Agents, Profile). New API routes for profile and invitations management. Schema migration adds `userId` FK to IntegrationToken, plus `notificationPrefs` and `lastLoginAt` to User. Account ownership surfaced with filtering and reassignment.

**Tech Stack:** Next.js 14, Prisma, NextAuth, React Query, Zod, Vitest, Tailwind CSS with CSS variables

**Spec:** `docs/superpowers/specs/2026-03-13-epic5-user-management-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `src/app/api/settings/profile/route.ts` | GET/PATCH current user profile |
| `src/app/api/settings/team/invitations/route.ts` | GET pending invitations |
| `src/app/api/settings/team/invite/[id]/route.ts` | PATCH to revoke invitation |
| `src/app/api/accounts/[id]/route.ts` | PATCH account (update fields + reassign owner) |
| `src/lib/queries/settings.ts` | React Query hooks for team, profile, invitations |
| `src/app/api/__tests__/settings-profile.test.ts` | Profile API tests |
| `src/app/api/__tests__/settings-invitations.test.ts` | Invitations API tests |
| `src/app/api/__tests__/accounts-patch.test.ts` | Account PATCH tests |
| `prisma/migrations/<timestamp>_epic5_user_management/migration.sql` | Schema migration |

### Modified Files
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `notificationPrefs`, `lastLoginAt` to User; add `userId` FK to IntegrationToken |
| `src/app/(dashboard)/settings/page.tsx` | Rewrite: tab navigation, wire team list, invite form, invitations list, integrations, profile |
| `src/app/api/settings/team/route.ts` | Open to all authenticated (not admin-only); add `lastLoginAt` to select |
| `src/app/api/settings/team/[id]/route.ts` | Add self-role-change prevention |
| `src/app/api/auth/callback/route.ts` | Require session; link token to `userId`; change upsert key |
| `src/lib/integrations/email-sync.ts` | Loop over all user tokens instead of findFirst |
| `src/lib/integrations/calendar-sync.ts` | Loop over all user tokens instead of findFirst |
| `src/lib/auth.ts` | Update `lastLoginAt` on sign-in; remove `deriveInitials` (moved to `auth-callbacks.ts`) |
| `src/lib/auth-callbacks.ts` | Extracted signIn callback with `deriveInitials` for testability |
| `src/lib/api-client.ts` | Add settings and accounts PATCH methods |
| `src/app/(dashboard)/accounts/page.tsx` | Add "My Accounts" / "All" toggle |
| `src/app/(dashboard)/accounts/[id]/page.tsx` | Show owner badge; admin reassign dropdown |
| `src/app/api/accounts/route.ts` | Add `?owner=me` filter with session access |
| `src/lib/queries/accounts.ts` | Add owner filter param to query hook |

---

## Chunk 1: Schema Migration + Backend Foundation

### Task 1: Prisma Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to User model**

Find the User model and add after `isActive`:

```prisma
notificationPrefs Json?
lastLoginAt       DateTime?
```

Add the relation field:

```prisma
integrationTokens IntegrationToken[]
```

- [ ] **Step 2: Update IntegrationToken model**

Replace the IntegrationToken model with:

```prisma
model IntegrationToken {
  id           String   @id @default(cuid())
  provider     String
  accessToken  String   @db.Text
  refreshToken String   @db.Text
  expiresAt    DateTime
  userEmail    String
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([provider, userId])
  @@map("integration_tokens")
}
```

- [ ] **Step 3: Generate migration**

Run: `npx prisma migrate dev --name epic5_user_management`

This will fail if existing IntegrationToken rows lack userId. Since this is a dev environment, the migration should:
1. Add `userId` as nullable
2. Backfill from User.email matching IntegrationToken.userEmail
3. Make `userId` non-nullable

If `prisma migrate dev` auto-generates SQL that doesn't handle this, manually edit the migration SQL:

```sql
-- Add nullable userId column
ALTER TABLE "integration_tokens" ADD COLUMN "userId" TEXT;

-- Backfill from user email
UPDATE "integration_tokens" SET "userId" = u."id"
FROM "users" u WHERE "integration_tokens"."userEmail" = u."email";

-- Delete orphaned tokens (no matching user)
DELETE FROM "integration_tokens" WHERE "userId" IS NULL;

-- Make non-nullable
ALTER TABLE "integration_tokens" ALTER COLUMN "userId" SET NOT NULL;

-- Drop old unique constraint
ALTER TABLE "integration_tokens" DROP CONSTRAINT IF EXISTS "integration_tokens_provider_userEmail_key";

-- Add new unique constraint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_provider_userId_key" UNIQUE ("provider", "userId");

-- Add foreign key
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add User fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
```

- [ ] **Step 4: Verify migration**

Run: `npx prisma generate`

Run: `npx prisma db push --accept-data-loss` (dev only, if migrate fails)

Verify no errors. The Prisma client should now have the new fields.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Epic 5 schema changes — userId on IntegrationToken, notificationPrefs and lastLoginAt on User"
```

---

### Task 2: Update lastLoginAt in Auth Callback

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Write the test**

Create `src/app/api/__tests__/auth-lastlogin.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    invitation: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

describe('signIn callback updates lastLoginAt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates lastLoginAt for existing active user', async () => {
    const existingUser = { id: 'u1', email: 'test@co.com', isActive: true, role: 'MEMBER' };
    mockDb.user.findUnique.mockResolvedValue(existingUser);
    mockDb.user.update.mockResolvedValue(existingUser);

    // Import after mocks
    const { testSignInCallback } = await import('@/lib/auth-callbacks');

    const result = await testSignInCallback({ user: { email: 'test@co.com', name: 'Test' } });

    expect(result).toBe(true);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        lastLoginAt: expect.any(Date),
      }),
    });
  });
});
```

- [ ] **Step 2: Extract signIn callback for testability**

Create `src/lib/auth-callbacks.ts`:

```typescript
import { db } from '@/lib/db';

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}

export async function testSignInCallback({ user }: { user: { email?: string | null; name?: string | null } }): Promise<boolean> {
  if (!user.email) return false;

  const existing = await db.user.findUnique({ where: { email: user.email } });

  if (existing) {
    if (!existing.isActive) return false;
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: user.name || user.email,
        lastLoginAt: new Date(),
      },
    });
    return true;
  }

  const invitation = await db.invitation.findFirst({
    where: { email: user.email, status: 'PENDING', expiresAt: { gt: new Date() } },
  });

  if (!invitation) return false;

  await db.user.create({
    data: {
      email: user.email,
      name: user.name || user.email,
      initials: deriveInitials(user.name || user.email),
      role: invitation.role,
      lastLoginAt: new Date(),
    },
  });

  await db.invitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } });
  return true;
}
```

- [ ] **Step 3: Update auth.ts to use extracted callback**

In `src/lib/auth.ts`, import and use the extracted callback:

```typescript
import { testSignInCallback } from './auth-callbacks';
```

Replace the signIn callback body:
```typescript
async signIn({ user }) {
  return testSignInCallback({ user });
},
```

Also remove the `deriveInitials` function from `auth.ts` (it now lives in `auth-callbacks.ts`).

- [ ] **Step 4: Run test**

Run: `npx vitest run src/app/api/__tests__/auth-lastlogin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-callbacks.ts src/lib/auth.ts src/app/api/__tests__/auth-lastlogin.test.ts
git commit -m "feat(auth): extract signIn callback and update lastLoginAt on login"
```

---

### Task 3: Profile API (GET + PATCH)

**Files:**
- Create: `src/app/api/settings/profile/route.ts`
- Create: `src/app/api/__tests__/settings-profile.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/app/api/__tests__/settings-profile.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuth } = vi.hoisted(() => ({
  mockDb: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

function makeRequest(body?: object): NextRequest {
  return new NextRequest('http://localhost/api/settings/profile', {
    method: body ? 'PATCH' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/settings/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'MEMBER' } });
  });

  it('returns current user profile', async () => {
    const user = { id: 'u1', name: 'Test', email: 'test@co.com', initials: 'T', role: 'MEMBER', notificationPrefs: null, lastLoginAt: null };
    mockDb.user.findUnique.mockResolvedValue(user);

    const { GET } = await import('@/app/api/settings/profile/route');
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.email).toBe('test@co.com');
    expect(json.data.notificationPrefs).toEqual({ emailAlerts: true, queueAlerts: true });
  });

  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import('@/app/api/settings/profile/route');
    const res = await GET();

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/settings/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'MEMBER' } });
  });

  it('updates name and initials', async () => {
    const updated = { id: 'u1', name: 'New Name', initials: 'NN', email: 'test@co.com', role: 'MEMBER', notificationPrefs: null, lastLoginAt: null };
    mockDb.user.update.mockResolvedValue(updated);

    const { PATCH } = await import('@/app/api/settings/profile/route');
    const res = await PATCH(makeRequest({ name: 'New Name', initials: 'NN' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.name).toBe('New Name');
  });

  it('rejects invalid initials (too long)', async () => {
    const { PATCH } = await import('@/app/api/settings/profile/route');
    const res = await PATCH(makeRequest({ initials: 'ABCD' }));

    expect(res.status).toBe(400);
  });

  it('updates notification preferences', async () => {
    const updated = { id: 'u1', name: 'Test', initials: 'T', email: 'test@co.com', role: 'MEMBER', notificationPrefs: { emailAlerts: false, queueAlerts: true }, lastLoginAt: null };
    mockDb.user.update.mockResolvedValue(updated);

    const { PATCH } = await import('@/app/api/settings/profile/route');
    const res = await PATCH(makeRequest({ notificationPrefs: { emailAlerts: false, queueAlerts: true } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.notificationPrefs).toEqual({ emailAlerts: false, queueAlerts: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/__tests__/settings-profile.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement profile route**

Create `src/app/api/settings/profile/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized, zodError } from '@/lib/api-errors';

const DEFAULT_PREFS = { emailAlerts: true, queueAlerts: true };

const profileSelect = {
  id: true,
  name: true,
  email: true,
  initials: true,
  role: true,
  notificationPrefs: true,
  lastLoginAt: true,
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: profileSelect,
  });

  if (!user) return unauthorized();

  return NextResponse.json({
    data: {
      ...user,
      notificationPrefs: (user.notificationPrefs as Record<string, boolean>) ?? DEFAULT_PREFS,
    },
  });
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  initials: z.string().min(1).max(3).optional(),
  notificationPrefs: z
    .object({
      emailAlerts: z.boolean(),
      queueAlerts: z.boolean(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const raw = await req.json();
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const updated = await db.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: profileSelect,
  });

  return NextResponse.json({
    data: {
      ...updated,
      notificationPrefs: (updated.notificationPrefs as Record<string, boolean>) ?? DEFAULT_PREFS,
    },
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/api/__tests__/settings-profile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/profile/route.ts src/app/api/__tests__/settings-profile.test.ts
git commit -m "feat(api): add GET/PATCH /api/settings/profile for user profile management"
```

---

### Task 4: Invitations API (GET list + PATCH revoke)

**Files:**
- Create: `src/app/api/settings/team/invitations/route.ts`
- Create: `src/app/api/settings/team/invite/[id]/route.ts`
- Create: `src/app/api/__tests__/settings-invitations.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/app/api/__tests__/settings-invitations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuth } = vi.hoisted(() => ({
  mockDb: {
    user: { findUnique: vi.fn() },
    invitation: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

describe('GET /api/settings/team/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
  });

  it('returns pending invitations for admin', async () => {
    const invitations = [
      { id: 'inv1', email: 'new@co.com', role: 'MEMBER', expiresAt: new Date(Date.now() + 86400000), createdAt: new Date() },
    ];
    mockDb.invitation.findMany.mockResolvedValue(invitations);

    const { GET } = await import('@/app/api/settings/team/invitations/route');
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].email).toBe('new@co.com');
  });

  it('returns 403 for non-admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'MEMBER' } });
    mockDb.user.findUnique.mockResolvedValue({ id: 'u2', role: 'MEMBER' });

    const { GET } = await import('@/app/api/settings/team/invitations/route');
    const res = await GET();

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/settings/team/invite/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
  });

  it('revokes a pending invitation', async () => {
    const invitation = { id: 'inv1', status: 'PENDING', email: 'new@co.com' };
    mockDb.invitation.findUnique.mockResolvedValue(invitation);
    mockDb.invitation.update.mockResolvedValue({ ...invitation, status: 'REVOKED' });

    const { PATCH } = await import('@/app/api/settings/team/invite/[id]/route');
    const req = new NextRequest('http://localhost/api/settings/team/invite/inv1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REVOKED' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'inv1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('REVOKED');
  });

  it('rejects revoking a non-pending invitation', async () => {
    mockDb.invitation.findUnique.mockResolvedValue({ id: 'inv1', status: 'ACCEPTED' });

    const { PATCH } = await import('@/app/api/settings/team/invite/[id]/route');
    const req = new NextRequest('http://localhost/api/settings/team/invite/inv1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'REVOKED' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'inv1' }) });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/__tests__/settings-invitations.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement GET invitations**

Create `src/app/api/settings/team/invitations/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized, forbidden } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const invitations = await db.invitation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: invitations });
}
```

- [ ] **Step 4: Implement PATCH invite revoke**

Create `src/app/api/settings/team/invite/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized, forbidden, notFound, badRequest, zodError } from '@/lib/api-errors';

const revokeSchema = z.object({
  status: z.literal('REVOKED'),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const { id } = await params;
  const raw = await req.json();
  const parsed = revokeSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const invitation = await db.invitation.findUnique({ where: { id } });
  if (!invitation) return notFound('Invitation not found');
  if (invitation.status !== 'PENDING') return badRequest('Only pending invitations can be revoked');

  const updated = await db.invitation.update({
    where: { id },
    data: { status: 'REVOKED' },
    select: { id: true, email: true, role: true, status: true },
  });

  return NextResponse.json({ data: updated });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/app/api/__tests__/settings-invitations.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/settings/team/invitations/route.ts src/app/api/settings/team/invite/[id]/route.ts src/app/api/__tests__/settings-invitations.test.ts
git commit -m "feat(api): add GET /invitations and PATCH /invite/[id] for invitation management"
```

---

### Task 5: Update Team API (Open to All + lastLoginAt + Self-Role Guard)

**Files:**
- Modify: `src/app/api/settings/team/route.ts`
- Modify: `src/app/api/settings/team/[id]/route.ts`

- [ ] **Step 1: Update GET /api/settings/team**

Open `src/app/api/settings/team/route.ts`. Change the admin-only check to allow any authenticated user, and add `lastLoginAt` to the select:

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: users });
}
```

- [ ] **Step 2: Add self-role-change prevention to PATCH**

In `src/app/api/settings/team/[id]/route.ts`, add after the existing self-deactivation check:

```typescript
// Prevent self-role-change
if (id === session.user.id && parsed.data.role) {
  return badRequest('Cannot change your own role');
}
```

Import `badRequest` from `@/lib/api-errors` if not already imported.

- [ ] **Step 3: Run existing tests**

Run: `npx vitest run src/app/api/__tests__/`
Expected: All existing tests still pass

- [ ] **Step 4: Commit**

```bash
git add src/app/api/settings/team/route.ts src/app/api/settings/team/[id]/route.ts
git commit -m "feat(api): open team list to all users, add lastLoginAt, prevent self-role-change"
```

---

### Task 6: Account PATCH API + Owner Filter

**Files:**
- Create: `src/app/api/accounts/[id]/route.ts`
- Modify: `src/app/api/accounts/route.ts`
- Create: `src/app/api/__tests__/accounts-patch.test.ts`

- [ ] **Step 1: Write the tests**

Create `src/app/api/__tests__/accounts-patch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuth } = vi.hoisted(() => ({
  mockDb: {
    account: { findUnique: vi.fn(), update: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

describe('PATCH /api/accounts/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
  });

  it('updates account fields', async () => {
    const account = { id: 'a1', name: 'Acme', ownerId: 'u1' };
    mockDb.account.findUnique.mockResolvedValue(account);
    mockDb.account.update.mockResolvedValue({ ...account, name: 'Acme Corp' });

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Acme Corp' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockDb.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' } }),
    );
  });

  it('reassigns owner', async () => {
    const account = { id: 'a1', name: 'Acme', ownerId: 'u1' };
    mockDb.account.findUnique.mockResolvedValue(account);
    mockDb.account.update.mockResolvedValue({ ...account, ownerId: 'u2' });

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: 'u2' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });

    expect(res.status).toBe(200);
    expect(mockDb.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: 'u2' }) }),
    );
  });

  it('returns 404 for non-existent account', async () => {
    mockDb.account.findUnique.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/accounts/[id]/route');
    const req = new NextRequest('http://localhost/api/accounts/a1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'a1' }) });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/__tests__/accounts-patch.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement PATCH /api/accounts/[id]**

Create `src/app/api/accounts/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';

const updateAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  pain: z.string().optional(),
  whyNow: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;

  const account = await db.account.findUnique({ where: { id } });
  if (!account) return notFound('Account not found');

  const raw = await req.json();
  const parsed = updateAccountSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const updated = await db.account.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({ data: updated });
}
```

- [ ] **Step 4: Add ?owner=me filter to GET /api/accounts**

The GET handler in `src/app/api/accounts/route.ts` uses direct `export async function GET(req: NextRequest)` (no `withHandler`, no `auth()` call). Add session import and owner filtering.

Add import at top:
```typescript
import { auth } from '@/lib/auth';
```

After line `if (type && type !== 'all') where.type = type;` (line 76), add:

```typescript
  const ownerParam = req.nextUrl.searchParams.get('owner');
  if (ownerParam === 'me') {
    const session = await auth();
    if (session?.user?.id) {
      where.ownerId = session.user.id;
    }
  }
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/app/api/__tests__/accounts-patch.test.ts`
Expected: PASS

Run: `npx vitest run src/app/api/__tests__/`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/api/accounts/[id]/route.ts src/app/api/accounts/route.ts src/app/api/__tests__/accounts-patch.test.ts
git commit -m "feat(api): add PATCH /accounts/[id] and ?owner=me filter for account ownership"
```

---

### Task 7: OAuth Callback — Require Session + Link to userId

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Update the callback**

Rewrite `src/app/api/auth/callback/route.ts` to require a session and link tokens to userId:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { exchangeCodeForTokens, getGraphUser } from '@/lib/integrations/microsoft-graph';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    console.error('OAuth error:', error, req.nextUrl.searchParams.get('error_description'));
    return NextResponse.redirect(new URL('/settings?error=auth_failed', req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', req.url));
  }

  // Require active session
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login?callbackUrl=/settings', req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await getGraphUser(tokens.access_token);

    await db.integrationToken.upsert({
      where: { provider_userId: { provider: 'microsoft', userId: session.user.id } },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        userEmail: profile.mail,
      },
      create: {
        provider: 'microsoft',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        userEmail: profile.mail,
        userId: session.user.id,
      },
    });

    console.log(`Microsoft Graph connected for user ${session.user.id} (${profile.mail})`);
    return NextResponse.redirect(new URL('/settings?connected=microsoft', req.url));
  } catch (err) {
    console.error('OAuth token exchange failed:', err);
    return NextResponse.redirect(new URL('/settings?error=token_exchange', req.url));
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/callback/route.ts
git commit -m "feat(auth): update OAuth callback to require session and link token to userId"
```

---

### Task 8: Update Sync Jobs for Multi-User Tokens

**Files:**
- Modify: `src/lib/integrations/email-sync.ts`
- Modify: `src/lib/integrations/calendar-sync.ts`

- [ ] **Step 1: Update email-sync.ts**

Replace the `syncEmails` function (lines 84-168). The key changes: `findMany` instead of `findFirst`, wrap the fetch/classify/store logic in a per-user loop, aggregate results.

```typescript
export async function syncEmails(): Promise<{ synced: number; errors: string[] }> {
  const tokens = await db.integrationToken.findMany({
    where: { provider: 'microsoft', user: { isActive: true } },
    include: { user: true },
  });

  if (tokens.length === 0) {
    return { synced: 0, errors: ['No Microsoft tokens found — users need to connect Outlook'] };
  }

  let totalSynced = 0;
  const allErrors: string[] = [];

  for (const tokenRow of tokens) {
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
            },
          });
        } catch (err) {
          allErrors.push(`Token refresh failed for ${tokenRow.userEmail} — reconnect Outlook`);
          continue;
        }
      }

      // Fetch emails from last 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let graphEmails: GraphEmail[];
      try {
        graphEmails = await fetchRecentEmails(accessToken, since);
      } catch (err) {
        allErrors.push(`Graph API error for ${tokenRow.userEmail}: ${err}`);
        continue;
      }

      for (const ge of graphEmails) {
        try {
          // Skip if already synced (by subject + from + receivedDateTime)
          const existing = await db.inboxEmail.findFirst({
            where: {
              subject: ge.subject,
              fromEmail: ge.from.emailAddress.address,
              receivedAt: new Date(ge.receivedDateTime),
            },
          });
          if (existing) continue;

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
          totalSynced++;
        } catch (err) {
          allErrors.push(`Failed to sync email "${ge.subject}": ${err}`);
        }
      }
    } catch (err) {
      allErrors.push(`Sync failed for user ${tokenRow.userEmail}: ${err}`);
    }
  }

  return { synced: totalSynced, errors: allErrors };
}
```

- [ ] **Step 2: Update calendar-sync.ts**

Replace the `syncCalendar` function (lines 32-111). Same pattern: `findMany`, per-user loop.

```typescript
export async function syncCalendar(): Promise<{ synced: number; errors: string[] }> {
  const tokens = await db.integrationToken.findMany({
    where: { provider: 'microsoft', user: { isActive: true } },
    include: { user: true },
  });

  if (tokens.length === 0) {
    return { synced: 0, errors: ['No Microsoft tokens found — users need to connect Outlook'] };
  }

  let totalSynced = 0;
  const allErrors: string[] = [];

  for (const tokenRow of tokens) {
    try {
      // Refresh if expired
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
            },
          });
        } catch {
          allErrors.push(`Token refresh failed for ${tokenRow.userEmail} — reconnect Outlook`);
          continue;
        }
      }

      // Fetch next 14 days of events
      let events: GraphEvent[];
      try {
        events = await fetchUpcomingEvents(accessToken, 14);
      } catch (err) {
        allErrors.push(`Graph API error for ${tokenRow.userEmail}: ${err}`);
        continue;
      }

      for (const ev of events) {
        try {
          if (ev.isAllDay) continue;

          // Dedup by subject + date
          const evDate = new Date(ev.start.dateTime);
          const startOfDay = new Date(evDate); startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(evDate); endOfDay.setHours(23, 59, 59, 999);

          const existing = await db.meeting.findFirst({
            where: { title: ev.subject, date: { gte: startOfDay, lte: endOfDay } },
          });
          if (existing) continue;

          // Match attendees to accounts
          const externalAttendees = ev.attendees.filter(a => a.type !== 'organizer');
          const attendeeNames = externalAttendees.map(a => a.emailAddress.name);
          let accountMatch: { accountId: string; accountName: string } | null = null;

          for (const att of externalAttendees) {
            const match = await matchAttendeeToAccount(att.emailAddress.address);
            if (match) { accountMatch = match; break; }
          }

          await db.meeting.create({
            data: {
              title: ev.subject,
              startTime: formatTime(ev.start.dateTime),
              duration: formatDuration(ev.start.dateTime, ev.end.dateTime),
              date: new Date(ev.start.dateTime),
              attendees: attendeeNames,
              prepStatus: 'draft',
              accountId: accountMatch?.accountId || null,
              accountName: accountMatch?.accountName || null,
            },
          });
          totalSynced++;
        } catch (err) {
          allErrors.push(`Failed to sync event "${ev.subject}": ${err}`);
        }
      }
    } catch (err) {
      allErrors.push(`Sync failed for user ${tokenRow.userEmail}: ${err}`);
    }
  }

  return { synced: totalSynced, errors: allErrors };
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/integrations/email-sync.ts src/lib/integrations/calendar-sync.ts
git commit -m "feat(sync): update email and calendar sync to loop over all per-user tokens"
```

---

### Task 9: Add U-04 Policy Comment

**Files:**
- Modify: `src/app/api/queue/route.ts`

- [ ] **Step 1: Add comment**

Add at the top of the queue route file, after imports:

```typescript
/**
 * Approval authority policy (U-04):
 * Any MEMBER or ADMIN can approve/reject any queue item.
 * VIEWER cannot mutate (enforced by middleware).
 * This is intentional — no owner-based or seniority-based restrictions.
 */
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/queue/route.ts
git commit -m "docs(api): document approval authority policy (U-04) in queue route"
```

---

## Chunk 2: React Query Hooks + API Client

### Task 10: API Client Extensions

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add settings and accounts PATCH methods**

Add to the `api` object in `src/lib/api-client.ts`:

```typescript
settings: {
  team: () => get<any>('/settings/team'),
  invitations: () => get<any>('/settings/team/invitations'),
  invite: (data: { email: string; role?: string }) => post<any>('/settings/team/invite', data),
  revokeInvite: (id: string) => patch<any>(`/settings/team/invite/${id}`, { status: 'REVOKED' }),
  updateUser: (id: string, data: { role?: string; isActive?: boolean }) => patch<any>(`/settings/team/${id}`, data),
  profile: () => get<any>('/settings/profile'),
  updateProfile: (data: { name?: string; initials?: string; notificationPrefs?: { emailAlerts: boolean; queueAlerts: boolean } }) =>
    patch<any>('/settings/profile', data),
},
```

Also add a `patch` helper if it doesn't exist:

```typescript
async function patch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, extractErrorMessage(err, `API ${path}: ${res.status}`));
  }
  return res.json();
}
```

Add account update:

```typescript
// Under api.accounts, add:
update: (id: string, data: Record<string, unknown>) => patch<any>(`/accounts/${id}`, data),
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat(api-client): add settings, profile, invitation, and account PATCH methods"
```

---

### Task 11: React Query Hooks for Settings

**Files:**
- Create: `src/lib/queries/settings.ts`

- [ ] **Step 1: Create settings query hooks**

Create `src/lib/queries/settings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  invitations: () => ['settings', 'invitations'] as const,
  profile: () => ['settings', 'profile'] as const,
};

// Team list
export function useTeamQuery() {
  return useQuery({
    queryKey: settingsKeys.team(),
    queryFn: () => api.settings.team(),
  });
}

// Pending invitations
export function useInvitationsQuery() {
  return useQuery({
    queryKey: settingsKeys.invitations(),
    queryFn: () => api.settings.invitations(),
  });
}

// Current user profile
export function useProfileQuery() {
  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: () => api.settings.profile(),
  });
}

// Invite user
export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role?: string }) => api.settings.invite(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.invitations() });
    },
  });
}

// Revoke invitation
export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.settings.revokeInvite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.invitations() });
    },
  });
}

// Update team member (role, isActive)
export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: string; isActive?: boolean } }) =>
      api.settings.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.team() });
    },
  });
}

// Update profile
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; initials?: string; notificationPrefs?: { emailAlerts: boolean; queueAlerts: boolean } }) =>
      api.settings.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.profile() });
    },
  });
}
```

- [ ] **Step 2: Update accounts query hook for owner filter**

In `src/lib/queries/accounts.ts`, update the query key factory and hook:

```typescript
export const accountKeys = {
  all: ['accounts'] as const,
  list: (q?: string, type?: string, owner?: string) => ['accounts', 'list', q, type, owner] as const,
  detail: (id: string) => ['accounts', id] as const,
};

export function useAccountsQuery(q?: string, type?: string, owner?: string) {
  return useQuery({
    queryKey: accountKeys.list(q, type, owner),
    queryFn: () => api.accounts.list({ q, type, owner }),
    placeholderData: keepPreviousData,
  });
}
```

Also update `api.accounts.list` in `api-client.ts` to pass the `owner` param:

```typescript
list: (opts?: { q?: string; type?: string; cursor?: string; limit?: number; owner?: string }) => {
  const params = new URLSearchParams();
  if (opts?.q) params.set('q', opts.q);
  if (opts?.type) params.set('type', opts.type);
  if (opts?.cursor) params.set('cursor', opts.cursor);
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.owner) params.set('owner', opts.owner);
  return get<any>(`/accounts?${params}`);
},
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/settings.ts src/lib/queries/accounts.ts src/lib/api-client.ts
git commit -m "feat(queries): add React Query hooks for settings, profile, invitations, and account owner filter"
```

---

## Chunk 3: Settings Page UI Rewrite

### Task 12: Settings Page Tab Structure

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Rewrite Settings page with tabs**

Rewrite `src/app/(dashboard)/settings/page.tsx` with tab navigation. The page should have four tabs: Team, Integrations, Agents, Profile.

```typescript
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from '@/lib/store';
import {
  useTeamQuery,
  useInvitationsQuery,
  useProfileQuery,
  useUpdateTeamMember,
  useInviteUser,
  useRevokeInvitation,
  useUpdateProfile,
} from '@/lib/queries/settings';

const TABS = ['Team', 'Integrations', 'Agents', 'Profile'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Team');
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl">
      <h1 className="text-[15px] font-semibold text-[var(--text)]">Settings</h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-[12px] font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab
                ? 'border-brand text-[var(--text)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--sub)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Team' && <TeamTab isAdmin={isAdmin} />}
      {activeTab === 'Integrations' && <IntegrationsTab />}
      {activeTab === 'Agents' && <AgentsTab />}
      {activeTab === 'Profile' && <ProfileTab />}
    </div>
  );
}
```

- [ ] **Step 2: Implement TeamTab component**

In the same file, add the TeamTab component:

```typescript
function TeamTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: teamData, isLoading: teamLoading } = useTeamQuery();
  const { data: invData, isLoading: invLoading } = useInvitationsQuery();
  const updateMember = useUpdateTeamMember();
  const inviteUser = useInviteUser();
  const revokeInvite = useRevokeInvitation();
  const { openDrawer, closeDrawer, addToast } = useStore();
  const { data: session } = useSession();
  const [confirmAction, setConfirmAction] = useState<{ userId: string; field: string; value: string | boolean } | null>(null);

  const team = teamData?.data ?? [];
  const invitations = invData?.data ?? [];

  function handleRoleChange(userId: string, newRole: string) {
    // Show confirmation dialog
    setConfirmAction({ userId, field: 'role', value: newRole });
  }

  function handleToggleActive(userId: string, currentlyActive: boolean) {
    setConfirmAction({ userId, field: 'isActive', value: !currentlyActive });
  }

  function executeConfirmedAction() {
    if (!confirmAction) return;
    const data = confirmAction.field === 'role'
      ? { role: confirmAction.value as string }
      : { isActive: confirmAction.value as boolean };
    updateMember.mutate(
      { id: confirmAction.userId, data },
      {
        onSuccess: () => {
          addToast({ type: 'success', message: confirmAction.field === 'role' ? 'Role updated' : (confirmAction.value ? 'User reactivated' : 'User deactivated') });
          setConfirmAction(null);
        },
        onError: (err) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  function openInviteDrawer() {
    const state = { email: '', role: 'MEMBER' };
    openDrawer({
      title: 'Invite Team Member',
      subtitle: 'Send an invitation link',
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email *</span>
            <input
              autoFocus
              type="email"
              onChange={(e) => { state.email = e.target.value; }}
              placeholder="colleague@company.com"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Role</span>
            <select
              defaultValue="MEMBER"
              onChange={(e) => { state.role = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>
            Cancel
          </button>
          <button
            disabled={inviteUser.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
            onClick={() => {
              if (!state.email.trim()) {
                addToast({ type: 'error', message: 'Email is required' });
                return;
              }
              inviteUser.mutate(
                { email: state.email.trim(), role: state.role },
                {
                  onSuccess: (res) => {
                    const link = res?.data?.inviteLink || 'Check server response';
                    navigator.clipboard.writeText(link).catch(() => {});
                    addToast({ type: 'success', message: `Invitation sent! Link copied to clipboard.` });
                    closeDrawer();
                  },
                  onError: (err) => addToast({ type: 'error', message: err.message }),
                },
              );
            }}
          >
            Send Invitation
          </button>
        </>
      ),
    });
  }

  if (teamLoading) return <div className="animate-pulse space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-[var(--card-hover)] rounded" />)}</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Team Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Team Members ({team.length})</span>
        {isAdmin && (
          <button onClick={openInviteDrawer} className="px-3 py-1 text-[11px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors">
            Invite Member
          </button>
        )}
      </div>

      {/* Team List */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {team.map((user: any) => (
          <div key={user.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex flex-col">
              <span className="text-[12px] font-medium text-[var(--text)]">
                {user.name}
                {user.id === session?.user?.id && <span className="text-[10px] text-[var(--muted)] ml-1">(you)</span>}
              </span>
              <span className="text-[10px] text-[var(--muted)]">{user.email}</span>
              {user.lastLoginAt && (
                <span className="text-[9px] text-[var(--muted)]">Last active: {new Date(user.lastLoginAt).toLocaleDateString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!user.isActive && (
                <span className="text-[10px] font-semibold px-1.5 py-[1px] rounded border border-red-500/30 text-red-400 bg-red-500/10">Inactive</span>
              )}
              {isAdmin && user.id !== session?.user?.id ? (
                <>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="px-2 py-1 text-[11px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleToggleActive(user.id, user.isActive)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md border transition-colors ${
                      user.isActive
                        ? 'text-red-400 border-red-500/30 hover:bg-red-500/10'
                        : 'text-green-400 border-green-500/30 hover:bg-green-500/10'
                    }`}
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-[var(--sub)] px-2 py-1">{user.role}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--elevated)] border border-[var(--border)] rounded-lg p-4 max-w-sm mx-4">
            <p className="text-[12px] text-[var(--text)] mb-3">
              {confirmAction.field === 'role'
                ? `Change this user's role to ${confirmAction.value}?`
                : confirmAction.value
                  ? 'Reactivate this user? They will be able to sign in again.'
                  : 'Deactivate this user? They will not be able to sign in.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="px-3 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">
                Cancel
              </button>
              <button
                onClick={executeConfirmedAction}
                disabled={updateMember.isPending}
                className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Invitations (Admin Only) */}
      {isAdmin && invitations.length > 0 && (
        <>
          <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)] mt-2">Pending Invitations ({invitations.length})</span>
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {invitations.map((inv: any) => {
              const daysLeft = Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / 86400000);
              return (
                <div key={inv.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-[12px] text-[var(--text)]">{inv.email}</span>
                    <span className="text-[10px] text-[var(--muted)]">Role: {inv.role} &middot; Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => revokeInvite.mutate(inv.id, {
                      onSuccess: () => addToast({ type: 'success', message: 'Invitation revoked' }),
                      onError: (err) => addToast({ type: 'error', message: err.message }),
                    })}
                    disabled={revokeInvite.isPending}
                    className="px-2 py-1 text-[10px] font-medium text-red-400 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement ProfileTab component**

```typescript
function ProfileTab() {
  const { data: profileData, isLoading } = useProfileQuery();
  const updateProfile = useUpdateProfile();
  const { addToast } = useStore();
  const [formState, setFormState] = useState<{ name: string; initials: string; emailAlerts: boolean; queueAlerts: boolean } | null>(null);

  const profile = profileData?.data;

  // Initialize form state when data loads
  if (profile && !formState) {
    setFormState({
      name: profile.name,
      initials: profile.initials,
      emailAlerts: profile.notificationPrefs?.emailAlerts ?? true,
      queueAlerts: profile.notificationPrefs?.queueAlerts ?? true,
    });
  }

  function handleSave() {
    if (!formState) return;
    updateProfile.mutate(
      {
        name: formState.name,
        initials: formState.initials,
        notificationPrefs: { emailAlerts: formState.emailAlerts, queueAlerts: formState.queueAlerts },
      },
      {
        onSuccess: () => addToast({ type: 'success', message: 'Profile updated' }),
        onError: (err) => addToast({ type: 'error', message: err.message }),
      },
    );
  }

  if (isLoading || !formState) return <div className="animate-pulse space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-[var(--card-hover)] rounded" />)}</div>;

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Your Profile</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 flex flex-col gap-3">
        {/* Read-only fields */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Email</span>
          <span className="px-2.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">{profile?.email}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Role</span>
          <span className="px-2.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md">{profile?.role}</span>
        </label>

        {/* Editable fields */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Display Name</span>
          <input
            value={formState.name}
            onChange={(e) => setFormState({ ...formState, name: e.target.value })}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Initials (max 3)</span>
          <input
            value={formState.initials}
            maxLength={3}
            onChange={(e) => setFormState({ ...formState, initials: e.target.value })}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 w-20"
          />
        </label>

        {/* Notification Preferences */}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mt-2">Notification Preferences</span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formState.emailAlerts}
            onChange={(e) => setFormState({ ...formState, emailAlerts: e.target.checked })}
            className="rounded"
          />
          <span className="text-[12px] text-[var(--text)]">Email alerts for new queue items</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formState.queueAlerts}
            onChange={(e) => setFormState({ ...formState, queueAlerts: e.target.checked })}
            className="rounded"
          />
          <span className="text-[12px] text-[var(--text)]">Queue alerts for items needing review</span>
        </label>

        <button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="mt-2 px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 self-start"
        >
          {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement IntegrationsTab component**

```typescript
function IntegrationsTab() {
  const { data: session } = useSession();
  const { addToast } = useStore();
  // For now, show a simplified version. Full per-user token status
  // requires a new API endpoint to check connection status.
  // This will be wired after the OAuth callback changes are deployed.

  const connectUrl = `/api/auth/connect?provider=microsoft`;

  return (
    <div className="flex flex-col gap-4">
      <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">Integrations</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[12px] font-medium text-[var(--text)]">Microsoft Outlook</span>
            <span className="text-[10px] text-[var(--muted)]">Email sync and calendar integration</span>
          </div>
          <a
            href={connectUrl}
            className="px-3 py-1.5 text-[11px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          >
            Connect Outlook
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement AgentsTab component**

Move the existing agents section from the current Settings page into its own tab component. **Preserve the exact AGENTS data array (lines 5-12) and the `openAgentConfig` drawer function (lines 34-74) from the current `settings/page.tsx`.** The agents data includes detailed status strings and params arrays that power the configuration drawer.

```typescript
const AGENTS = [
  { key: 'signal_hunter', name: 'Signal Hunter', status: 'Active · scanning 6 sources daily', desc: 'Monitors news, LinkedIn, registries for GoO market signals', params: ['Sources: Reuters, Bloomberg, LinkedIn, Montel, AIB, ENTSO-E', 'Scan frequency: Every 4 hours', 'Min relevance threshold: 60/100', 'Auto-dismiss below: 30/100'] },
  { key: 'lead_qualifier', name: 'Lead Qualifier', status: 'Active · FIUAC scoring enabled', desc: 'Scores new leads using FIUAC dimensions', params: ['Auto-qualify threshold: FIUAC ≥ 70', 'Auto-disqualify: FIUAC ≤ 25', 'Route to Queue when: 25 < FIUAC < 70'] },
  { key: 'account_enricher', name: 'Account Enricher', status: 'Active · weekly refresh', desc: 'Updates account briefs with new intelligence', params: ['Refresh cycle: Weekly', 'Sources: Signals, email sync, LinkedIn', 'Min confidence for auto-update: 85%', 'Below 85%: Route to Queue'] },
  { key: 'outreach_drafter', name: 'Outreach Drafter', status: 'Active · routed to Queue', desc: 'Generates personalized outreach using account context', params: ['Always route to Queue: Yes', 'Template style: Consultative', 'Personalization sources: Pain, WhyNow, Signals', 'Max sequence length: 4 steps'] },
  { key: 'pipeline_hygiene', name: 'Pipeline Hygiene', status: 'Active · daily health check', desc: 'Monitors deal health and flags stale opportunities', params: ['Stale threshold: 7 days no activity', 'Auto-decay: 5 pts/week engagement', 'Alert when health < 40'] },
  { key: 'inbox_classifier', name: 'Inbox Classifier', status: 'Active · Outlook connected', desc: 'Classifies incoming emails by intent', params: ['Classification types: Positive, Question, Objection, Meeting, OOO, New Domain', 'Auto-link by domain: Enabled', 'New domain detection: Enabled', 'Min classification confidence: 70%'] },
];

function AgentsTab() {
  const { openDrawer, closeDrawer } = useStore();

  function openAgentConfig(key: string) {
    const a = AGENTS.find(x => x.key === key);
    if (!a) return;
    openDrawer({
      title: `${a.name} — Configuration`,
      subtitle: 'AI Agent',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">{a.name}</div>
            <p className="text-[12.5px] text-sub">{a.desc}</p>
          </div>
          <div>
            <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2">Parameters</div>
            <div className="flex flex-col gap-1.5">
              {a.params.map(p => {
                const [k, v] = p.split(':');
                return (
                  <div key={p} className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                    <span className="text-[11px] text-sub">{k}</span>
                    <span className="text-[11px] font-medium text-[var(--text)]">{v || ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="ok">Active</Badge>
            <span className="text-[10px] text-muted">Last run: —</span>
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub hover:bg-[var(--hover)] rounded-md transition-colors" onClick={closeDrawer}>Close</button>
          <button className="px-3.5 py-1.5 text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Pause Agent</button>
        </>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-[9px] font-semibold tracking-wide uppercase text-[var(--muted)]">AI Agents</span>
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] divide-y divide-[var(--border)]">
        {AGENTS.map((agent) => (
          <div key={agent.key} className="flex items-center justify-between px-4 py-2.5">
            <div className="flex flex-col">
              <span className="text-[12.5px] font-medium text-[var(--text)]">{agent.name}</span>
              <span className="text-[10px] text-brand">{agent.status}</span>
            </div>
            <button
              className="px-2 py-1 text-[11px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
              onClick={() => openAgentConfig(agent.key)}
            >
              Configure
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat(settings): rewrite Settings page with tabs — Team, Integrations, Agents, Profile"
```

---

## Chunk 4: Account Ownership UI

### Task 13: Accounts List — Owner Filter Toggle

**Files:**
- Modify: `src/app/(dashboard)/accounts/page.tsx`

- [ ] **Step 1: Add "My Accounts" toggle**

In the accounts list page, add a toggle filter near the existing search/filter controls:

```typescript
const [ownerFilter, setOwnerFilter] = useState<'all' | 'me'>('all');
```

Update the query hook call to pass the owner filter:

```typescript
const { data, isLoading, error } = useAccountsQuery(search, typeFilter, ownerFilter === 'me' ? 'me' : undefined);
```

Add the toggle button near the search bar:

```tsx
<div className="flex items-center gap-2">
  <button
    onClick={() => setOwnerFilter(ownerFilter === 'all' ? 'me' : 'all')}
    className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors ${
      ownerFilter === 'me'
        ? 'bg-brand/10 border-brand/30 text-brand'
        : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--sub)]'
    }`}
  >
    {ownerFilter === 'me' ? 'My Accounts' : 'All Accounts'}
  </button>
</div>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/accounts/page.tsx
git commit -m "feat(accounts): add My Accounts / All Accounts toggle filter"
```

---

### Task 14: Account Detail — Owner Badge + Reassign

**Files:**
- Modify: `src/app/(dashboard)/accounts/[id]/page.tsx`
- Modify: `src/lib/queries/accounts.ts`

- [ ] **Step 1: Add account update mutation hook**

In `src/lib/queries/accounts.ts`, add:

```typescript
export function useUpdateAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.accounts.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}
```

- [ ] **Step 2: Add owner display and reassignment to account detail**

In `src/app/(dashboard)/accounts/[id]/page.tsx`:

**Add imports** (line 5 area):
```typescript
import { useAccountDetail, useCreateContact, useUpdateAccount } from '@/lib/queries/accounts';
import { useTeamQuery } from '@/lib/queries/settings';
```

**Add hooks** inside `AccountDetailPage()`, after the existing hooks (around line 171):
```typescript
const updateAccount = useUpdateAccount(id);
const { data: teamData } = useTeamQuery();
const teamMembers = (teamData?.data ?? []).filter((u: any) => u.isActive);
```

**Add `useSession`** import from `next-auth/react` and hook:
```typescript
import { useSession } from 'next-auth/react';
// Inside component:
const { data: session } = useSession();
```

**Add owner display** in the header card stat row (line 516-528). Add a new stat item to the array. The component uses `a` (not `account`) as the variable name — `const a: Account = data.data;` (line 246):

```tsx
{ l: 'Owner', v: a.owner?.name ?? 'Unassigned' },
```

**Add reassign dropdown** below the stat row (after the closing `</div>` of the stat row, before the header card's closing `</div>`):

```tsx
{session?.user?.role === 'ADMIN' && (
  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]">
    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Reassign Owner</span>
    <select
      value={a.ownerId}
      onChange={(e) => {
        updateAccount.mutate(
          { ownerId: e.target.value },
          {
            onSuccess: () => addToast({ type: 'success', message: 'Owner reassigned' }),
            onError: (err: Error) => addToast({ type: 'error', message: err.message }),
          },
        );
      }}
      className="px-2 py-1 text-[11px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]"
    >
      {teamMembers.map((u: any) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  </div>
)}
```

Note: `a.ownerId` and `a.owner` need to be available. The GET API already includes `owner: true` (line 19 of accounts route). Verify the Account type in `src/lib/types.ts` includes `ownerId` and `owner` fields — if the adapter strips them, add them to the adapter output.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/accounts/[id]/page.tsx src/lib/queries/accounts.ts
git commit -m "feat(accounts): show owner badge and admin reassignment dropdown on account detail"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run linter**

Run: `npx eslint src/ --max-warnings 0` (or the project's lint command)
Expected: No new warnings

- [ ] **Step 4: Commit any fixes**

If any tests/types/lint issues found, fix and commit:

```bash
git add -A
git commit -m "fix: resolve type/test/lint issues from Epic 5 implementation"
```

- [ ] **Step 5: Update BACKLOG.md**

Mark U-03, U-04, U-05, U-06, U-07, and API-04 as Done in BACKLOG.md.

```bash
git add BACKLOG.md
git commit -m "docs: mark Epic 5 items (U-03 through U-07, API-04) as Done in BACKLOG.md"
```
