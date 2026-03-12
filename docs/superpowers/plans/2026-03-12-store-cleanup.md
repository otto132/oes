# Store Cleanup & Data Source Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mock `data.ts` as the primary data source, slim the Zustand store to UI-only state, wire the 5 remaining pages to React Query, and delete dead server-side `queries.ts`.

**Architecture:** Pages switch from `useStore()` domain arrays to existing React Query hooks in `src/lib/queries/*.ts`. Layout components (Sidebar, TopBar, BottomNav) get badge counts from a new lightweight `/api/badge-counts` endpoint via a shared `useBadgeCounts` hook. The store retains only `theme`, `drawer*`, and `toggleTheme`.

**Tech Stack:** React Query (TanStack Query), Zustand, Next.js API routes, Prisma

---

## File Structure

**Create:**
- `src/app/api/badge-counts/route.ts` — lightweight endpoint returning sidebar/nav badge counts
- `src/lib/queries/badge-counts.ts` — React Query hook for badge counts

**Modify:**
- `src/app/signals/page.tsx` — switch from `useStore().signals` to `useSignalsQuery()`
- `src/app/leads/page.tsx` — switch from `useStore().leads` to `useLeadsQuery()`
- `src/app/accounts/page.tsx` — switch from `useStore().accounts` to `useAccountsQuery()`
- `src/app/inbox/page.tsx` — switch from `useStore().emails` to `useInboxQuery()`
- `src/app/tasks/page.tsx` — switch from `useStore().{tasks,goals,users}` to `useTasksQuery()`
- `src/components/layout/Sidebar.tsx` — switch from store domain arrays to `useBadgeCounts()`
- `src/components/layout/TopBar.tsx` — switch from `useStore().queue` to `useBadgeCounts()`
- `src/components/layout/BottomNav.tsx` — switch from `useStore().{queue,emails}` to `useBadgeCounts()`
- `src/app/settings/page.tsx` — remove `useStore().users` dependency (hardcode user until auth lands)
- `src/lib/store.ts` — strip all domain data, keep only UI state

**Delete:**
- `src/lib/queries.ts` — dead server-side query helpers (zero imports from API routes)

---

## Chunk 1: Badge Counts API + Hook

### Task 1: Create `/api/badge-counts` endpoint

**Files:**
- Create: `src/app/api/badge-counts/route.ts`

- [ ] **Step 1: Create the badge-counts API route**

```ts
// src/app/api/badge-counts/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const [pendingQueue, newSignals, newLeads, unreadEmails, overdueTasks] = await Promise.all([
    db.queueItem.count({ where: { status: 'pending' } }),
    db.signal.count({ where: { status: 'new_signal' } }),
    db.lead.count({ where: { stage: 'New' } }),
    db.inboxEmail.count({ where: { isUnread: true, isArchived: false } }),
    db.task.count({ where: { status: { not: 'Done' }, due: { lt: new Date() } } }),
  ]);

  return NextResponse.json({
    queue: pendingQueue,
    signals: newSignals,
    leads: newLeads,
    inbox: unreadEmails,
    tasks: overdueTasks,
  });
}
```

- [ ] **Step 2: Verify endpoint manually**

Run: `curl http://localhost:3000/api/badge-counts`
Expected: JSON with `{ queue: N, signals: N, leads: N, inbox: N, tasks: N }`

### Task 2: Create `useBadgeCounts` hook

**Files:**
- Create: `src/lib/queries/badge-counts.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/lib/queries/badge-counts.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const badgeKeys = {
  all: ['badge-counts'] as const,
};

export function useBadgeCounts() {
  return useQuery({
    queryKey: badgeKeys.all,
    queryFn: () => api.badgeCounts.get(),
    refetchInterval: 30_000, // refresh every 30s for live badge counts
  });
}
```

- [ ] **Step 2: Add `badgeCounts` to `api-client.ts`**

Add to the `api` object in `src/lib/api-client.ts`:

```ts
// Add after the existing auth section:
// ── Badge Counts ──────────────────────────────
badgeCounts: {
  get: () => get<{ queue: number; signals: number; leads: number; inbox: number; tasks: number }>('/badge-counts'),
},
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/badge-counts/route.ts src/lib/queries/badge-counts.ts src/lib/api-client.ts
git commit -m "feat: add /api/badge-counts endpoint and useBadgeCounts hook"
```

---

## Chunk 2: Wire Layout Components to Badge Counts

### Task 3: Wire Sidebar to `useBadgeCounts`

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Replace store imports with badge hook**

In `src/components/layout/Sidebar.tsx`, change the imports and data access:

**Old code (lines 5-6, 28-38):**
```tsx
import { useStore } from '@/lib/store';
import { isOverdue, cn } from '@/lib/utils';
```
```tsx
export default function Sidebar() {
  const pathname = usePathname();
  const { signals, queue, leads, emails, tasks, theme, toggleTheme, users } = useStore();
  const me = users[0];

  const badges: Record<string, number> = {
    queue: queue.filter(q => q.status === 'pending').length,
    signals: signals.filter(s => s.status === 'new').length,
    leads: leads.filter(l => l.stage === 'New').length,
    inbox: emails.filter(e => e.unread && !e.archived).length,
    tasks: tasks.filter(t => t.status !== 'Done' && isOverdue(t.due)).length,
  };
```

**New code:**
```tsx
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
```
```tsx
export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useStore();
  const { data: badges } = useBadgeCounts();

  const badgeCounts: Record<string, number> = {
    queue: badges?.queue ?? 0,
    signals: badges?.signals ?? 0,
    leads: badges?.leads ?? 0,
    inbox: badges?.inbox ?? 0,
    tasks: badges?.tasks ?? 0,
  };
```

Also remove the `me` / `users[0]` reference. Find the line using `me` (near bottom of file, showing user info) and replace with a hardcoded placeholder until auth lands:

Replace the `me` variable with a hardcoded user (consistent with Task 10):
```tsx
const me = { id: 'u1', name: 'Juuso Kari', ini: 'JK', role: 'Commercial Director', ac: 'green' }; // until auth
```

Update all references from `badges` (the old record) to `badgeCounts` in badge rendering.

- [ ] **Step 2: Verify sidebar renders with no console errors**

Run dev server, check sidebar badges appear (may be 0 if no DB data, that's fine).

### Task 4: Wire TopBar to `useBadgeCounts`

**Files:**
- Modify: `src/components/layout/TopBar.tsx`

- [ ] **Step 1: Replace store import**

**Old:**
```tsx
import { useStore } from '@/lib/store';
```
```tsx
const { queue } = useStore();
const pendingCount = queue.filter(q => q.status === 'pending').length;
```

**New:**
```tsx
import { useBadgeCounts } from '@/lib/queries/badge-counts';
```
```tsx
const { data: badges } = useBadgeCounts();
const pendingCount = badges?.queue ?? 0;
```

Remove the `useStore` import entirely from this file.

### Task 5: Wire BottomNav to `useBadgeCounts`

**Files:**
- Modify: `src/components/layout/BottomNav.tsx`

- [ ] **Step 1: Replace store import**

**Old:**
```tsx
import { useStore } from '@/lib/store';
```
```tsx
const { queue, emails } = useStore();
const badges: Record<string, number> = {
  queue: queue.filter(q => q.status === 'pending').length,
  inbox: emails.filter(e => e.unread && !e.archived).length,
};
```

**New:**
```tsx
import { useBadgeCounts } from '@/lib/queries/badge-counts';
```
```tsx
const { data: bc } = useBadgeCounts();
const badges: Record<string, number> = {
  queue: bc?.queue ?? 0,
  inbox: bc?.inbox ?? 0,
};
```

Remove the `useStore` import entirely from this file.

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/TopBar.tsx src/components/layout/BottomNav.tsx
git commit -m "feat: wire layout components to useBadgeCounts, remove store domain data deps"
```

---

## Chunk 3: Wire Pages to React Query

### Task 6: Wire Signals page

**Files:**
- Modify: `src/app/signals/page.tsx`

- [ ] **Step 1: Replace store with React Query**

**Old (lines 3, 15, 18, 21):**
```tsx
import { useStore } from '@/lib/store';
```
```tsx
const { signals, openDrawer, closeDrawer } = useStore();
```
```tsx
const filtered = filter === 'all' ? signals : signals.filter(s => s.type === filter);
```
```tsx
const s = signals.find((x: any) => x.id === id);
```

**New:**
```tsx
import { useStore } from '@/lib/store';
import { useSignalsQuery } from '@/lib/queries/signals';
```
```tsx
const { openDrawer, closeDrawer } = useStore();
const { data: resp } = useSignalsQuery(filter !== 'all' ? filter : undefined);
const signals = resp?.data ?? [];
```

Remove the client-side filtering since the API already filters by type:
```tsx
const filtered = signals;
```

Update `viewDetail` to use the `signals` array:
```tsx
const s = signals.find((x: any) => x.id === id);
```

This change is minimal because `useSignalsQuery` already accepts a type filter parameter that's passed to the API.

### Task 7: Wire Leads page

**Files:**
- Modify: `src/app/leads/page.tsx`

- [ ] **Step 1: Replace store with React Query**

**Old:**
```tsx
import { useStore } from '@/lib/store';
```
```tsx
const { leads } = useStore();
```

**New:**
```tsx
import { useLeadsQuery } from '@/lib/queries/leads';
```
```tsx
const { data: resp } = useLeadsQuery();
const leads = resp?.data ?? [];
```

Remove `useStore` import entirely — this page doesn't use drawer or theme.

### Task 8: Wire Accounts page

**Files:**
- Modify: `src/app/accounts/page.tsx`

- [ ] **Step 1: Replace store with React Query**

**Old:**
```tsx
import { useStore } from '@/lib/store';
```
```tsx
const { accounts } = useStore();
const [search, setSearch] = useState('');
const [typeFilter, setTypeFilter] = useState('all');

const filtered = accounts.filter(a => {
  if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
  if (typeFilter !== 'all' && a.type !== typeFilter) return false;
  return true;
});
```

**New:**
```tsx
import { useAccountsQuery } from '@/lib/queries/accounts';
```
```tsx
const [search, setSearch] = useState('');
const [typeFilter, setTypeFilter] = useState('all');
const { data: resp } = useAccountsQuery(search || undefined, typeFilter !== 'all' ? typeFilter : undefined);
const accounts = resp?.data ?? [];
```

Remove client-side filtering since the API handles `q` and `type` params. Change `filtered` references to `accounts`:
```tsx
const sorted = [...accounts].sort((a, b) => compositeScore(b.scores) - compositeScore(a.scores));
const types = [...new Set(accounts.map(a => a.type))];
```

Note: `types` for filter buttons will now only show types that exist in the current filtered results. This is acceptable; alternatively derive from an unfiltered query — but keep it simple for now.

Remove `useStore` import entirely.

### Task 9: Wire Inbox page

**Files:**
- Modify: `src/app/inbox/page.tsx`

- [ ] **Step 1: Replace store with React Query**

**Old:**
```tsx
import { useStore } from '@/lib/store';
```
```tsx
const { emails, openDrawer, closeDrawer } = useStore();

const active = emails.filter((e: any) => !e.archived);
const unread = active.filter((e: any) => e.unread).length;
```
```tsx
const e = emails.find((x: any) => x.id === id);
```

**New:**
```tsx
import { useStore } from '@/lib/store';
import { useInboxQuery } from '@/lib/queries/inbox';
```
```tsx
const { openDrawer, closeDrawer } = useStore();
const { data: resp } = useInboxQuery();
const emails = resp?.data ?? [];
const unread = resp?.meta?.unreadCount ?? 0;

const active = emails; // API already filters to non-archived
```

Update `viewEmail` to use `emails`:
```tsx
const e = emails.find((x: any) => x.id === id);
```

### Task 10: Wire Tasks page

**Files:**
- Modify: `src/app/tasks/page.tsx`

- [ ] **Step 1: Replace store with React Query**

This is the most complex page — it reads `users`, `tasks`, `goals` from the store.

**Old:**
```tsx
import { useStore } from '@/lib/store';
```
```tsx
const { users, tasks, goals, openDrawer, closeDrawer } = useStore();
const [tab, setTab] = useState<'mine' | 'review' | 'all'>('mine');
const [showCompleted, setShowCompleted] = useState(false);
const me = users[0];
```
```tsx
const goal = t.goalId ? goals.find(g => g.id === t.goalId) : null;
const siblings = t.goalId ? tasks.filter(x => x.goalId === t.goalId && x.id !== t.id) : [];
```

**New:**
```tsx
import { useStore } from '@/lib/store';
import { useTasksQuery } from '@/lib/queries/tasks';
```
```tsx
const { openDrawer, closeDrawer } = useStore();
const [tab, setTab] = useState<'mine' | 'review' | 'all'>('mine');
const [showCompleted, setShowCompleted] = useState(false);
const [search, setSearch] = useState('');

// Always fetch all tasks (including completed) so goal progress bars
// can compute done/total correctly. Client-side filtering for the
// showCompleted toggle happens below.
const { data: resp } = useTasksQuery(true);
const allTasks = resp?.data?.tasks ?? [];
const goals = resp?.data?.goals ?? [];
const me = { id: 'u1', name: 'Juuso Kari', ini: 'JK', role: 'Commercial Director', ac: 'green' }; // until auth

// Apply showCompleted filter client-side
const tasks = showCompleted ? allTasks : allTasks.filter(t => t.status !== 'Done');
```

The rest of the page logic (filtering, grouping, `openTaskDetail`) stays the same since it operates on the `tasks` and `goals` arrays which are now API-sourced.

**Important:** The goal progress calculation (lines 163-164 in original) uses `tasks.filter(t => t.goalId === gId && t.status === 'Done')` to compute done/total. This requires ALL tasks including completed ones. That's why we always pass `true` to `useTasksQuery` and filter client-side. Update those two lines to use `allTasks` instead of `tasks`:

```tsx
const done = allTasks.filter(t => t.goalId === gId && t.status === 'Done').length;
const total = allTasks.filter(t => t.goalId === gId).length;
```

- [ ] **Step 2: Commit**

```bash
git add src/app/signals/page.tsx src/app/leads/page.tsx src/app/accounts/page.tsx src/app/inbox/page.tsx src/app/tasks/page.tsx
git commit -m "feat: wire signals, leads, accounts, inbox, tasks pages to React Query"
```

---

## Chunk 4: Slim Store & Clean Up

### Task 11: Update Settings page

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Remove domain data from settings page**

The settings page uses `useStore().users` for the team list display and `openDrawer`/`closeDrawer` for detail panels.

Replace:
```tsx
const { users, openDrawer, closeDrawer } = useStore();
```

With:
```tsx
const { openDrawer, closeDrawer } = useStore();
// Team list will come from API in E2-09; hardcode for now
const users = [
  { id: 'u1', name: 'Juuso Kari', ini: 'JK', role: 'Commercial Director', ac: 'green' },
  { id: 'u2', name: 'Laura Puranen', ini: 'LP', role: 'CEO', ac: 'default' },
  { id: 'u3', name: 'Nick Schoch', ini: 'NS', role: 'COO', ac: 'blue' },
];
```

### Task 12: Slim the Zustand store

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Replace store with UI-only state**

Replace the entire contents of `src/lib/store.ts`:

```ts
'use client';
import type React from 'react';
import { create } from 'zustand';

interface Store {
  theme: 'dark' | 'light';
  drawerOpen: boolean;
  drawerContent: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode } | null;
  toggleTheme: () => void;
  openDrawer: (c: { title: string; subtitle: string; body: React.ReactNode; footer: React.ReactNode }) => void;
  closeDrawer: () => void;
}

export const useStore = create<Store>((set) => ({
  theme: 'dark',
  drawerOpen: false,
  drawerContent: null,
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', next === 'dark');
    return { theme: next };
  }),
  openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
```

This removes all domain data arrays and the `import * as data from './data'` line.

- [ ] **Step 2: Verify build passes**

Run: `npx next build`
Expected: Build succeeds with no type errors. Any remaining references to removed store properties (e.g., `useStore().signals`) will fail here.

### Task 13: Delete dead `queries.ts`

**Files:**
- Delete: `src/lib/queries.ts`

- [ ] **Step 1: Verify zero imports**

Run: `grep -r "from.*['\"].*lib/queries['\"]" src/ --include="*.ts" --include="*.tsx"` (should match only `src/lib/queries/*.ts` pattern imports, NOT `src/lib/queries.ts` directly)

Expected: No files import from `@/lib/queries` (the bare module). All imports use `@/lib/queries/home`, `@/lib/queries/queue`, etc.

- [ ] **Step 2: Delete the file**

```bash
rm src/lib/queries.ts
```

- [ ] **Step 3: Verify build still passes**

Run: `npx next build`
Expected: Build succeeds.

### Task 14: Update backlog status

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1: Mark items as Done**

Update status for:
- `T-05`: "Remove data.ts as primary data source" → `Done`
- `E2-10`: "Refactor store.ts to UI-only state" → `Done`
- `E2-13`: "Wire or delete queries.ts" → `Done`

- [ ] **Step 2: Commit all cleanup**

```bash
git add src/lib/store.ts src/app/settings/page.tsx BACKLOG.md
git rm src/lib/queries.ts
git commit -m "feat: slim store to UI-only, delete dead queries.ts (T-05, E2-10, E2-13)"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `npx next build` succeeds with zero errors
- [ ] Dev server: all pages load data from API (not mock)
- [ ] Sidebar badge counts display correctly
- [ ] `grep -r "from.*data" src/lib/store.ts` returns nothing
- [ ] `grep -r "useStore" src/ | grep -v "theme\|drawer\|toggleTheme\|openDrawer\|closeDrawer"` returns nothing (no domain data access via store)
- [ ] `src/lib/queries.ts` does not exist
- [ ] `data.ts` still exists (as seed reference) but is only imported by `seed.ts`
