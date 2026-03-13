# UX Fundamentals Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable loading skeletons and error states to all dashboard pages, and remove hardcoded demo values, making the app feel production-ready.

**Architecture:** Create Skeleton/ErrorState primitives in the existing UI barrel file (`src/components/ui/index.tsx`), then integrate them into every dashboard page. Pages that already have inline skeletons get refactored to use the new primitives. Hardcoded user names and fake timestamps are replaced with session-derived or placeholder values.

**Tech Stack:** React 19, Next.js 15 App Router, TypeScript, Tailwind CSS, React Query, next-auth, lucide-react

---

## Chunk 1: Primitives and New Page Skeletons

### Task 1: Add Skeleton Primitives + ErrorState to UI Library

**Files:**
- Modify: `src/components/ui/index.tsx` (append after EmptyState)
- Create: `src/components/ui/__tests__/skeleton.test.tsx`

- [ ] **Step 1: Write tests for Skeleton primitives**

```tsx
// src/components/ui/__tests__/skeleton.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonText, SkeletonCard, ErrorState } from '../index';

describe('Skeleton', () => {
  it('renders with animate-pulse', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('bg-[var(--card-hover)]');
  });

  it('merges custom className', () => {
    const { container } = render(<Skeleton className="h-8 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('w-32');
  });
});

describe('SkeletonText', () => {
  it('renders with default h-3 w-full', () => {
    const { container } = render(<SkeletonText />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-3');
    expect(el.className).toContain('w-full');
  });
});

describe('SkeletonCard', () => {
  it('renders with elevated background and border', () => {
    const { container } = render(<SkeletonCard />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('bg-[var(--elevated)]');
    expect(el.className).toContain('border');
    expect(el.className).toContain('rounded-xl');
  });

  it('renders children', () => {
    render(<SkeletonCard><span data-testid="child">hi</span></SkeletonCard>);
    expect(screen.getByTestId('child')).toBeDefined();
  });
});

describe('ErrorState', () => {
  it('renders default message', () => {
    render(<ErrorState />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('renders custom message', () => {
    render(<ErrorState message="Custom error" />);
    expect(screen.getByText('Custom error')).toBeDefined();
  });

  it('renders retry button when onRetry provided', () => {
    const fn = () => {};
    render(<ErrorState onRetry={fn} />);
    expect(screen.getByText('Try again')).toBeDefined();
  });

  it('does not render retry button without onRetry', () => {
    render(<ErrorState />);
    expect(screen.queryByText('Try again')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/__tests__/skeleton.test.tsx`
Expected: FAIL — Skeleton, SkeletonText, SkeletonCard, ErrorState not exported

- [ ] **Step 3: Implement primitives in ui/index.tsx**

Append to end of `src/components/ui/index.tsx`:

```tsx
/* ── Skeleton Primitives ── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-[var(--card-hover)] rounded', className)} />;
}

export function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3 w-full', className)} />;
}

export function SkeletonCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl bg-[var(--elevated)] border border-[var(--border)] p-3.5', className)}>
      {children}
    </div>
  );
}

/* ── Error State ── */
import { AlertTriangle } from 'lucide-react';

export function ErrorState({ message = 'Something went wrong', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="py-16 px-6 text-center">
      <AlertTriangle className="w-8 h-8 text-[var(--sub)] mx-auto mb-3 opacity-40" />
      <div className="text-[13px] font-medium text-[var(--sub)] mb-3">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[12px] font-medium text-[var(--brand)] hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
```

Note: Move the `import { AlertTriangle } from 'lucide-react'` to the top-level imports of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/__tests__/skeleton.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/index.tsx src/components/ui/__tests__/skeleton.test.tsx
git commit -m "feat(ui): add Skeleton, SkeletonText, SkeletonCard, ErrorState primitives"
```

---

### Task 2: Add Skeleton + Error State to Signals Page

**Files:**
- Modify: `src/app/(dashboard)/signals/page.tsx`

**Context:** This page uses `useSignalsQuery(filter)`. It currently has NO loading or error handling — the query result is used directly. The page renders a filter bar and a list of signal cards.

- [ ] **Step 1: Add loading/error imports and skeleton**

At the top of the page, add imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

Add a `SignalsSkeleton` function (place before the main component):
```tsx
function SignalsSkeleton() {
  return (
    <div className="page-enter space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>
      {/* Signal cards */}
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <SkeletonText className="w-3/4" />
          <SkeletonText className="w-full" />
          <SkeletonText className="w-1/2" />
        </SkeletonCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Integrate loading/error into the render**

In the main component, after the query hook call, add early returns:
```tsx
const { data: signals, isLoading, isError, refetch } = useSignalsQuery(filter);

if (isLoading) return <SignalsSkeleton />;
if (isError) return <ErrorState onRetry={() => refetch()} />;
```

Update destructuring to use `data: signals` pattern if not already.

- [ ] **Step 3: Verify build passes**

Run: `npx next build --no-lint 2>&1 | tail -5` (or `npx tsc --noEmit`)
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/signals/page.tsx
git commit -m "feat(signals): add loading skeleton and error state"
```

---

### Task 3: Add Skeleton + Error State to Leads Page

**Files:**
- Modify: `src/app/(dashboard)/leads/page.tsx`

**Context:** Uses `useLeadsQuery()`. No loading/error handling. Desktop shows kanban (3 columns: New, Researching, Qualified), mobile shows sorted list.

- [ ] **Step 1: Add skeleton and error handling**

Add imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

Add skeleton (before main component):
```tsx
function LeadsSkeleton() {
  return (
    <div className="page-enter space-y-4">
      {/* Desktop: kanban columns */}
      <div className="hidden md:grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} className="space-y-2">
                <SkeletonText className="w-2/3" />
                <SkeletonText className="w-full h-2" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-12 rounded-full" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
              </SkeletonCard>
            ))}
          </div>
        ))}
      </div>
      {/* Mobile: list */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-2">
            <SkeletonText className="w-2/3" />
            <SkeletonText className="w-full h-2" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add early returns in render**

```tsx
const { data: leads, isLoading, isError, refetch } = useLeadsQuery();

if (isLoading) return <LeadsSkeleton />;
if (isError) return <ErrorState onRetry={() => refetch()} />;
```

- [ ] **Step 3: Verify build passes**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/leads/page.tsx
git commit -m "feat(leads): add loading skeleton and error state"
```

---

### Task 4: Add Skeleton + Error State to Accounts Page

**Files:**
- Modify: `src/app/(dashboard)/accounts/page.tsx`

**Context:** Uses `useAccountsQuery(search, typeFilter)`. No loading/error. Shows search bar + type filters + table (desktop) / cards (mobile).

- [ ] **Step 1: Add skeleton and error handling**

Add imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

Add skeleton:
```tsx
function AccountsSkeleton() {
  return (
    <div className="page-enter space-y-4">
      {/* Search + filters */}
      <div className="flex gap-3 items-center">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>
      </div>
      {/* Table rows */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            <div className="flex-1 space-y-1.5">
              <SkeletonText className="w-1/3" />
              <SkeletonText className="w-1/5 h-2" />
            </div>
            <Skeleton className="h-4 w-12" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add early returns**

```tsx
const { data: accounts, isLoading, isError, refetch } = useAccountsQuery(search, typeFilter);

if (isLoading) return <AccountsSkeleton />;
if (isError) return <ErrorState onRetry={() => refetch()} />;
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/accounts/page.tsx
git commit -m "feat(accounts): add loading skeleton and error state"
```

---

### Task 5: Add Skeleton + Error State to Inbox Page

**Files:**
- Modify: `src/app/(dashboard)/inbox/page.tsx`

**Context:** Uses `useInboxQuery()`. No loading/error. Shows email list rows with classification badges.

- [ ] **Step 1: Add skeleton and error handling**

Add imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

Add skeleton:
```tsx
function InboxSkeleton() {
  return (
    <div className="page-enter space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} className="flex items-start gap-3">
          <Skeleton className="h-2 w-2 rounded-full mt-1.5 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <SkeletonText className="w-1/4" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
            <SkeletonText className="w-3/4" />
            <SkeletonText className="w-full h-2" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </SkeletonCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add early returns**

```tsx
const { data: emails, isLoading, isError, refetch } = useInboxQuery();

if (isLoading) return <InboxSkeleton />;
if (isError) return <ErrorState onRetry={() => refetch()} />;
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/inbox/page.tsx
git commit -m "feat(inbox): add loading skeleton and error state"
```

---

### Task 6: Add Skeleton + Error State to Tasks Page

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

**Context:** Uses `useTasksQuery(true)`. No loading/error. Shows tabs, search, goal groups with task rows.

- [ ] **Step 1: Add skeleton and error handling**

Add imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

Add skeleton:
```tsx
function TasksSkeleton() {
  return (
    <div className="page-enter space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      {/* Search */}
      <Skeleton className="h-9 w-full rounded-lg" />
      {/* Goal groups */}
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="space-y-2">
          <div className="flex items-center gap-2">
            <SkeletonText className="w-1/4" />
            <Skeleton className="h-1.5 flex-1 rounded-full" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <SkeletonText className="w-2/3" />
              <Skeleton className="h-4 w-12 rounded-full ml-auto" />
            </SkeletonCard>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add early returns**

```tsx
const { data: tasks, isLoading, isError, refetch } = useTasksQuery(true);

if (isLoading) return <TasksSkeleton />;
if (isError) return <ErrorState onRetry={() => refetch()} />;
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(tasks): add loading skeleton and error state"
```

---

## Chunk 2: Refactor Existing Skeletons + Hardcoded Values

### Task 7: Refactor Home Page Skeleton + Fix Hardcoded Greeting

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Context:** Home has a detailed inline skeleton (lines 17-99) using `animate-pulse` + `bg-[var(--card-hover)]` divs. It also hardcodes the greeting name "Juuso". The page uses `useHomeSummary()` and `useSession()` is available from next-auth/react.

- [ ] **Step 1: Add Skeleton primitive imports**

Add to existing imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

- [ ] **Step 2: Refactor inline skeleton to use primitives**

Replace the existing skeleton function (the function that renders when `isLoading` is true) with a version using Skeleton primitives. Keep the same layout structure:

```tsx
function HomeSkeleton() {
  return (
    <div className="page-enter max-w-[1100px] mx-auto w-full space-y-6">
      {/* Hero */}
      <div className="space-y-1">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-3.5 w-48" />
      </div>
      {/* Stats - desktop */}
      <div className="hidden md:grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-2">
            <SkeletonText className="w-1/2 h-2" />
            <Skeleton className="h-5 w-12" />
          </SkeletonCard>
        ))}
      </div>
      {/* Stats - mobile */}
      <div className="md:hidden flex flex-wrap gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-[calc(50%-6px)] rounded-xl" />
        ))}
      </div>
      {/* Two-column layout */}
      <div className="grid md:grid-cols-[1fr,320px] gap-4">
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s} className="space-y-2">
              <SkeletonText className="w-24 h-2" />
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} className="h-14" />
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <SkeletonText className="w-24 h-2" />
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} className="h-14" />
            ))}
          </div>
          <div className="space-y-2">
            <SkeletonText className="w-24 h-2" />
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} className="h-10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Fix hardcoded "Juuso" greeting**

Find the greeting line (contains `Juuso`) and replace with session-derived name:

```tsx
// Add useSession import if not present
import { useSession } from 'next-auth/react';

// In the component:
const { data: session } = useSession();
const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

// In the greeting:
const greeting = `Good ${timeOfDay}, ${firstName}`;
```

- [ ] **Step 4: Replace inline error state with ErrorState component**

Find the existing error rendering block and replace with:
```tsx
if (error) return <ErrorState onRetry={() => refetch()} />;
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/page.tsx
git commit -m "feat(home): refactor skeleton to use primitives, fix hardcoded greeting"
```

---

### Task 8: Refactor Queue Page Skeleton + Remove .shimmer CSS

**Files:**
- Modify: `src/app/(dashboard)/queue/page.tsx`
- Modify: `src/app/globals.css`

**Context:** Queue has `QueueSkeleton` (lines 41-62) using the `.shimmer` class. After refactoring, `.shimmer` will be dead CSS.

- [ ] **Step 1: Add Skeleton imports and refactor QueueSkeleton**

Add to imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

Replace the existing `QueueSkeleton` function to use primitives:
```tsx
function QueueSkeleton() {
  return (
    <div className="page-enter space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <SkeletonCard key={i} className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full ml-auto" />
          </div>
          <SkeletonText className="w-3/4" />
          <SkeletonText className="w-full h-2" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="flex gap-2 justify-end">
            <Skeleton className="h-7 w-16 rounded-md" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Replace inline error with ErrorState**

If the queue page has an inline error state, replace with `<ErrorState onRetry={() => refetch()} />`.

- [ ] **Step 3: Remove .shimmer from globals.css**

In `src/app/globals.css`, remove the shimmer keyframes and class:
```css
/* Remove these lines: */
@keyframes shimmer { 0% { opacity: .5; } 50% { opacity: .8; } 100% { opacity: .5; } }
.shimmer { animation: shimmer 1.5s ease-in-out infinite; background: var(--surface); }
```

- [ ] **Step 4: Grep to confirm .shimmer has no remaining references**

Run: `grep -r "shimmer" src/ --include="*.tsx" --include="*.css"`
Expected: No results (or only unrelated uses)

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/queue/page.tsx src/app/globals.css
git commit -m "feat(queue): refactor skeleton to primitives, remove dead .shimmer CSS"
```

---

### Task 9: Refactor Account Detail + Pipeline Skeletons

**Files:**
- Modify: `src/app/(dashboard)/accounts/[id]/page.tsx`
- Modify: `src/app/(dashboard)/pipeline/page.tsx`
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

**Context:** All three pages already have `isLoading`/`isError` checks and inline skeletons using `animate-pulse` + `bg-[var(--surface)]`. Refactor to use Skeleton primitives.

- [ ] **Step 1: Refactor Account Detail skeleton**

Add imports:
```tsx
import { Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
```

Replace the inline skeleton (the loading branch) to use primitives. Match the existing layout shape: header card + tabs + two-column content.

Replace the inline error state with `<ErrorState onRetry={() => refetch()} />`.

- [ ] **Step 2: Refactor Pipeline page skeleton**

Add imports and replace `LoadingSkeleton` function to use Skeleton primitives. Keep the kanban column shape (7 columns desktop, list mobile).

Replace inline error with `<ErrorState onRetry={() => refetch()} />`.

- [ ] **Step 3: Refactor Pipeline Detail skeleton**

Add imports and replace `LoadingSkeleton` to use Skeleton primitives. Keep hero + two-column shape.

Replace inline error with `<ErrorState onRetry={() => refetch()} />`.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/accounts/[id]/page.tsx src/app/(dashboard)/pipeline/page.tsx src/app/(dashboard)/pipeline/[id]/page.tsx
git commit -m "feat: refactor account detail + pipeline skeletons to use primitives"
```

---

### Task 10: Fix Hardcoded Values in TopBar + Settings

**Files:**
- Modify: `src/components/layout/TopBar.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Context:**
- TopBar line ~29 renders hardcoded "JK" initials for the user avatar.
- Settings has hardcoded "Last run: 2 hours ago" type timestamps and a hardcoded `users` array.

- [ ] **Step 1: Fix TopBar hardcoded initials**

In `TopBar.tsx`, find the hardcoded "JK" and replace with session-derived initials:

```tsx
import { useSession } from 'next-auth/react';

// In component:
const { data: session } = useSession();
const initials = session?.user?.name
  ?.split(' ')
  .map((n: string) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2) ?? '?';
```

If `useSession` is already imported and used, just use the existing session data. Replace the hardcoded "JK" with the computed `initials` variable.

- [ ] **Step 2: Fix Settings hardcoded timestamps**

In `settings/page.tsx`, find any "Last run: 2 hours ago" or similar fake timestamps and replace with `"—"` (em-dash placeholder).

Find the hardcoded `users` array and add a comment clarifying it's a placeholder until E2-09 wires the Settings API:
```tsx
// TODO(E2-09): Replace with data from /api/settings/team
```

- [ ] **Step 3: Grep for remaining hardcoded values**

Run: `grep -rn "Juuso\|\"JK\"\|Last run.*ago\|2 hours ago" src/ --include="*.tsx"`
Expected: No matches in page or component files (data.ts and seed.ts are OK to have these)

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/TopBar.tsx src/app/(dashboard)/settings/page.tsx
git commit -m "fix: replace hardcoded user initials and fake timestamps with dynamic values"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass including new skeleton tests

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `npx next lint`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 4: Grep verification for hardcoded values**

Run: `grep -rn "Juuso\|\"JK\"\|2 hours ago" src/ --include="*.tsx" | grep -v data.ts | grep -v seed.ts`
Expected: No matches

- [ ] **Step 5: Final commit if any cleanup needed, otherwise done**

---

## Task Dependency Graph

```
Task 1 (primitives) ─┬─> Task 2 (signals)     ─┐
                      ├─> Task 3 (leads)        │
                      ├─> Task 4 (accounts)     │
                      ├─> Task 5 (inbox)        ├─> Task 11 (verification)
                      ├─> Task 6 (tasks)        │
                      ├─> Task 7 (home refactor) │
                      ├─> Task 8 (queue refactor)│
                      ├─> Task 9 (detail pages)  │
                      └─> Task 10 (hardcoded)   ─┘
```

Tasks 2-10 are all independent of each other and can run in parallel after Task 1 completes.
