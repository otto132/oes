# P1: Tenant Model + Optimistic Updates Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-ready schema (A-09) and complete optimistic update polish across all mutations (UX-06).

**Architecture:** A-09 adds a Tenant model + tenantId on User/Invitation with a `resolveTenantDb()` abstraction that returns the shared Prisma client today but enables per-tenant DB routing later. UX-06 fills 6 missing optimistic mutations, adds mutation keys, creates `usePendingMutations`/`useFailedMutations` hooks, and integrates pending (opacity+pulse) and error (red border+retry) states into all 7 dashboard pages.

**Tech Stack:** Next.js 15, Prisma ORM (PostgreSQL), React Query (TanStack Query v5), NextAuth v5, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-14-p1-tenant-model-optimistic-updates-design.md`

---

## Chunk 1: A-09 Tenant Model

### Task 1: Add Tenant model and tenantId to schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Tenant model after the Role enum (after line 171)**

```prisma
// ═══════════════════════════════════════════════════════════════
// TENANTS
// ═══════════════════════════════════════════════════════════════

model Tenant {
  id                 String   @id @default(cuid())
  name               String
  slug               String   @unique
  plan               String   @default("free")
  settings           Json     @default("{}")
  dbConnectionString String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  users              User[]
  invitations        Invitation[]

  @@map("tenants")
}
```

- [ ] **Step 2: Add tenantId to User model**

In the `User` model (line 177), add these fields after `linkedinConnections`:

```prisma
  tenantId  String
  tenant    Tenant @relation(fields: [tenantId], references: [id])
```

Add index inside User model before `@@map`:

```prisma
  @@index([tenantId])
```

- [ ] **Step 3: Add tenantId to Invitation model**

In the `Invitation` model (line 693), add after `invitedById`:

```prisma
  tenantId  String
  tenant    Tenant @relation(fields: [tenantId], references: [id])
```

Add index inside Invitation model before `@@map`:

```prisma
  @@index([tenantId])
```

- [ ] **Step 4: Generate Prisma client to verify schema compiles**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Create migration**

**Important:** Since `tenantId` is required but existing rows don't have it, we need a 3-step migration approach. First, add the fields as nullable:

Temporarily change `tenantId String` to `tenantId String?` in both User and Invitation models, then run:

Run: `npx prisma migrate dev --name add-tenant-model-nullable`
Expected: Migration created and applied.

- [ ] **Step 6: Create backfill migration**

Create a SQL migration file to backfill existing rows. Run:

```bash
npx prisma migrate dev --name backfill-tenant --create-only
```

Then edit the generated migration SQL to add:

```sql
-- Create default tenant
INSERT INTO "tenants" ("id", "name", "slug", "plan", "settings", "createdAt", "updatedAt")
VALUES ('tenant-default', 'Eco-Insight', 'eco-insight', 'free', '{}', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- Backfill users
UPDATE "users" SET "tenantId" = 'tenant-default' WHERE "tenantId" IS NULL;

-- Backfill invitations
UPDATE "invitations" SET "tenantId" = 'tenant-default' WHERE "tenantId" IS NULL;
```

Run: `npx prisma migrate dev`
Expected: Migration applied.

- [ ] **Step 7: Make tenantId required**

Change `tenantId String?` back to `tenantId String` in both User and Invitation models, then:

Run: `npx prisma migrate dev --name make-tenant-required`
Expected: Migration created and applied.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(A-09): add Tenant model with tenantId on User and Invitation"
```

---

### Task 2: Update seed to create default tenant

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add tenant creation after the clean-slate section (after line 25)**

Add `await prisma.tenant.deleteMany();` at the end of the clean-slate block (after `await prisma.user.deleteMany()` on line 24 and after `await prisma.agentConfig.deleteMany()` on line 25, since Tenant has FK relations from User/Invitation). Then after the clean-slate block, add:

```typescript
  // ── Tenant ──────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-default',
      name: 'Eco-Insight',
      slug: 'eco-insight',
      plan: 'free',
    },
  });
  console.log('  ✓ 1 tenant');
```

- [ ] **Step 2: Add tenantId to all user creates**

Update each `prisma.user.create` call (lines 28-30) to include `tenantId: 'tenant-default'`:

```typescript
  const u1 = await prisma.user.create({ data: { id: 'u1', name: 'Juuso Kari', initials: 'JK', email: 'juuso@eco-insight.com', role: 'ADMIN', color: 'green', tenantId: 'tenant-default' } });
  const u2 = await prisma.user.create({ data: { id: 'u2', name: 'Laura Puranen', initials: 'LP', email: 'laura@eco-insight.com', role: 'ADMIN', color: 'default', tenantId: 'tenant-default' } });
  const u3 = await prisma.user.create({ data: { id: 'u3', name: 'Nick Schoch', initials: 'NS', email: 'nick@eco-insight.com', role: 'MEMBER', color: 'blue', tenantId: 'tenant-default' } });
```

- [ ] **Step 3: Run seed to verify**

Run: `npx prisma db seed`
Expected: Seed completes with `✓ 1 tenant` in output

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(A-09): seed default tenant and assign tenantId to users"
```

---

### Task 3: Update NextAuth types and session callbacks

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add tenantId to NextAuth type declarations**

Replace the full contents of `src/types/next-auth.d.ts`:

```typescript
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      tenantId: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
    role?: string
    tenantId?: string
  }
}
```

- [ ] **Step 2: Add tenantId to jwt callback in auth.ts**

In `src/lib/auth.ts`, update the `jwt` callback (lines 85-93) to fetch and store tenantId:

```typescript
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await db.user.findUnique({ where: { email: user.email } })
        if (dbUser) {
          token.userId = dbUser.id
          token.role = dbUser.role
          token.tenantId = dbUser.tenantId
        }
      }
      return token
    },
```

- [ ] **Step 3: Add tenantId to session callback**

Update the `session` callback (lines 95-99):

```typescript
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId
      if (token.role) session.user.role = token.role
      if (token.tenantId) session.user.tenantId = token.tenantId
      return session
    },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/types/next-auth.d.ts src/lib/auth.ts
git commit -m "feat(A-09): add tenantId to JWT session and NextAuth types"
```

---

### Task 4: Update auth-callbacks to assign tenantId on new user creation

**Files:**
- Modify: `src/lib/auth-callbacks.ts`

- [ ] **Step 1: Update invitation lookup to include tenantId**

The `testSignInCallback` creates new users from invitations (line 35). Update the `db.user.create` call to include `tenantId` from the invitation:

```typescript
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
      tenantId: invitation.tenantId,
      lastLoginAt: new Date(),
    },
  });

  await db.invitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } });
  return true;
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-callbacks.ts
git commit -m "feat(A-09): assign tenantId from invitation when creating new users"
```

---

### Task 5: Create resolveTenantDb utility

**Files:**
- Create: `src/lib/tenant.ts`

- [ ] **Step 1: Create the tenant resolution module**

```typescript
import { db } from '@/lib/db';
import type { PrismaClient } from '@prisma/client';

/**
 * Returns a Prisma client scoped to the user's tenant.
 * Today: returns the shared client (single DB).
 * Future: looks up tenant's dbConnectionString, returns a pooled client for that DB.
 */
export function resolveTenantDb(_session: { user: { tenantId: string } }): PrismaClient {
  // Single-tenant mode: always return the shared client
  // When multi-tenant is needed, this function will:
  // 1. Look up tenant's dbConnectionString from control plane
  // 2. Return a pooled PrismaClient for that connection
  return db;
}

/**
 * Extracts tenantId from session. Throws if missing.
 */
export function requireTenantId(session: { user: { tenantId?: string } }): string {
  if (!session.user.tenantId) {
    throw new Error('Session missing tenantId');
  }
  return session.user.tenantId;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/tenant.ts
git commit -m "feat(A-09): add resolveTenantDb utility for tenant-scoped DB access"
```

---

### Task 6: Update api-handler to expose tenantId

**Files:**
- Modify: `src/lib/api-handler.ts`

- [ ] **Step 1: Add tenantId to HandlerContext**

Update the `HandlerContext` interface (line 6-9) and the handler body to include tenantId:

```typescript
export interface HandlerContext<T> {
  body: T;
  session: { user: { id: string; name?: string; role?: string; tenantId?: string } };
  pagination: { cursor?: string; limit: number };
}
```

Update the session construction inside `withHandler` (lines 33-39):

```typescript
      return await handler(req, {
        body,
        session: {
          user: {
            id: session.user.id,
            name: session.user.name ?? undefined,
            role: (session.user as { role?: string }).role ?? undefined,
            tenantId: (session.user as { tenantId?: string }).tenantId ?? undefined,
          },
        },
        pagination: { cursor, limit },
      });
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-handler.ts
git commit -m "feat(A-09): expose tenantId in HandlerContext for API routes"
```

---

### Task 7: Update invitation API to include tenantId

**Files:**
- Modify: `src/app/api/settings/team/invite/route.ts`

- [ ] **Step 1: Add tenantId to invitation creation**

In the POST handler, when creating the invitation, add `tenantId` from the session user. Find the `db.invitation.create` call and add `tenantId: session.user.tenantId` (or `ctx.session.user.tenantId` if using `withHandler`) to the data object.

The key change is adding this field to the `data` in the invitation create:

```typescript
tenantId: ctx.session.user.tenantId ?? '',
```

If the route doesn't use `withHandler`, get the session via `const session = await auth()` and use `session.user.tenantId`.

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run src/app/api/__tests__/settings-invitations.test.ts`
Expected: Tests pass (may need to update mock to include tenantId)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/team/invite/route.ts
git commit -m "feat(A-09): include tenantId when creating invitations"
```

---

### Task 8: Run full test suite and fix any breakage

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. If any fail due to tenantId being required, update the test mocks to include `tenantId: 'tenant-default'`.

- [ ] **Step 2: Fix any failing tests**

For tests mocking `db.user.findUnique` or `db.user.create`, add `tenantId: 'tenant-default'` to the mock return values.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit any test fixes**

```bash
git add -A
git commit -m "fix(A-09): update test mocks for tenantId"
```

---

### Task 8b: Migrate API routes to use resolveTenantDb

**Files:**
- Modify: All tenant-scoped API route files under `src/app/api/`

**Note:** This is a mechanical change across ~35 route files. For each tenant-scoped route:

- [ ] **Step 1: Update imports**

In each route file, change:
```typescript
import { db } from '@/lib/db';
```
to:
```typescript
import { resolveTenantDb } from '@/lib/tenant';
```

For routes using `withHandler`, the session is already available in `ctx.session`. Add at the top of the handler:
```typescript
const db = resolveTenantDb(ctx.session as any);
```

For routes calling `auth()` directly, add after the session check:
```typescript
const db = resolveTenantDb(session as any);
```

**Exempt routes** (keep using `import { db } from '@/lib/db'`):
- `src/app/api/health/route.ts`
- `src/app/api/sync/route.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/api/auth/callback/route.ts`

- [ ] **Step 2: Update routes that alias `db as prisma`**

The agent routes use `import { db as prisma } from '@/lib/db'`. Change to:
```typescript
import { resolveTenantDb } from '@/lib/tenant';
// then inside handler:
const prisma = resolveTenantDb(session as any);
```

Affected files:
- `src/app/api/agents/[name]/route.ts`
- `src/app/api/agents/[name]/analytics/route.ts`
- `src/app/api/agents/[name]/runs/route.ts`
- `src/app/api/agents/events/route.ts`
- `src/app/api/agents/route.ts`
- `src/app/api/contacts/[id]/linkedin/route.ts`

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: Tests pass (mocks for `@/lib/db` in tests are unaffected since routes now import from `@/lib/tenant`)

Update any failing test mocks to also mock `@/lib/tenant`:
```typescript
vi.mock('@/lib/tenant', () => ({ resolveTenantDb: () => mockDb }));
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat(A-09): migrate API routes to use resolveTenantDb"
```

---

### Task 8c: Add CI check for direct db imports in API routes

- [ ] **Step 1: Add a grep-based check script**

Add to `package.json` scripts:
```json
"lint:tenant": "! grep -r \"from '@/lib/db'\" src/app/api/ --include='*.ts' | grep -v 'health/route' | grep -v 'sync/route' | grep -v 'auth/' | grep -q ."
```

Or create a simple shell script. The check should warn (not block) if any tenant-scoped API route still imports `db` directly.

- [ ] **Step 2: Verify the check passes**

Run: `npm run lint:tenant`
Expected: Exit code 0 (no matches)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(A-09): add CI lint check for direct db imports in API routes"
```

---

## Chunk 2: UX-06 Mutation Keys

### Task 9: Add explicit mutationKey to all existing mutations

**Files:**
- Modify: `src/lib/queries/queue.ts`
- Modify: `src/lib/queries/tasks.ts`
- Modify: `src/lib/queries/leads.ts`
- Modify: `src/lib/queries/inbox.ts`
- Modify: `src/lib/queries/opportunities.ts`
- Modify: `src/lib/queries/settings.ts`
- Modify: `src/lib/queries/accounts.ts`
- Modify: `src/lib/queries/signals.ts`
- Modify: `src/lib/queries/meetings.ts`

- [ ] **Step 1: Add mutationKey to queue.ts mutations**

Read `src/lib/queries/queue.ts` and add `mutationKey` to each `useMutation` call. Add as the first property inside the `useMutation({...})` options object:

```
useApproveQueueItem: mutationKey: ['queue', 'approve'],
useRejectQueueItem:  mutationKey: ['queue', 'reject'],
useDismissQueueItem: mutationKey: ['queue', 'dismiss'],
```

- [ ] **Step 2: Add mutationKey to tasks.ts mutations**

```
useCompleteTask:  mutationKey: ['tasks', 'complete'],
useCommentOnTask: mutationKey: ['tasks', 'comment'],
useUpdateTask:    mutationKey: ['tasks', 'update'],
useCreateTask:    mutationKey: ['tasks', 'create'],
```

- [ ] **Step 3: Add mutationKey to leads.ts mutations**

```
useAdvanceLead:    mutationKey: ['leads', 'advance'],
useDisqualifyLead: mutationKey: ['leads', 'disqualify'],
useConvertLead:    mutationKey: ['leads', 'convert'],
useCreateLead:     mutationKey: ['leads', 'create'],
```

- [ ] **Step 4: Add mutationKey to inbox.ts mutations**

```
useMarkEmailRead:          mutationKey: ['inbox', 'read'],
useArchiveEmail:           mutationKey: ['inbox', 'archive'],
useCreateTaskFromEmail:    mutationKey: ['inbox', 'createTask'],
useCreateAccountFromEmail: mutationKey: ['inbox', 'createAccount'],
```

- [ ] **Step 5: Add mutationKey to opportunities.ts mutations**

```
useCreateOpportunity:  mutationKey: ['opportunities', 'create'],
useMoveStage:          mutationKey: ['opportunities', 'move'],
useCloseWon:           mutationKey: ['opportunities', 'closeWon'],
useUpdateOpportunity:  mutationKey: ['opportunities', 'update'],
useCloseLost:          mutationKey: ['opportunities', 'closeLost'],
```

- [ ] **Step 6: Add mutationKey to settings.ts mutations**

```
usePatchAgent:       mutationKey: ['settings', 'patchAgent'],
useInviteUser:       mutationKey: ['settings', 'invite'],
useRevokeInvitation: mutationKey: ['settings', 'revokeInvite'],
useUpdateTeamMember: mutationKey: ['settings', 'updateUser'],
useUpdateProfile:    mutationKey: ['settings', 'updateProfile'],
useSyncMutation:     mutationKey: ['settings', 'sync'],
```

- [ ] **Step 7: Add mutationKey to accounts.ts mutations**

```
useCreateAccount:  mutationKey: ['accounts', 'create'],
useUpdateAccount:  mutationKey: ['accounts', 'update'],
useCreateContact:  mutationKey: ['accounts', 'createContact'],
useUpdateContact:  mutationKey: ['accounts', 'updateContact'],
useDeleteContact:  mutationKey: ['accounts', 'deleteContact'],
```

- [ ] **Step 8: Add mutationKey to signals.ts and meetings.ts**

Read each file and add appropriate mutation keys:

```
signals: useDismissSignal:  mutationKey: ['signals', 'dismiss'],
         useConvertSignal:  mutationKey: ['signals', 'convert'],
meetings: useCreateMeeting: mutationKey: ['meetings', 'create'],
          useUpdateMeeting: mutationKey: ['meetings', 'update'],
```

- [ ] **Step 9: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add src/lib/queries/
git commit -m "feat(UX-06): add explicit mutationKey to all mutation hooks"
```

---

## Chunk 3: UX-06 Fill Missing Optimistic Updates

### Task 10: Add optimistic updates to useCommentOnTask

**Files:**
- Modify: `src/lib/queries/tasks.ts`

- [ ] **Step 1: Replace useCommentOnTask (lines 45-54)**

```typescript
export function useCommentOnTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['tasks', 'comment'],
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.tasks.comment(id, text),
    onMutate: async ({ id, text }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const queries = qc.getQueriesData({ queryKey: taskKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      // Optimistically append temp comment to task lists that include comments
      const tempComment = { id: `temp-${Date.now()}`, text, createdAt: new Date().toISOString(), author: { name: 'You' } };
      qc.setQueriesData({ queryKey: taskKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((t: any) =>
            t.id === id
              ? { ...t, comments: [...(t.comments ?? []), tempComment] }
              : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/tasks.ts
git commit -m "feat(UX-06): add optimistic update to useCommentOnTask"
```

---

### Task 11: Add optimistic updates to useUpdateTask

**Files:**
- Modify: `src/lib/queries/tasks.ts`

- [ ] **Step 1: Replace useUpdateTask (lines 56-65)**

```typescript
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['tasks', 'update'],
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.tasks.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const queries = qc.getQueriesData({ queryKey: taskKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      qc.setQueriesData({ queryKey: taskKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((t: any) => t.id === id ? { ...t, ...data } : t) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/tasks.ts
git commit -m "feat(UX-06): add optimistic update to useUpdateTask"
```

---

### Task 12: Add optimistic updates to useCreateLead

**Files:**
- Modify: `src/lib/queries/leads.ts`

- [ ] **Step 1: Replace useCreateLead (lines 101-110)**

```typescript
export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['leads', 'create'],
    mutationFn: (data: { company: string; type?: string; country?: string; pain?: string }) =>
      api.leads.create(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const queries = qc.getQueriesData({ queryKey: leadKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const tempLead = {
        id: `temp-${Date.now()}`,
        company: data.company,
        type: data.type || 'Unknown',
        country: data.country || '',
        stage: 'New',
        pain: data.pain || '',
      };
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: [tempLead, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries/leads.ts
git commit -m "feat(UX-06): add optimistic update to useCreateLead"
```

---

### Task 13: Add optimistic updates to useCreateAccountFromEmail

**Files:**
- Modify: `src/lib/queries/inbox.ts`

- [ ] **Step 1: Replace useCreateAccountFromEmail (lines 80-89)**

```typescript
export function useCreateAccountFromEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['inbox', 'createAccount'],
    mutationFn: (id: string) => api.inbox.createAccount(id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: inboxKeys.all });
      await qc.cancelQueries({ queryKey: accountKeys.all });
      const inboxQueries = qc.getQueriesData({ queryKey: inboxKeys.all });
      const accountQueries = qc.getQueriesData({ queryKey: accountKeys.all });
      const previousInbox = inboxQueries.map(([key, data]) => [key, data] as const);
      const previousAccounts = accountQueries.map(([key, data]) => [key, data] as const);
      return { previousInbox, previousAccounts };
    },
    onError: (_err, _vars, context) => {
      context?.previousInbox.forEach(([key, data]) => qc.setQueryData(key, data));
      context?.previousAccounts.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries/inbox.ts
git commit -m "feat(UX-06): add optimistic update to useCreateAccountFromEmail"
```

---

### Task 14: Move useUpdateOpportunity from onSuccess to onMutate

**Files:**
- Modify: `src/lib/queries/opportunities.ts`

- [ ] **Step 1: Replace useUpdateOpportunity (lines 140-150)**

```typescript
export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opportunities', 'update'],
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.opportunities.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      await qc.cancelQueries({ queryKey: oppKeys.detail(id) });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const previousDetail = qc.getQueryData(oppKeys.detail(id));
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((opp: any) =>
            opp.id === id ? { ...opp, ...data } : opp
          ),
        };
      });
      qc.setQueryData(oppKeys.detail(id), (old: any) => {
        if (!old) return old;
        return { ...old, ...data };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(oppKeys.detail(context.id), context.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: oppKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries/opportunities.ts
git commit -m "feat(UX-06): move useUpdateOpportunity to optimistic onMutate pattern"
```

---

### Task 15: Add optimistic updates to settings mutations

**Files:**
- Modify: `src/lib/queries/settings.ts`

- [ ] **Step 1: Add optimistic update to useUpdateTeamMember (lines 102-111)**

```typescript
export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['settings', 'updateUser'],
    mutationFn: ({ id, data }: { id: string; data: { role?: string; isActive?: boolean } }) =>
      api.settings.updateUser(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: settingsKeys.team() });
      const previousTeam = qc.getQueryData(settingsKeys.team());
      qc.setQueryData(settingsKeys.team(), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((u: any) =>
            u.id === id ? { ...u, ...data } : u,
          ),
        };
      });
      return { previousTeam };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousTeam) qc.setQueryData(settingsKeys.team(), context.previousTeam);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.team() });
    },
  });
}
```

- [ ] **Step 2: Add optimistic update to useRevokeInvitation (lines 91-99)**

```typescript
export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['settings', 'revokeInvite'],
    mutationFn: (id: string) => api.settings.revokeInvite(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: settingsKeys.invitations() });
      const previousInvitations = qc.getQueryData(settingsKeys.invitations());
      qc.setQueryData(settingsKeys.invitations(), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((inv: any) => inv.id !== id),
        };
      });
      return { previousInvitations };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousInvitations) qc.setQueryData(settingsKeys.invitations(), context.previousInvitations);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.invitations() });
    },
  });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/settings.ts
git commit -m "feat(UX-06): add optimistic updates to settings mutations"
```

---

### Task 16: Add onSuccess temp ID replacement to create mutations

**Files:**
- Modify: `src/lib/queries/tasks.ts`
- Modify: `src/lib/queries/leads.ts`
- Modify: `src/lib/queries/accounts.ts`
- Modify: `src/lib/queries/inbox.ts`

- [ ] **Step 1: Add onSuccess to useCreateTask**

In `useCreateTask`, add an `onSuccess` handler between `onError` and `onSettled`:

```typescript
    onSuccess: (response: any) => {
      qc.setQueriesData({ queryKey: taskKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((t: any) =>
            t.id.startsWith('temp-') ? { ...t, ...response.data } : t
          ),
        };
      });
    },
```

- [ ] **Step 2: Add onSuccess to useCreateLead**

In `useCreateLead`, add between `onError` and `onSettled`:

```typescript
    onSuccess: (response: any) => {
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((l: any) =>
            l.id.startsWith('temp-') ? { ...l, ...response.data } : l
          ),
        };
      });
    },
```

- [ ] **Step 3: Add onSuccess to useCreateContact**

In `useCreateContact` (accounts.ts), add between `onError` and `onSettled`:

```typescript
    onSuccess: (response: any) => {
      qc.setQueryData(accountKeys.detail(accountId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          contacts: (old.contacts ?? []).map((c: any) =>
            c.id.startsWith('temp-') ? { ...c, ...response.data } : c
          ),
        };
      });
    },
```

- [ ] **Step 4: Add onSuccess to useCreateAccountFromEmail (inbox.ts)**

In `useCreateAccountFromEmail`, the account is created server-side from email data. Since we don't insert a temp account in `onMutate` (we only snapshot), the `onSettled` invalidation is sufficient here. No temp ID replacement needed for this specific mutation — it just invalidates both inbox and account caches.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/tasks.ts src/lib/queries/leads.ts src/lib/queries/accounts.ts
git commit -m "feat(UX-06): add onSuccess temp ID replacement to create mutations"
```

---

## Chunk 4: UX-06 Pending & Error State Hooks + Page Integration

### Task 17: Create usePendingMutations and useFailedMutations hooks

**Files:**
- Create: `src/hooks/use-mutation-state.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutationState } from '@tanstack/react-query';

/**
 * Returns a Set of entity IDs that have in-flight mutations matching the given key prefix.
 * Usage: const pendingIds = usePendingMutations(['queue'])
 */
export function usePendingMutations(mutationKeyPrefix: string[]): Set<string> {
  const pendingMutations = useMutationState({
    filters: { mutationKey: mutationKeyPrefix, status: 'pending' },
    select: (mutation) => {
      const vars = mutation.state.variables as any;
      return vars?.id ?? vars;
    },
  });

  // Memoize the Set — only rebuild when the list of pending IDs actually changes
  const key = pendingMutations.filter((id): id is string => typeof id === 'string').sort().join(',');
  return useMemo(() => new Set(key ? key.split(',') : []), [key]);
}

/**
 * Returns a Map of entity IDs to their error info and original variables.
 * Failed state auto-clears after 30 seconds.
 * Usage: const failedMap = useFailedMutations(['queue'])
 */
export function useFailedMutations(mutationKeyPrefix: string[]): Map<string, {
  error: string;
  variables: unknown;
}> {
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const failedMutations = useMutationState({
    filters: { mutationKey: mutationKeyPrefix, status: 'error' },
    select: (mutation) => {
      const vars = mutation.state.variables as any;
      const id = vars?.id ?? (typeof vars === 'string' ? vars : undefined);
      const error = mutation.state.error instanceof Error
        ? mutation.state.error.message
        : 'Something went wrong';
      return { id, error, variables: vars };
    },
  });

  const result = new Map<string, { error: string; variables: unknown }>();

  for (const entry of failedMutations) {
    if (!entry.id || typeof entry.id !== 'string') continue;
    if (cleared.has(entry.id)) continue;

    result.set(entry.id, { error: entry.error, variables: entry.variables });

    // Set auto-clear timer if not already set
    if (!timersRef.current.has(entry.id)) {
      const id = entry.id;
      timersRef.current.set(
        id,
        setTimeout(() => {
          setCleared((prev) => new Set(prev).add(id));
          timersRef.current.delete(id);
        }, 30_000),
      );
    }
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return result;
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-mutation-state.ts
git commit -m "feat(UX-06): create usePendingMutations and useFailedMutations hooks"
```

---

### Task 18: Integrate pending/error states into Queue page

**Files:**
- Modify: `src/app/(dashboard)/queue/page.tsx`

- [ ] **Step 1: Add imports**

Add at the top of the file:

```typescript
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
```

- [ ] **Step 2: Add hooks inside the component**

Inside the `QueuePage` component, after the existing mutation hooks, add:

```typescript
  const pendingIds = usePendingMutations(['queue']);
  const failedMap = useFailedMutations(['queue']);
```

- [ ] **Step 3: Apply pending/error classes to queue items**

Find where queue items are rendered (each item card). Add conditional classes to the item container element:

```typescript
className={`... ${pendingIds.has(item.id) ? 'opacity-60 animate-pulse' : ''} ${failedMap.has(item.id) ? 'border-l-2 border-red-500' : ''}`}
```

- [ ] **Step 4: Add retry button for failed items**

Inside each queue item card, add after the action buttons:

```typescript
{failedMap.has(item.id) && (() => {
  const failed = failedMap.get(item.id)!;
  // Determine which mutation to retry based on the variables shape
  // The component has approve, reject, dismiss mutation hooks available
  return (
    <button
      className="ml-2 p-1 text-red-500 hover:text-red-400 text-xs"
      title={failed.error}
      onClick={() => approve.mutate(failed.variables as any)}
    >
      ↻ Retry
    </button>
  );
})()}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/queue/page.tsx
git commit -m "feat(UX-06): integrate pending/error states into Queue page"
```

---

### Task 19: Integrate pending/error states into Tasks page

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Add imports and hooks**

```typescript
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
```

Inside the component:

```typescript
  const pendingIds = usePendingMutations(['tasks']);
  const failedMap = useFailedMutations(['tasks']);
```

- [ ] **Step 2: Apply classes to task rows**

On each task row container, add:

```typescript
className={`... ${pendingIds.has(task.id) ? 'opacity-60 animate-pulse' : ''} ${failedMap.has(task.id) ? 'border-l-2 border-red-500' : ''}`}
```

- [ ] **Step 3: Add retry button for failed items**

```typescript
{failedMap.has(task.id) && (
  <button
    className="ml-2 p-1 text-red-500 hover:text-red-400 text-xs"
    title={failedMap.get(task.id)!.error}
    onClick={() => completeTask.mutate(failedMap.get(task.id)!.variables as any)}
  >
    ↻ Retry
  </button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(UX-06): integrate pending/error states into Tasks page"
```

---

### Task 20: Integrate pending/error states into Pipeline page

**Files:**
- Modify: `src/app/(dashboard)/pipeline/page.tsx`

- [ ] **Step 1: Add imports and hooks**

```typescript
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
```

```typescript
  const pendingIds = usePendingMutations(['opportunities']);
  const failedMap = useFailedMutations(['opportunities']);
```

- [ ] **Step 2: Apply classes to opportunity cards in kanban view**

On each opportunity card container:

```typescript
className={`... ${pendingIds.has(opp.id) ? 'opacity-60 animate-pulse' : ''} ${failedMap.has(opp.id) ? 'border-l-2 border-red-500' : ''}`}
```

- [ ] **Step 3: Add retry for failed stage moves**

```typescript
{failedMap.has(opp.id) && (
  <button
    className="ml-1 text-red-500 hover:text-red-400 text-xs"
    title={failedMap.get(opp.id)!.error}
    onClick={() => moveStage.mutate(failedMap.get(opp.id)!.variables as any)}
  >
    ↻
  </button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/pipeline/page.tsx
git commit -m "feat(UX-06): integrate pending/error states into Pipeline page"
```

---

### Task 21: Integrate pending/error states into Leads page

**Files:**
- Modify: `src/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Add imports and hooks**

```typescript
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
```

```typescript
  const pendingIds = usePendingMutations(['leads']);
  const failedMap = useFailedMutations(['leads']);
```

- [ ] **Step 2: Apply classes to lead cards**

```typescript
className={`... ${pendingIds.has(lead.id) ? 'opacity-60 animate-pulse' : ''} ${failedMap.has(lead.id) ? 'border-l-2 border-red-500' : ''}`}
```

- [ ] **Step 3: Add retry button**

```typescript
{failedMap.has(lead.id) && (
  <button
    className="text-red-500 hover:text-red-400 text-xs"
    title={failedMap.get(lead.id)!.error}
    onClick={() => advanceLead.mutate(failedMap.get(lead.id)!.variables as any)}
  >
    ↻ Retry
  </button>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/leads/page.tsx
git commit -m "feat(UX-06): integrate pending/error states into Leads page"
```

---

### Task 22: Integrate pending/error states into Signals page

**Files:**
- Modify: `src/app/(dashboard)/signals/page.tsx`

- [ ] **Step 1: Add imports and hooks**

```typescript
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
```

```typescript
  const pendingIds = usePendingMutations(['signals']);
  const failedMap = useFailedMutations(['signals']);
```

- [ ] **Step 2: Apply classes to signal cards**

```typescript
className={`... ${pendingIds.has(signal.id) ? 'opacity-60 animate-pulse' : ''} ${failedMap.has(signal.id) ? 'border-l-2 border-red-500' : ''}`}
```

- [ ] **Step 3: Add retry button**

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/signals/page.tsx
git commit -m "feat(UX-06): integrate pending/error states into Signals page"
```

---

### Task 23: Integrate pending/error states into Inbox page

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Add imports and hooks**

```typescript
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
```

```typescript
  const pendingIds = usePendingMutations(['inbox']);
  const failedMap = useFailedMutations(['inbox']);
```

- [ ] **Step 2: Apply classes to email rows**

```typescript
className={`... ${pendingIds.has(email.id) ? 'opacity-60 animate-pulse' : ''} ${failedMap.has(email.id) ? 'border-l-2 border-red-500' : ''}`}
```

- [ ] **Step 3: Add retry button**

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/inbox/page.tsx
git commit -m "feat(UX-06): integrate pending/error states into Inbox page"
```

---

### Task 24: Integrate pending/error states into Accounts page

**Files:**
- Modify: `src/app/(dashboard)/accounts/page.tsx`

- [ ] **Step 1: Add imports and hooks**

```typescript
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
```

```typescript
  const pendingIds = usePendingMutations(['accounts']);
  const failedMap = useFailedMutations(['accounts']);
```

- [ ] **Step 2: Apply classes to account rows/cards**

```typescript
className={`... ${pendingIds.has(account.id) ? 'opacity-60 animate-pulse' : ''} ${failedMap.has(account.id) ? 'border-l-2 border-red-500' : ''}`}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/accounts/page.tsx
git commit -m "feat(UX-06): integrate pending/error states into Accounts page"
```

---

### Task 25: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run dev server and smoke test**

Run: `npm run dev`
Verify: Pages load without console errors. Navigate through Queue, Tasks, Pipeline, Leads, Signals, Inbox, Accounts.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address any build/test issues from P1 implementation"
```
