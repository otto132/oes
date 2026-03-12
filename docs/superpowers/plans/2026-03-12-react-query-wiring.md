# React Query Frontend-Backend Wiring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Queue page to live API data via React Query, establishing the reference pattern for all other pages.

**Architecture:** TanStack React Query wraps the existing `api-client.ts` fetch layer. API routes apply adapters to return UI-typed JSON. Zustand store sheds queue-specific domain data; other domain data stays until remaining pages are wired.

**Tech Stack:** Next.js 15, React 19, TanStack React Query 5, Prisma, Zustand

**Spec:** `docs/superpowers/specs/2026-03-12-react-query-wiring-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **New** | `src/lib/query-provider.tsx` | QueryClientProvider wrapper for app layout |
| **New** | `src/lib/queries/queue.ts` | React Query hooks for queue data + mutations |
| **Modified** | `package.json` | Add @tanstack/react-query dependencies |
| **Modified** | `src/app/layout.tsx` | Wrap children with QueryProvider |
| **Modified** | `src/app/api/queue/route.ts` | Add adapter transforms + typeCounts to responses |
| **Modified** | `src/lib/api-client.ts` | Type queue methods |
| **Modified** | `src/lib/store.ts` | Remove queue array + queue mutation functions |
| **Modified** | `src/app/globals.css` | (shimmer already exists - no change needed) |
| **Modified** | `src/app/queue/page.tsx` | Swap store reads for query hooks, add loading/error |
| **Deleted** | `src/hooks/useFetch.ts` | Unused custom hook replaced by React Query |

---

## Chunk 1: Infrastructure (React Query setup)

### Task 1: Install React Query

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && npm install @tanstack/react-query @tanstack/react-query-devtools
```

Expected: `added N packages` in output, no errors.

- [ ] **Step 2: Verify installation**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && node -e "require('@tanstack/react-query')" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @tanstack/react-query and devtools"
```

---

### Task 2: Create QueryProvider

**Files:**
- Create: `src/lib/query-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create query-provider.tsx**

Create `src/lib/query-provider.tsx`:

```tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  }));

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Wrap layout with QueryProvider**

In `src/app/layout.tsx`, add import and wrap `{children}`:

```tsx
import { QueryProvider } from '@/lib/query-provider';
```

Change the `<body>` contents to:

```tsx
<body className="font-sans">
  <QueryProvider>
    <ThemeInit />
    <Sidebar />
    <TopBar />
    <main className="md:ml-[240px] pt-14 min-h-screen pb-20 md:pb-0">
      <div className="px-4 py-5 md:px-8 md:py-7 max-w-[1340px]">
        {children}
      </div>
    </main>
    <BottomNav />
    <Drawer />
  </QueryProvider>
</body>
```

- [ ] **Step 3: Verify app still compiles**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && npx next build 2>&1 | tail -5
```

Expected: Build succeeds (or `next dev` starts without errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-provider.tsx src/app/layout.tsx
git commit -m "feat: add React Query provider to app layout"
```

---

### Task 3: Delete useFetch.ts (E2-12)

**Files:**
- Delete: `src/hooks/useFetch.ts`

- [ ] **Step 1: Verify no imports of useFetch**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && grep -r "useFetch" src/ --include="*.ts" --include="*.tsx" | grep -v "hooks/useFetch.ts" || echo "No imports found"
```

Expected: `No imports found`

- [ ] **Step 2: Delete the file**

```bash
rm src/hooks/useFetch.ts
```

- [ ] **Step 3: Remove hooks dir if empty**

```bash
rmdir src/hooks 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add -A src/hooks
git commit -m "chore: delete unused useFetch.ts hook (E2-12)

React Query replaces this entirely."
```

---

## Chunk 2: API Route + Adapter Wiring

### Task 4: Update Queue API route GET handler

**Files:**
- Modify: `src/app/api/queue/route.ts`

The GET handler currently returns raw Prisma objects. We need to:
1. Import and apply `adaptQueueItem` to all returned items
2. Add per-type counts via `groupBy` to the `meta` response

- [ ] **Step 1: Add adapter import**

At the top of `src/app/api/queue/route.ts`, add:

```ts
import { adaptQueueItem } from '@/lib/adapters';
```

- [ ] **Step 2: Update GET handler to adapt items and add typeCounts**

Replace the entire `GET` function body with:

```ts
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'pending';
  const type = req.nextUrl.searchParams.get('type');

  const where: any = status === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } };
  if (type && type !== 'all') where.type = type;

  const items = await db.queueItem.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  const pendingCount = await db.queueItem.count({ where: { status: 'pending' } });
  const completedCount = await db.queueItem.count({ where: { status: { not: 'pending' } } });

  // Per-type counts for the current tab (pending or completed)
  const statusWhere = status === 'pending' ? { status: 'pending' as const } : { status: { not: 'pending' as const } };
  const typeGroups = await db.queueItem.groupBy({
    by: ['type'],
    where: statusWhere,
    _count: true,
  });
  const typeCounts: Record<string, number> = {};
  for (const g of typeGroups) {
    typeCounts[g.type] = g._count;
  }

  return NextResponse.json({
    data: items.map(adaptQueueItem),
    meta: { pendingCount, completedCount, typeCounts },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/queue/route.ts
git commit -m "feat: apply adaptQueueItem + add typeCounts to queue GET response"
```

---

### Task 5: Update Queue API route POST handler

**Files:**
- Modify: `src/app/api/queue/route.ts`

The POST handler returns raw Prisma records after approve/reject. We need to adapt these and resolve the reviewer's display name.

**Important:** The `reviewedById` field is a plain string in the schema (no User relation). We must do a separate lookup to get the reviewer's name.

- [ ] **Step 1: Update approve branch to adapt response + resolve reviewer name**

In the `POST` function, find the line `return NextResponse.json({ data: updated });` inside the `if (action === 'approve')` block (line 110 in the current file). Replace ONLY that return statement with:

```ts
    const adapted = adaptQueueItem(updated);
    // Resolve reviewer display name (reviewedById is a plain string, no relation)
    if (updated.reviewedById) {
      const reviewer = await db.user.findUnique({ where: { id: updated.reviewedById }, select: { name: true } });
      if (reviewer) adapted.reviewedBy = reviewer.name;
    }
    return NextResponse.json({ data: adapted });
```

Do NOT modify or duplicate the activity creation code above this line — it stays as-is.

- [ ] **Step 2: Update reject branch to adapt response + resolve reviewer name**

Replace the reject return:

```ts
  if (action === 'reject') {
    const updated = await db.queueItem.update({
      where: { id },
      data: { status: 'rejected', reviewedById: userId, reviewedAt: new Date(), rejReason: reason },
    });
    const adapted = adaptQueueItem(updated);
    if (updated.reviewedById) {
      const reviewer = await db.user.findUnique({ where: { id: updated.reviewedById }, select: { name: true } });
      if (reviewer) adapted.reviewedBy = reviewer.name;
    }
    return NextResponse.json({ data: adapted });
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/queue/route.ts
git commit -m "feat: adapt POST responses + resolve reviewer name in queue route"
```

---

## Chunk 3: API Client Types + Query Hooks

### Task 6: Type queue methods in api-client.ts (E2-11 partial)

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add QueueResponse and QueueMutationResponse types**

At the top of `src/lib/api-client.ts`, after the `const BASE = '/api';` line, add:

```ts
import type { QueueItem } from './types';

interface QueueResponse {
  data: QueueItem[];
  meta: { pendingCount: number; completedCount: number; typeCounts: Record<string, number> };
}

interface QueueMutationResponse {
  data: QueueItem;
}
```

- [ ] **Step 2: Type the queue methods**

Replace the queue section of the `api` object:

```ts
  // ── Queue ──────────────────────────────────────
  queue: {
    list: (status = 'pending', type?: string): Promise<QueueResponse> =>
      get<QueueResponse>(`/queue?status=${status}${type && type !== 'all' ? `&type=${type}` : ''}`),
    approve: (id: string, editedPayload?: Record<string, unknown>): Promise<QueueMutationResponse> =>
      post<QueueMutationResponse>('/queue', { action: 'approve', id, editedPayload }),
    reject: (id: string, reason: string): Promise<QueueMutationResponse> =>
      post<QueueMutationResponse>('/queue', { action: 'reject', id, reason }),
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: type queue methods in api-client (E2-11)"
```

---

### Task 7: Create queue query hooks

**Files:**
- Create: `src/lib/queries/queue.ts`

- [ ] **Step 1: Create queries directory and queue.ts**

Create `src/lib/queries/queue.ts`:

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

// Re-export the response type from api-client for consumers
type QueueResponse = Awaited<ReturnType<typeof api.queue.list>>;

export const queueKeys = {
  all: ['queue'] as const,
  list: (status: string, type?: string) => ['queue', status, type] as const,
};

export function useQueueQuery(status: 'pending' | 'completed', type?: string) {
  return useQuery<QueueResponse>({
    queryKey: queueKeys.list(status, type),
    queryFn: () => api.queue.list(status, type),
    placeholderData: keepPreviousData,
  });
}

export function useApproveQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, editedPayload }: { id: string; editedPayload?: Record<string, unknown> }) =>
      api.queue.approve(id, editedPayload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queueKeys.all }),
  });
}

export function useRejectQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.queue.reject(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: queueKeys.all }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries/queue.ts
git commit -m "feat: add React Query hooks for queue (useQueueQuery, mutations)"
```

---

## Chunk 4: Store Slimdown + Queue Page Wiring

### Task 8: Remove queue data from Zustand store

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Remove queue from Store interface**

In `src/lib/store.ts`, remove these lines from the `Store` interface:

```ts
  queue: QueueItem[];
  approveQueueItem: (id: string) => void;
  rejectQueueItem: (id: string, reason: string) => void;
```

Also remove `QueueItem` from the type import at the top:

```ts
import type { Signal, Lead, Account, Opportunity, Task, Activity, Email, Goal, Meeting, User } from './types';
```

(Remove `QueueItem` from that import list.)

- [ ] **Step 2: Remove queue from store implementation**

Remove these lines from the `create<Store>` call:

```ts
  queue: [...data.queue],
```

And remove these mutation implementations:

```ts
  approveQueueItem: (id) => set(s => ({ queue: s.queue.map(q => q.id === id ? { ...q, status: 'approved' as const, reviewedBy: 'Juuso', reviewedAt: 'Just now' } : q) })),
  rejectQueueItem: (id, reason) => set(s => ({ queue: s.queue.map(q => q.id === id ? { ...q, status: 'rejected' as const, rejReason: reason, reviewedBy: 'Juuso', reviewedAt: 'Just now' } : q) })),
```

- [ ] **Step 3: Verify other pages still compile**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && npx tsc --noEmit 2>&1 | head -20
```

Expected: Only `queue/page.tsx` errors (it still imports `queue` from store). Other pages should be fine since their store data is untouched.

- [ ] **Step 4: Commit**

```bash
git add src/lib/store.ts
git commit -m "refactor: remove queue data + mutations from Zustand store

Queue page will use React Query hooks instead. Other domain data
stays in store until those pages are wired (E2-02 through E2-08)."
```

---

### Task 9: Wire Queue page to React Query

**Files:**
- Modify: `src/app/queue/page.tsx`

This is the largest task. The page currently reads from `useStore()` and uses in-memory mutations. We swap to React Query hooks, add loading/error states, and use server-provided counts.

- [ ] **Step 1: Update imports**

Replace the store import and add query hooks:

```tsx
// Remove this:
import { useStore } from '@/lib/store';

// Add these:
import { useQueueQuery, useApproveQueueItem, useRejectQueueItem } from '@/lib/queries/queue';
```

- [ ] **Step 2: Replace data source in QueuePage component**

Replace the opening lines of the `QueuePage` function:

```tsx
// REMOVE:
const { queue, approveQueueItem, rejectQueueItem } = useStore();

// ADD:
const { data: response, isLoading, error, refetch } = useQueueQuery(
  tab,
  typeFilter !== 'all' ? typeFilter : undefined,
);
const approve = useApproveQueueItem();
const reject = useRejectQueueItem();

const items = response?.data ?? [];
const pendingCount = response?.meta.pendingCount ?? 0;
const completedCount = response?.meta.completedCount ?? 0;
const typeCounts = response?.meta.typeCounts ?? {};
```

- [ ] **Step 3: Remove client-side filtering logic**

Remove these lines (they're now handled server-side):

```tsx
// REMOVE all of:
const pending = queue.filter(q => q.status === 'pending');
const completed = queue.filter(q => q.status !== 'pending');
const items = tab === 'pending' ? pending : completed;
const filtered = typeFilter === 'all' ? items : items.filter(q => q.type === typeFilter);
```

The variable `items` now comes from the query response (step 2). Since the server already filters by status and type, no client-side filtering is needed. Use `items` directly where `filtered` was used.

- [ ] **Step 4: Update type filter pills to use server counts**

Replace the `types` array:

```tsx
const types = [
  { k: 'all', l: 'All', ct: Object.values(typeCounts).reduce((a, b) => a + b, 0) || items.length },
  { k: 'outreach_draft', l: 'Outreach', ct: typeCounts['outreach_draft'] ?? 0 },
  { k: 'lead_qualification', l: 'Leads', ct: typeCounts['lead_qualification'] ?? 0 },
  { k: 'enrichment', l: 'Enrichment', ct: typeCounts['enrichment'] ?? 0 },
  { k: 'task_creation', l: 'Tasks', ct: typeCounts['task_creation'] ?? 0 },
];
```

- [ ] **Step 5: Update tab counts**

In the tab buttons section, replace `pending.length` with `pendingCount` and `completed.length` with `completedCount`:

```tsx
{(['pending', 'completed'] as const).map(t => (
  <button key={t} onClick={() => setTab(t)} className={cn('px-3.5 py-2 text-[12.5px] border-b-2 -mb-px capitalize whitespace-nowrap', tab === t ? 'text-[var(--text)] border-brand font-medium' : 'text-sub border-transparent hover:text-[var(--text)]')}>
    {t}<span className="ml-1 text-[10px] font-semibold px-[5px] py-px rounded-full bg-[var(--card-hover)] text-muted">{t === 'pending' ? pendingCount : completedCount}</span>
  </button>
))}
```

- [ ] **Step 6: Update subtitle count**

Replace:
```tsx
<p className="text-[12px] text-sub mt-0.5">{pending.length} pending · Human-in-the-loop review</p>
```

With:
```tsx
<p className="text-[12px] text-sub mt-0.5">{pendingCount} pending · Human-in-the-loop review</p>
```

- [ ] **Step 7: Wire mutation calls in QueueCard**

In the `QueueCard` component, replace the reject button handler:

```tsx
// BEFORE:
onClick={() => { rejectQueueItem(q.id, r); setRejectOpen(null); }}

// AFTER:
onClick={() => { reject.mutate({ id: q.id, reason: r }); setRejectOpen(null); }}
```

Replace the approve button handler:

```tsx
// BEFORE:
onClick={() => approveQueueItem(q.id)}

// AFTER:
onClick={() => approve.mutate({ id: q.id })}
```

- [ ] **Step 8: Add disabled state to mutation buttons**

Add `disabled` prop to prevent double-clicks. On the approve button:

```tsx
<button
  onClick={() => approve.mutate({ id: q.id })}
  disabled={approve.isPending}
  className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-brand text-white border border-brand/50 hover:brightness-110 ml-auto flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
>
```

On each reject reason button:

```tsx
<button
  key={r}
  onClick={() => { reject.mutate({ id: q.id, reason: r }); setRejectOpen(null); }}
  disabled={reject.isPending}
  className="block w-full text-left px-2.5 py-1.5 text-[11.5px] text-sub rounded-md hover:bg-[var(--card-hover)] hover:text-[var(--text)] disabled:opacity-50"
>
```

- [ ] **Step 9: Add loading skeleton**

Add a `QueueSkeleton` component and loading state. Place this before the `QueueCard` component definition (inside `QueuePage`):

```tsx
function QueueSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="h-4 w-16 rounded bg-[var(--surface)] shimmer" />
            <div className="h-4 w-20 rounded bg-[var(--surface)] shimmer" />
          </div>
          <div className="h-4 w-3/4 rounded bg-[var(--surface)] shimmer mb-1.5" />
          <div className="h-3 w-1/3 rounded bg-[var(--surface)] shimmer mb-2" />
          <div className="h-16 w-full rounded bg-[var(--surface)] shimmer mb-2" />
          <div className="flex gap-1.5 pt-2 border-t border-[var(--border)]">
            <div className="h-7 w-16 rounded bg-[var(--surface)] shimmer" />
            <div className="h-7 w-24 rounded bg-[var(--surface)] shimmer" />
            <div className="h-7 w-20 rounded bg-[var(--surface)] shimmer ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Add error state and wire loading/error into render**

Replace the main content area — the block starting with `{items.length === 0 ? (` (after Steps 2-3, `filtered` was renamed to `items`) through the closing `)}` of the list render — with:

```tsx
{isLoading ? (
  <QueueSkeleton />
) : error ? (
  <EmptyState
    icon="!"
    title="Failed to load queue"
    description={error.message}
    action={<button onClick={() => refetch()} className="mt-2 px-3 py-1.5 text-[11px] font-medium rounded-md bg-brand text-white hover:brightness-110">Retry</button>}
  />
) : items.length === 0 ? (
  <EmptyState icon={tab === 'pending' ? '✓' : '📋'} title={tab === 'pending' ? 'All clear — no pending approvals' : 'No completed items yet'} description={tab === 'pending' ? 'AI agents are running. Items will appear here when they need your review.' : 'Approved and rejected items will appear here.'} />
) : (
  <div className="flex flex-col gap-2">
    {items.sort((a, b) => (a.pri === 'High' ? 0 : 1) - (b.pri === 'High' ? 0 : 1)).map(q => <QueueCard key={q.id} q={q} />)}
  </div>
)}
```

**Note:** Check if `EmptyState` supports an `action` prop. If not, render the retry button below the `EmptyState` component instead.

- [ ] **Step 11: Verify EmptyState accepts action prop**

Run:
```bash
grep -A 5 "function EmptyState\|interface.*EmptyState\|EmptyState.*=" src/components/ui/index.tsx
```

If `EmptyState` does NOT have an `action` prop, use this alternative for the error state:

```tsx
) : error ? (
  <div>
    <EmptyState icon="!" title="Failed to load queue" description={error.message} />
    <div className="flex justify-center mt-2">
      <button onClick={() => refetch()} className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-brand text-white hover:brightness-110">Retry</button>
    </div>
  </div>
) : items.length === 0 ? (
```

- [ ] **Step 12: Verify the page compiles**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && npx tsc --noEmit 2>&1 | grep "queue" || echo "No queue errors"
```

Expected: No TypeScript errors related to queue page.

- [ ] **Step 13: Commit**

```bash
git add src/app/queue/page.tsx
git commit -m "feat: wire Queue page to API via React Query (E2-01)

- Fetches from /api/queue instead of Zustand store
- Approve/reject call API via useMutation + invalidate
- Loading skeleton while data fetches
- Error state with retry button
- Server-side filtering and type counts
- Disabled state on mutation buttons to prevent double-clicks"
```

---

## Chunk 5: Verification

### Task 10: End-to-end verification

- [ ] **Step 1: Ensure database is seeded**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && npx prisma db push && npx prisma db seed
```

If this fails because no DATABASE_URL is set, check `.env` for connection string. The app needs a running Postgres instance (Supabase, Neon, or Docker). See `DATABASE.md`.

- [ ] **Step 2: Start dev server**

Run:
```bash
cd /Users/ottosavasti/Desktop/eco-insight && npm run dev
```

- [ ] **Step 3: Verify Queue page loads with API data**

Open `http://localhost:3000/queue` in browser. Verify:
- [ ] Queue items render (from database, not mock data)
- [ ] Pending/completed tab counts match
- [ ] Type filter pills show correct counts
- [ ] Clicking tabs switches between pending/completed
- [ ] Type filter pills filter items

- [ ] **Step 4: Verify mutations persist**

- [ ] Click "Approve" on an item → item moves to completed tab
- [ ] Refresh page → approved item still in completed tab (persisted)
- [ ] Click "Reject" with a reason → item moves to completed, shows reason
- [ ] Refresh page → rejected item still shows with reason

- [ ] **Step 5: Verify other pages still work**

- [ ] Navigate to Home (`/`) — loads normally from store
- [ ] Navigate to Signals (`/signals`) — loads normally from store
- [ ] Navigate to Leads (`/leads`) — loads normally from store

These pages still use the Zustand store with mock data, which is expected.

- [ ] **Step 6: Verify loading state**

In browser DevTools Network tab, enable "Slow 3G" throttling. Navigate to `/queue`. Verify the skeleton cards appear while data loads.

- [ ] **Step 7: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A && git commit -m "fix: post-verification cleanup"
```
