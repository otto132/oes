# P1 Design: Tenant Model (A-09) + Optimistic Updates Polish (UX-06)

> Date: 2026-03-14
> Status: Approved
> Scope: Two P1 backlog items — tenant/workspace architecture decision and mutation UX polish
> Note: AG-01 (Agent pause/resume) was found to be already implemented during research.

---

## A-09: Tenant/Workspace Model

### Decision

Eco-Insight will evolve from single-tenant (internal team) to multi-tenant (separate database per company). External launch is 6+ months away. We build the abstraction boundary now without doing throwaway work.

### Architecture: Control Plane vs Data Plane

**Control plane DB** (shared, the current database):
- `Tenant` model: id, name, slug (unique), plan, settings (JSON), dbConnectionString, createdAt, updatedAt
- `User.tenantId` foreign key — associates each user with their tenant
- Invitation gets `tenantId` — new users join a specific tenant

**Data plane DB** (per tenant):
- The existing business schema (Account, Lead, Opportunity, Contact, Task, Goal, Activity, Signal, QueueItem, Email, Meeting, AgentConfig) — unchanged
- No `tenantId` column needed on business models. Isolation is at the database connection level.
- Current database serves as tenant #1's data plane AND the control plane

### Schema Changes

#### New Model: Tenant

```prisma
model Tenant {
  id                String   @id @default(cuid())
  name              String
  slug              String   @unique
  plan              String   @default("free")
  settings          Json     @default("{}")  // Shape: { features: {}, limits: {} } — schema TBD
  dbConnectionString String?  // Encrypt before storage; use secrets manager in production
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  users             User[]
  invitations       Invitation[]

  @@map("tenants")
}
```

#### Modified: User

Add `tenantId String` + `tenant Tenant @relation(fields: [tenantId], references: [id])` + `@@index([tenantId])`.

#### Modified: Invitation

Add `tenantId String` + `tenant Tenant @relation(fields: [tenantId], references: [id])` + `@@index([tenantId])`.

### Session Changes

- In `src/lib/auth.ts`, `jwt` callback: add `token.tenantId = dbUser.tenantId` after fetching the DB user
- In `src/lib/auth.ts`, `session` callback: add `session.user.tenantId = token.tenantId as string`
- Update `src/types/next-auth.d.ts` to include `tenantId: string` on `Session.user` and JWT token
- Sign-in callback resolves tenant from user record (existing users) or invitation (new users)

### Tenant Resolution

New utility: `src/lib/tenant.ts`

```typescript
// Returns a Prisma client scoped to the user's tenant
// Today: returns the shared client (single DB)
// Future: looks up tenant's dbConnectionString, returns a pooled client for that DB
export function resolveTenantDb(session: Session): PrismaClient

// Extracts tenantId from session, throws if missing
export function requireTenantId(session: Session): string
```

All tenant-scoped API routes replace `import { db } from '@/lib/db'` with `const db = resolveTenantDb(session)`. Each such route must call `const session = await auth()` and handle the unauthenticated case before calling `resolveTenantDb()`.

**Exempt routes** (continue using shared `db` directly):
- `/api/health` — no auth required
- `/api/sync` — cron-triggered, uses system context
- `/api/auth/[...nextauth]` — auth infrastructure
- Any future webhook receivers

### Migration Strategy

1. Create `Tenant` table
2. Seed default tenant (internal team)
3. Add nullable `tenantId` to `User` and `Invitation`
4. Backfill existing users and invitations with default tenant ID
5. Make `tenantId` required
6. Add `resolveTenantDb()` utility (returns shared client for now)
7. Update all tenant-scoped API routes under `src/app/api/` to use `resolveTenantDb(session)` instead of raw `db` (exempt routes listed above keep using `db`)
8. Ensure each converted route calls `await auth()` and handles unauthenticated case
9. Update sign-in callback to set tenantId in session
10. Add ESLint rule or grep-based CI check to flag direct `db` imports in API routes (warning, not blocking)

### What We Defer (External Launch)

- Database provisioning per tenant (create DB, run migrations)
- Connection pooling / routing in `resolveTenantDb()`
- Tenant signup and onboarding UI
- Tenant switching UI (if users can belong to multiple tenants)
- Cross-tenant admin tooling
- Billing integration with plan field

### Risks

- **Missed route**: If an API route still imports `db` directly, it bypasses tenant scoping. Mitigation: lint rule or code review checklist.
- **Migration complexity**: Backfilling tenantId on existing data requires careful ordering. Mitigation: single migration script, tested against dev DB first.

---

## UX-06: Optimistic Updates Polish

### Goal

Complete the optimistic update coverage across all mutations, add visible pending state and inline error recovery.

### Current State

~15 mutations already have optimistic `onMutate`/`onError`/`onSettled` patterns. 6 mutations are missing them. No pending state indicator. No error recovery UI beyond silent cache rollback.

### 1. Fill Missing Optimistic Updates

Add the standard 3-phase pattern (`onMutate` → `onError` → `onSettled`) to:

| Mutation | File | Cache Update Strategy |
|----------|------|----------------------|
| `useCommentOnTask()` | `src/lib/queries/tasks.ts` | Append temp comment (temp ID) to task detail cache |
| `useUpdateTask()` | `src/lib/queries/tasks.ts` | Merge updated fields into both list caches (incomplete + completed) and detail cache |
| `useCreateLead()` | `src/lib/queries/leads.ts` | Insert temp lead into list cache |
| `useCreateAccountFromEmail()` | `src/lib/queries/inbox.ts` | Insert temp account into accounts list cache |
| `useUpdateOpportunity()` | `src/lib/queries/opportunities.ts` | Move from `onSuccess` to `onMutate` for immediate update of list + detail cache |
| Settings mutations | `src/lib/queries/settings.ts` | Update agent config / team member cache optimistically |

Each follows the existing pattern:
1. `await qc.cancelQueries()` — prevent race conditions
2. Snapshot previous data for rollback
3. `qc.setQueriesData()` — apply optimistic update
4. Return `{ previous }` context
5. `onError`: restore previous data
6. `onSettled`: invalidate to sync with server

### 2. Mutation Key Convention

Every `useMutation` must set an explicit `mutationKey` for the pending/error tracking hooks to work. Convention:

| Domain | Key Pattern | Example |
|--------|-------------|---------|
| Queue | `['queue', action]` | `['queue', 'approve']`, `['queue', 'reject']` |
| Tasks | `['tasks', action]` | `['tasks', 'complete']`, `['tasks', 'create']`, `['tasks', 'update']`, `['tasks', 'comment']` |
| Leads | `['leads', action]` | `['leads', 'create']`, `['leads', 'advance']` |
| Opportunities | `['opportunities', action]` | `['opportunities', 'move']`, `['opportunities', 'update']` |
| Signals | `['signals', action]` | `['signals', 'dismiss']` |
| Inbox | `['inbox', action]` | `['inbox', 'read']`, `['inbox', 'archive']` |
| Accounts | `['accounts', action]` | `['accounts', 'update']`, `['accounts', 'createContact']` |
| Settings | `['settings', action]` | `['settings', 'patchAgent']`, `['settings', 'updateUser']` |

Page components use the domain prefix (e.g., `['queue']`) with `usePendingMutations` to match all mutations in that domain.

### 3. Pending State: Opacity + Pulse

#### Tracking Hook

New file: `src/hooks/use-mutation-state.ts`

```typescript
// Returns a Set of entity IDs that have in-flight mutations
export function usePendingMutations(mutationKey: string[]): Set<string>
```

Uses React Query's `useMutationState()` to find mutations matching the key with status `'pending'`. Extracts entity IDs from mutation variables.

#### Component Integration

Each list/card component checks: `if (pendingIds.has(item.id))` → apply `opacity-60 animate-pulse transition-opacity` classes.

Affected components (7 pages):
- Queue page — queue cards
- Tasks page — task rows
- Pipeline page — opportunity cards
- Leads page — lead cards
- Signals page — signal cards
- Inbox page — email rows
- Accounts page — account cards (for update mutations)

### 4. Inline Error State with Retry

#### Tracking Hook

```typescript
// Returns a Map of entity IDs to their error info and original variables
export function useFailedMutations(mutationKey: string[]): Map<string, {
  error: string
  variables: unknown  // Original mutation variables, for retry
}>
```

Uses `useMutationState()` to find mutations with status `'error'`. Extracts entity ID and variables from the mutation state.

#### Retry Mechanism

The hook does NOT hold a reference to the `mutate` function — that belongs to the component. Instead, the component already has the mutation hook (e.g., `const approve = useApproveQueueItem()`). When rendering a failed item, the component calls `approve.mutate(failedInfo.variables)` to retry. The hook provides the variables; the component provides the mutation function.

#### Component Integration

Items with failed mutations render:
- Red left border (`border-l-2 border-red-500`)
- Small retry icon button (circular arrow) in the top-right corner
- Tooltip or small text showing error message

Failed state auto-clears after 30 seconds via `setTimeout` in a `useEffect` with proper cleanup on unmount to prevent memory leaks.

#### Error Flow

1. User clicks "Approve" on queue item
2. `onMutate`: item removed from list optimistically, pending set updated
3. Network request fails
4. `onError`: item restored in list, failed mutations map updated
5. Item appears with red border + retry button
6. User clicks retry → mutation re-invoked → if success, normal flow; if fail, error state persists

### 5. Temp ID Replacement

These mutations may already have optimistic `onMutate`/`onError`/`onSettled` patterns. The work here is specifically adding an `onSuccess` handler to replace temp IDs with server-returned IDs, not adding the full 3-phase pattern.

For create mutations (`useCreateTask`, `useCreateLead`, `useCreateContact`, `useCreateAccountFromEmail`):

**Current behavior:**
- `onMutate`: insert with `temp-${Date.now()}` ID
- `onSettled`: `invalidateQueries()` causes full refetch, replacing temp item

**New behavior:**
- `onMutate`: insert with `temp-${Date.now()}` ID (unchanged)
- Add `onSuccess(serverResponse)`: find temp item in cache by temp ID, replace with server response data (real ID, server timestamps, computed fields)
- `onSettled`: still invalidate, but the UI won't flash because cache already has correct data

### 6. Files Changed

**New files:**
- `src/hooks/use-mutation-state.ts` — `usePendingMutations()` and `useFailedMutations()` hooks

**Modified query files (6):**
- `src/lib/queries/tasks.ts` — add optimistic to `useCommentOnTask`, `useUpdateTask`
- `src/lib/queries/leads.ts` — add optimistic to `useCreateLead`
- `src/lib/queries/inbox.ts` — add optimistic to `useCreateAccountFromEmail`
- `src/lib/queries/opportunities.ts` — move `useUpdateOpportunity` from `onSuccess` to `onMutate`
- `src/lib/queries/settings.ts` — add optimistic to agent/team mutations

**Modified query files for temp ID replacement (4):**
- `src/lib/queries/tasks.ts` — `useCreateTask` add `onSuccess`
- `src/lib/queries/leads.ts` — `useCreateLead` add `onSuccess`
- `src/lib/queries/accounts.ts` — `useCreateContact` add `onSuccess` (note: must target account-specific query key `accountKeys.contacts(accountId)`, not a global contacts list)
- `src/lib/queries/inbox.ts` — `useCreateAccountFromEmail` add `onSuccess`

**Modified page files (7):**
- `src/app/(dashboard)/queue/page.tsx`
- `src/app/(dashboard)/tasks/page.tsx`
- `src/app/(dashboard)/pipeline/page.tsx`
- `src/app/(dashboard)/leads/page.tsx`
- `src/app/(dashboard)/signals/page.tsx`
- `src/app/(dashboard)/inbox/page.tsx`
- `src/app/(dashboard)/accounts/page.tsx`

### Not In Scope

- Undo pattern (Gmail-style action reversal)
- Retry with exponential backoff (single manual retry is sufficient)
- Offline queue / persistence
- Optimistic updates for search or filter operations
