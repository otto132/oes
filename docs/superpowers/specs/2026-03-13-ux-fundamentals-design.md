# UX Fundamentals: Skeletons, Error States, Hardcoded Values

> Backlog items: UX-01, UX-02, UX-08
> Date: 2026-03-13

## Problem

The app is wired to real APIs via React Query, but the UX during loading and error states is inconsistent:

1. **Loading**: Some pages (Home, Queue) have inline shimmer skeletons; others show nothing during fetch. Each page reinvents the pattern with raw `animate-pulse` divs.
2. **Errors**: Only Home has an error state with retry. Other pages silently fail or show blank content.
3. **Hardcoded values**: The greeting says "Juuso", Settings shows fake "Last run: 2 hours ago" timestamps, and there may be other hardcoded user/demo references.

## Scope

- Create reusable Skeleton primitives and per-page skeleton components
- Create a reusable ErrorState component
- Add loading/error handling to all pages missing it
- Replace hardcoded demo values with dynamic data from session/API

**Out of scope**: Settings page API wiring (E2-09, separate session), light theme (UX-04), optimistic updates (UX-06).

## Design

### 1. Skeleton Primitives (`src/components/ui/index.tsx`)

Three new exports:

```tsx
// Base shimmer block — all sizing via className
function Skeleton({ className }: { className?: string })
// Renders: <div className={cn('animate-pulse bg-[var(--card-hover)] rounded', className)} />

// Text line placeholder
function SkeletonText({ className }: { className?: string })
// Renders: <Skeleton className={cn('h-3 w-full', className)} />

// Card-shaped placeholder matching existing card pattern
function SkeletonCard({ className, children }: { className?: string; children?: ReactNode })
// Renders: <div className={cn('rounded-xl bg-[var(--elevated)] border border-[var(--border)] p-3.5', className)}>{children}</div>

// All primitives use cn() for className composition (consistent with existing codebase pattern).
```

### 2. Per-Page Skeletons

Each page gets a skeleton function that matches its final layout shape. These are defined at the top of each page file (or co-located if the page file is already large).

| Page | Skeleton Shape |
|------|---------------|
| Home | 4 stat cards + NBA list (3 items) + signal cards (3) + meeting list (2) + activity feed (3) |
| Queue | Already exists — refactor to use Skeleton primitives |
| Signals | Filter bar + 4 signal cards |
| Leads | 3 kanban columns with 2 card placeholders each |
| Accounts | Search bar + 6 table rows |
| Pipeline | Stage header row + 4 deal cards |
| Pipeline Detail | Header + stat row + activity list |
| Inbox | 5 email row skeletons |
| Tasks | 2 goal groups with 3 task rows each |
| Account Detail | Header + tabs + contact list + activity feed |

Note: Settings page is excluded from skeleton/error state work — it has no API calls yet (deferred to E2-09). Only hardcoded timestamp cleanup applies to Settings.

Skeleton item counts are approximate layout hints — they should roughly match typical API response sizes but don't need to be exact.

### 3. ErrorState Component (`src/components/ui/index.tsx`)

```tsx
function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void })
```

- AlertTriangle icon from lucide-react (already a dependency)
- Default message: "Something went wrong"
- Optional "Try again" button calling `onRetry`
- Centered layout, uses `--sub` for text, `--brand` for button
- Consistent with existing EmptyState component styling

### 4. Page Integration Pattern

Every page follows this pattern in its render:

```tsx
const { data, isLoading, isError, refetch } = usePageQuery();

if (isLoading) return <PageSkeleton />;
if (isError) return <ErrorState onRetry={() => refetch()} />;
// ... normal render
```

Pages that already have inline skeletons (Home, Queue) will be refactored to use the new primitives.

### 5. Hardcoded Value Removal (UX-08)

| Location | Current | Replacement |
|----------|---------|-------------|
| Home greeting | `"Juuso"` | `session?.user?.name?.split(' ')[0] ?? 'there'` |
| TopBar avatar initials | `"JK"` (line ~29) | Session-derived initials |
| Settings "Last run" timestamps | `"2 hours ago"` | `"—"` (placeholder until E2-09 wires Settings) |
| Any remaining hardcoded user names | Various | Session-derived values |

**Out of scope**: `src/lib/data.ts` contains hardcoded names ("Juuso Kari", "JK") but this file serves as seed/reference data for the database — not rendering code. It is intentionally excluded.

**Discovery step**: grep the codebase for hardcoded names, fake timestamps, and demo-specific strings before implementation.

## Files Changed

**New/modified components:**
- `src/components/ui/index.tsx` — add Skeleton, SkeletonText, SkeletonCard, ErrorState

**Pages modified (skeleton + error state):**
- `src/app/(dashboard)/page.tsx` — refactor existing skeleton to use primitives
- `src/app/(dashboard)/queue/page.tsx` — refactor existing QueueSkeleton
- `src/app/(dashboard)/signals/page.tsx` — add skeleton + error state
- `src/app/(dashboard)/leads/page.tsx` — add skeleton + error state
- `src/app/(dashboard)/accounts/page.tsx` — add skeleton + error state
- `src/app/(dashboard)/accounts/[id]/page.tsx` — add skeleton + error state
- `src/app/(dashboard)/pipeline/page.tsx` — add skeleton + error state
- `src/app/(dashboard)/pipeline/[id]/page.tsx` — add skeleton + error state
- `src/app/(dashboard)/inbox/page.tsx` — add skeleton + error state
- `src/app/(dashboard)/tasks/page.tsx` — add skeleton + error state
**Hardcoded value fixes:**
- `src/app/(dashboard)/page.tsx` — dynamic greeting
- `src/components/layout/TopBar.tsx` — session-derived avatar initials
- `src/app/(dashboard)/settings/page.tsx` — remove fake "Last run" values
- Any other files found by grep

**Cleanup:**
- Remove `.shimmer` CSS class from `globals.css` after Queue refactoring (replaced by `animate-pulse` primitives)

## Testing

- Visual: every page shows skeleton on slow network (React Query devtools can simulate)
- Error: disconnect DB or block API → every page shows ErrorState with working retry
- Hardcoded: grep for "Juuso", "JK", "2 hours ago", "Last run" returns zero hits in page files

## Dependencies

- No new packages needed (lucide-react AlertTriangle already available)
- React Query hooks already exist for all pages
- Session data available via `useSession()` from next-auth/react
