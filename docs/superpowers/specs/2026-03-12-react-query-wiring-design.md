# Frontend-Backend Wiring with React Query

> **Scope:** E2-11 (wire api-client.ts), E2-12 (delete useFetch.ts), E2-01 (wire Queue page)
> **Date:** 2026-03-12

---

## Problem

All 10 pages read from `useStore()` which initializes from hardcoded `data.ts`. Thirteen API routes exist with real Prisma queries but nothing calls them. Two unused data-fetching utilities (`api-client.ts`, `useFetch.ts`) sit dead. Mutations (approve, reject, dismiss, complete) update Zustand in-memory only and reset on page refresh.

## Decision

Use **TanStack React Query** (`@tanstack/react-query`) for all server state management. Wire it through the existing `api-client.ts` fetch layer. Delete `useFetch.ts`. Slim `store.ts` down to UI-only state.

### Why React Query over alternatives

- **vs. useFetch.ts (custom hook):** No caching, no dedup, no background refetch, no mutation primitives. Would need to rebuild all of these.
- **vs. SWR:** React Query has richer mutation support (optimistic updates, rollback), built-in devtools, and better TypeScript ergonomics for the mutation-heavy workflows in this app (approve/reject/dismiss/convert).
- **vs. Server Components:** Pages are heavily interactive (`useState` for filters, tabs, expanded items, reject dropdowns). Converting to RSC would require extracting all interactivity into client components anyway, adding complexity without benefit for this use case.

---

## Architecture

### Data flow

```
Page component
  -> useXxxQuery() / useXxxMutation()     [src/lib/queries/*.ts]
    -> api.xxx.list() / api.xxx.action()  [src/lib/api-client.ts]
      -> GET/POST /api/xxx                [src/app/api/xxx/route.ts]
        -> Prisma query + adaptXxx()      [DB + src/lib/adapters.ts]
          -> JSON response with UI types
```

### Layer responsibilities

| Layer | File(s) | Responsibility |
|-------|---------|---------------|
| **Query hooks** | `src/lib/queries/*.ts` | React Query wrappers; define query keys, stale times, invalidation |
| **API client** | `src/lib/api-client.ts` | Typed fetch calls; URL construction; error extraction |
| **API routes** | `src/app/api/*/route.ts` | Prisma queries, business logic, adapter transformation |
| **Adapters** | `src/lib/adapters.ts` | Prisma-to-UI type mapping (already done) |
| **Store** | `src/lib/store.ts` | UI-only state: theme, drawer |

---

## Implementation Details

### 1. New dependency

```
@tanstack/react-query ^5
@tanstack/react-query-devtools ^5
```

### 2. QueryClient provider

**New file: `src/lib/query-provider.tsx`**

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

**Modified: `src/app/layout.tsx`** — Wrap children with `<QueryProvider>`.

### 3. API route adapter integration

Each API route applies the appropriate adapter before returning JSON. The frontend receives UI types directly.

**Example — `src/app/api/queue/route.ts` GET handler:**

```ts
import { adaptQueueItem } from '@/lib/adapters';

// In GET handler, after Prisma query:
const adapted = items.map(adaptQueueItem);
return NextResponse.json({ data: adapted, meta: { pendingCount, completedCount } });
```

**POST handler — approve/reject:** After updating the queue item, re-fetch it to get the reviewer's name for the `reviewedBy` field. The `adaptQueueItem` adapter maps `reviewedById` to `reviewedBy`, but the raw update only has the user ID. To show the reviewer's display name, the POST handler includes the reviewer relation:

```ts
const updated = await db.queueItem.update({
  where: { id },
  data: { ... },
  include: { reviewedBy: true },
});
// Map reviewedBy user name into the adapted result
const adapted = adaptQueueItem(updated);
if (updated.reviewedBy) adapted.reviewedBy = updated.reviewedBy.name;
return NextResponse.json({ data: adapted });
```

**Note:** The current `adaptQueueItem` maps `reviewedById` (a user ID string) to `reviewedBy`. After wiring, this will show the reviewer's name instead of ID. The adapter's `reviewedById` input stays as-is; the POST handler overrides with the resolved name.

**GET handler — per-type counts:** The response `meta` includes per-type counts so the frontend can render type filter pills without fetching all items:

```ts
const typeCounts = await db.queueItem.groupBy({
  by: ['type'],
  where: status === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } },
  _count: true,
});
return NextResponse.json({
  data: adapted,
  meta: {
    pendingCount,
    completedCount,
    typeCounts: Object.fromEntries(typeCounts.map(t => [t.type, t._count])),
  },
});
```

### 4. Query hooks

**New file: `src/lib/queries/queue.ts`**

```ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { QueueItem } from '@/lib/types';

interface QueueResponse {
  data: QueueItem[];
  meta: { pendingCount: number; completedCount: number; typeCounts: Record<string, number> };
}

export const queueKeys = {
  all: ['queue'] as const,
  list: (status: string, type?: string) => ['queue', status, type] as const,
};

export function useQueueQuery(status: 'pending' | 'completed', type?: string) {
  return useQuery<QueueResponse>({
    queryKey: queueKeys.list(status, type),
    queryFn: () => api.queue.list(status === 'completed' ? 'completed' : 'pending', type),
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

### 5. Store slimdown (phased)

**This batch:** Remove only `queue`, `approveQueueItem`, and `rejectQueueItem` from the store. All other domain data (`signals`, `leads`, `accounts`, `opps`, `tasks`, `emails`, `meetings`, `goals`, `users`) and their mutations stay intact — other pages still depend on them.

**After E2-08 (all pages wired):** Remove remaining domain data, drop `import * as data from './data'`, and slim the store to UI-only state:

```ts
interface Store {
  theme: 'dark' | 'light';
  drawerOpen: boolean;
  drawerContent: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode } | null;
  toggleTheme: () => void;
  openDrawer: (c: Store['drawerContent']) => void;
  closeDrawer: () => void;
}
```

### 6. Queue page wiring

**Modified: `src/app/queue/page.tsx`**

Changes:
- Replace `useStore()` domain reads with `useQueueQuery(tab, typeFilter)`
- Replace `approveQueueItem` / `rejectQueueItem` with mutation hooks
- Add loading state: skeleton cards matching current layout
- Add error state: message with retry button
- Derive `pending`/`completed` counts from `data.meta` instead of client-side filtering

```tsx
// Before
const { queue, approveQueueItem, rejectQueueItem } = useStore();
const pending = queue.filter(q => q.status === 'pending');

// After
const { data: response, isLoading, error } = useQueueQuery(tab, typeFilter !== 'all' ? typeFilter : undefined);
const approve = useApproveQueueItem();
const reject = useRejectQueueItem();
const items = response?.data ?? [];
const pendingCount = response?.meta.pendingCount ?? 0;
const completedCount = response?.meta.completedCount ?? 0;
```

Mutations:
```tsx
// Before
approveQueueItem(q.id);

// After
approve.mutate({ id: q.id });
```

### 7. Delete useFetch.ts

Remove `src/hooks/useFetch.ts`. It has zero imports and React Query fully replaces its functionality.

---

## Type Safety

- `api-client.ts` currently uses `any` for all return types. As part of E2-01, the queue methods will be typed:
  - `api.queue.list()` returns `Promise<QueueResponse>`
  - `api.queue.approve()` returns `Promise<{ data: QueueItem }>`
  - `api.queue.reject()` returns `Promise<{ data: QueueItem }>`
- Other domains will be typed when their pages are wired (E2-02 through E2-08).

---

## Loading & Error States

**Loading skeleton:** A `QueueSkeleton` component (inline in `src/app/queue/page.tsx`) renders 3 shimmer cards matching the QueueCard layout (type badge, title, body area, action buttons as grey bars). Uses CSS animation with `@keyframes shimmer` defined in `globals.css`. Kept inline because it is page-specific; a shared `Skeleton` primitive can be extracted later (UX-01).

**Error state:** Uses existing `EmptyState` component pattern with an error message and a "Retry" button that calls `refetch()`.

**Mutation feedback:** Approve/reject buttons show a subtle disabled state while `mutation.isPending`, preventing double-clicks.

---

## What stays unchanged

- All page JSX and styling (only data source changes)
- `api-client.ts` structure and API surface
- `adapters.ts` (already complete)
- `types.ts` (UI types)
- All API route business logic (only adding adapter calls to responses)
- Prisma schema

---

## Files changed summary

| Action | File |
|--------|------|
| **New** | `src/lib/query-provider.tsx` |
| **New** | `src/lib/queries/queue.ts` |
| **Modified** | `src/app/layout.tsx` (add QueryProvider) |
| **Modified** | `src/app/api/queue/route.ts` (add adapter to responses) |
| **Modified** | `src/app/queue/page.tsx` (swap store for query hooks) |
| **Modified** | `src/lib/store.ts` (remove queue + queue mutations only) |
| **Modified** | `src/lib/api-client.ts` (type queue methods) |
| **Modified** | `package.json` (add @tanstack/react-query) |
| **Deleted** | `src/hooks/useFetch.ts` |

---

## Future work (not in this batch)

- E2-02 through E2-08: Wire remaining 7 pages following the same pattern
- UX-01: Loading skeletons for all pages (Queue skeleton built here serves as template)
- T-05: Remove `data.ts` as primary data source (blocked until all pages wired)
- Optimistic updates for mutations (can be added per-domain as needed)
