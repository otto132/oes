# Chunk C: UI/UX Polish, Mobile & Maintenance — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 12 improvements covering WCAG accessibility, mobile responsiveness, drawer enhancements, empty state CTAs, and backend maintenance across the CRM.

**Architecture:** Three parallel batches: (1) independent backend + CSS/aria changes, (2) drawer content improvements requiring schema migrations, (3) mobile responsive polish. Each task is self-contained and commits independently.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 3.4, Prisma 6.19, Zustand, TanStack React Query 5

**Spec:** `docs/superpowers/specs/2026-03-14-chunk-c-ui-ux-polish-design.md`

---

## Chunk 1: Backend & Foundations (Independent — all parallelizable)

### Task 1: Schema Migrations

Both migrations must complete before Tasks 8-9 can start. Run them together.

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `notes` field to Task model**

In `prisma/schema.prisma`, inside the `Task` model (after line 485 `completedAt`), add:

```prisma
  notes       String?   @db.Text
```

- [ ] **Step 2: Add `lessonsLearned` and `keyStakeholders` to Opportunity model**

In `prisma/schema.prisma`, inside the `Opportunity` model (after line 422 `lossNotes`), add:

```prisma
  // Deal intelligence
  lessonsLearned  String? @db.Text
  keyStakeholders String?
```

- [ ] **Step 3: Generate and apply migrations**

Run:
```bash
npx prisma migrate dev --name add-task-notes-and-opp-deal-intelligence
```

Expected: Migration created and applied. No data loss (all fields optional).

- [ ] **Step 4: Verify Prisma client regenerated**

Run:
```bash
npx prisma generate
```

Expected: "Generated Prisma Client" success message.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "db: add task notes and opportunity deal intelligence fields"
```

---

### Task 2: WCAG Contrast Fix (#27)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update `--muted` in dark mode**

In `src/app/globals.css`, in the `.dark` selector, change:

```css
/* Old */
--muted: #52525b;

/* New */
--muted: #71717a;
```

This bumps contrast from ~4.1:1 to ~5.4:1 on `#09090b` background, passing WCAG AA.

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "a11y: fix WCAG AA contrast ratio for --muted in dark mode (#27)"
```

---

### Task 3: Auto-Archive Stale Signals (#34)

**Files:**
- Modify: `src/lib/retention.ts`

- [ ] **Step 1: Add stale signal auto-dismiss logic**

In `src/lib/retention.ts`, add this block BEFORE the existing `dismissedSignals` deletion (before line 38). Insert after the `archivedEmails` block:

```typescript
  // ── Auto-dismiss stale new signals (>90 days) ──────────────
  const staleSignalCutoff = new Date(now.getTime() - 90 * 864e5);
  const staleSignals = await db.signal.updateMany({
    where: {
      status: 'new_signal',
      detectedAt: { lt: staleSignalCutoff },
    },
    data: { status: 'dismissed' },
  });
  if (staleSignals.count > 0) {
    logger.info(`Auto-dismissed ${staleSignals.count} stale signals (>90 days)`);
  }
```

Make sure `logger` is imported at the top of the file. Check if it already is — if not, add:

```typescript
import { logger } from '@/lib/logger';
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/retention.ts
git commit -m "feat: auto-dismiss stale signals older than 90 days (#34)"
```

---

### Task 4: Sensitive Data Logging (#40)

**Files:**
- Modify: `src/app/api/queue/route.ts`
- Modify: `src/lib/integrations/run-sync.ts`

- [ ] **Step 1: Fix queue route logging**

In `src/app/api/queue/route.ts`, find the `console.error('Chain coordinator error:', err)` call (around line 274). Replace with:

```typescript
logger.error('Chain coordinator error', { error: err instanceof Error ? err.message : String(err) });
```

Ensure `logger` is imported at the top. Check existing imports — if `logger` is not imported, add:

```typescript
import { logger } from '@/lib/logger';
```

- [ ] **Step 2: Fix run-sync logging**

In `src/lib/integrations/run-sync.ts`, find the `console.error` in the `createSyncFailureAlert` catch block (around line 154). Replace with:

```typescript
logger.error('Failed to create sync failure alert', { error: err instanceof Error ? err.message : String(err) });
```

Ensure `logger` is imported at the top. If not, add:

```typescript
import { logger } from '@/lib/logger';
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/queue/route.ts src/lib/integrations/run-sync.ts
git commit -m "fix: route error logging through redaction pipeline (#40)"
```

---

### Task 5: Seed Data Relative Dates (#48)

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add date helper functions**

At the top of `prisma/seed.ts` (after imports, before the `main()` function), add:

```typescript
// ── Relative date helpers (seed data stays fresh regardless of run date) ──
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 864e5);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 36e5);
```

- [ ] **Step 2: Replace all hardcoded dates**

Search for every `new Date('2026-` in the file and replace with relative equivalents. Use this mapping:

**Signals** (`detectedAt`): Replace dates with `daysAgo(3)`, `daysAgo(4)`, `daysAgo(2)`, `daysAgo(1)` etc. (keep the relative ordering similar to what's there).

**Accounts** (`lastActivityAt`): Replace with `daysAgo(24)`, `daysAgo(5)`, `daysAgo(14)`, `daysAgo(9)` etc.

**Opportunities** (`closeDate`): Replace future dates with `daysFromNow(108)`, `daysFromNow(78)`, `daysFromNow(48)` etc. Replace `nextActionDate` with `daysFromNow(1)`, `daysFromNow(3)` etc.

**Tasks** (`due`): Replace with `daysAgo(4)`, `daysFromNow(4)`, `daysFromNow(7)`, `daysAgo(1)` etc.

**Comments** (`createdAt`): Replace with `daysAgo(5)`, `daysAgo(3)`, `daysAgo(1)` etc.

**Activities** (`createdAt`): Replace with `daysAgo(4)`, `daysAgo(3)`, `daysAgo(2)`, `daysAgo(1)` etc.

**Inbox** (`receivedAt`): Replace with `daysAgo(4)`, `daysAgo(3)`, `hoursAgo(8)`, `hoursAgo(2)` etc.

**Meetings** (`date`/`startTime`): Replace with `daysFromNow(0)` (today), `daysFromNow(1)`, `daysFromNow(3)` etc.

**Queue items** (`createdAt`): Replace with `daysAgo(3)`, `daysAgo(2)`, `daysAgo(1)` etc.

The exact relative offsets should preserve the original ordering and intent (e.g., "recent signals" stay recent, "upcoming meetings" stay upcoming).

- [ ] **Step 3: Verify no hardcoded dates remain**

Run:
```bash
grep -n "new Date('2026-" prisma/seed.ts
```

Expected: Zero matches.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix: use relative dates in seed data for evergreen dev (#48)"
```

---

### Task 6: Health Endpoint Enhancement (#50)

**Files:**
- Modify: `src/app/api/health/route.ts`

- [ ] **Step 1: Enhance GET handler**

Replace the existing GET function in `src/app/api/health/route.ts` with:

```typescript
export async function GET() {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      version: '0.2.0',
      dbLatencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1048576),
        heap: Math.round(process.memoryUsage().heapUsed / 1048576),
      },
    });
  } catch {
    return NextResponse.json(
      { status: 'error', db: 'disconnected', version: '0.2.0' },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 2: Add HEAD handler**

After the GET function, add:

```typescript
export async function HEAD() {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat: enhance health endpoint with latency, memory, uptime (#50)"
```

---

### Task 7: Aria-Labels on Icon-Only Buttons (C-12)

**Files:**
- Modify: `src/components/shell/Drawer.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Drawer close button**

In `src/components/shell/Drawer.tsx`, find the close button (around line 19) which renders an `<X />` icon. Add `aria-label="Close drawer"` to the `<button>`.

- [ ] **Step 2: Sidebar icon buttons**

In `src/components/layout/Sidebar.tsx`, find any icon-only buttons:
- Sign out button (around line 114-117): already has text "Sign Out" so no aria-label needed
- Search button: already has text "Search" so no aria-label needed
- Look for any collapse/expand toggle — add `aria-label="Toggle sidebar"` if icon-only

- [ ] **Step 3: Dashboard schedule chevrons**

In `src/app/(dashboard)/page.tsx`, find the chevron buttons (around lines 227 and 229):
- Left chevron: Add `aria-label="Previous day"`
- Right chevron: Add `aria-label="Next day"`

- [ ] **Step 4: Inbox unread indicator**

In `src/app/(dashboard)/inbox/page.tsx`, find the unread dot (around line 182). This is a `<div>` not a `<button>`, so add `role="status" aria-label="Unread"` when `e.isUnread` is true, otherwise no role needed.

- [ ] **Step 5: Scan for other icon-only buttons**

Search across all dashboard pages for `<button` elements that contain only icon components (no text). Add appropriate `aria-label` to any found.

Run:
```bash
grep -rn '<button.*className.*>\s*<[A-Z].*className.*w-[0-9]' src/app/ src/components/ | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/Drawer.tsx src/components/layout/Sidebar.tsx src/app/\(dashboard\)/page.tsx src/app/\(dashboard\)/inbox/page.tsx
git commit -m "a11y: add aria-labels to icon-only buttons across the app (C-12)"
```

---

## Chunk 2: Drawer Content Improvements (depends on Task 1 migrations)

### Task 8: Edit Task Drawer — Assignees, Reviewer, Notes (C-10)

**Files:**
- Modify: `src/lib/schemas/tasks.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/lib/adapters.ts`
- Modify: `src/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Update Zod schema**

In `src/lib/schemas/tasks.ts`, add `notes` to the `patchTaskSchema`. Find the existing schema object and add:

```typescript
notes: z.string().optional(),
```

alongside the existing `title`, `priority`, `due`, `assigneeIds`, `reviewerId` fields.

- [ ] **Step 2: Update PATCH API handler**

In `src/app/api/tasks/[id]/route.ts`, find the Prisma update call. Ensure `notes` from the validated body is included in the `data` object passed to `prisma.task.update()`.

- [ ] **Step 3: Update adapter**

In `src/lib/adapters.ts`, find the `adaptTask()` function (around line 274). Add `notes: t.notes ?? undefined` to the returned object.

- [ ] **Step 4: Update Edit Task drawer UI**

In `src/app/(dashboard)/tasks/page.tsx`, find the `openEditTaskDrawer` function (around line 349). Add three new form fields after the existing due date field:

**Notes textarea:**
```tsx
<label className="flex flex-col gap-1">
  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Notes</span>
  <textarea
    defaultValue={task.notes ?? ''}
    onChange={e => { state.notes = e.target.value; }}
    rows={3}
    placeholder="Add context or details..."
    className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
  />
</label>
```

**Assignees multi-select:** Use the team members from `useTeamQuery()` (import from `src/lib/queries/settings.ts`). Render as a list of checkboxes or a multi-select dropdown showing team member names. Initialize with current `task.assignees` IDs.

**Reviewer single-select:** Render as a `<select>` dropdown with team member options. Include an empty "None" option. Initialize with current `task.reviewerId`.

Update the `state` object to include `notes`, `assigneeIds`, and `reviewerId`.

Update the mutation `onSubmit` to pass all new fields to the PATCH API.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/tasks.ts src/app/api/tasks/\[id\]/route.ts src/lib/adapters.ts src/app/\(dashboard\)/tasks/page.tsx
git commit -m "feat: add notes, assignee, and reviewer fields to Edit Task drawer (C-10)"
```

---

### Task 9: Close Won/Lost Drawer Improvements (C-11)

**Files:**
- Modify: `src/lib/schemas/opportunities.ts`
- Modify: `src/app/api/opportunities/route.ts`
- Modify: `src/lib/adapters.ts`
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

- [ ] **Step 1: Update Zod schemas**

In `src/lib/schemas/opportunities.ts`:

For the `close_won` variant (around line 14), add:
```typescript
keyStakeholders: z.string().optional(),
lessonsLearned: z.string().optional(),
```

For the `close_lost` variant (around line 16-21), add:
```typescript
lessonsLearned: z.string().optional(),
```

- [ ] **Step 2: Update API close handlers**

In `src/app/api/opportunities/route.ts`:

**close_won handler** (around line 101-117): Add `keyStakeholders` and `lessonsLearned` to the Prisma `update` data object:
```typescript
keyStakeholders: body.keyStakeholders,
lessonsLearned: body.lessonsLearned,
```

**close_lost handler** (around line 120-135): Add `lessonsLearned` to the Prisma `update` data object:
```typescript
lessonsLearned: body.lessonsLearned,
```

- [ ] **Step 3: Update adapter**

In `src/lib/adapters.ts`, find `adaptOpportunity()` (around line 222). Add:
```typescript
lessonsLearned: o.lessonsLearned ?? undefined,
keyStakeholders: o.keyStakeholders ?? undefined,
```

Also add these fields to the `Opportunity` type in `src/lib/types.ts` if not already present:
```typescript
lessonsLearned?: string;
keyStakeholders?: string;
```

- [ ] **Step 4: Enhance Close Won drawer UI**

In `src/app/(dashboard)/pipeline/[id]/page.tsx`, find `openCloseWonDrawer()` (line 129).

Add `keyStakeholders` and `lessonsLearned` to the state object (line 130):
```typescript
const state = { winNotes: '', competitorBeaten: '', keyStakeholders: '', lessonsLearned: '' };
```

After the existing "Competitor Beaten" input (around line 152), add:

```tsx
<label className="flex flex-col gap-1">
  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Key Stakeholders (optional)</span>
  <input
    onChange={e => { state.keyStakeholders = e.target.value; }}
    placeholder="e.g. CTO Jane Doe, VP Sales John Smith"
    className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
  />
</label>
<label className="flex flex-col gap-1">
  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Lessons Learned (optional)</span>
  <textarea
    onChange={e => { state.lessonsLearned = e.target.value; }}
    rows={2}
    placeholder="What should we replicate in future deals?"
    className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
  />
</label>
```

Pass `keyStakeholders` and `lessonsLearned` in the mutation call.

- [ ] **Step 5: Enhance Close Lost drawer UI**

In `openCloseLostDrawer()` (line 190), add `lessonsLearned` to state:
```typescript
const state = { lossReason: '', lossCompetitor: '', lossNotes: '', lessonsLearned: '' };
```

Rename the "What can we learn?" label to "What could we have done differently?" (line 230, keep the same `lossNotes` field).

After the existing notes textarea, add:

```tsx
<label className="flex flex-col gap-1">
  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Lessons Learned (optional)</span>
  <textarea
    onChange={e => { state.lessonsLearned = e.target.value; }}
    rows={2}
    placeholder="Broader takeaways for the team..."
    className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
  />
</label>
```

Pass `lessonsLearned` in the mutation call.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/opportunities.ts src/app/api/opportunities/route.ts src/lib/adapters.ts src/lib/types.ts src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat: add deal intelligence fields to Close Won/Lost drawers (C-11)"
```

---

### Task 10: Task Comment Input (#30)

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Add comment input to Task Detail drawer**

In `src/app/(dashboard)/tasks/page.tsx`, find the `openTaskDetail` function (around line 453). Locate the comments section (around lines 495-504) where existing comments are rendered.

After the comments list, add a comment input form. This needs to be a React component rendered inside the drawer body so that it can use the `useCommentOnTask` hook.

Create a small inline `CommentInput` component at the top of the file (or as a closure inside the page component) that:

```tsx
function CommentInput({ taskId }: { taskId: string }) {
  const [text, setText] = useState('');
  const comment = useCommentOnTask();

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    comment.mutate(
      { taskId, text: trimmed },
      { onSuccess: () => setText('') }
    );
  };

  return (
    <div className="mt-3 flex gap-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="Add a comment... (Cmd+Enter to send)"
        className="flex-1 px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
      />
      <button
        onClick={submit}
        disabled={!text.trim() || comment.isPending}
        className="self-end px-2.5 py-1.5 text-[12px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {comment.isPending ? <Spinner className="h-3 w-3" /> : 'Send'}
      </button>
    </div>
  );
}
```

**Important:** Since `openDrawer` takes a `body` ReactNode and the Drawer renders it outside the component that called `openDrawer`, you need to make sure the comment input is a proper React component that can use hooks. The `body` prop of `openDrawer` accepts JSX, so render `<CommentInput taskId={task.id} />` inside the drawer body JSX.

- [ ] **Step 2: Wire into the drawer body**

Inside the `openTaskDetail` function, in the drawer body JSX where comments are rendered, add `<CommentInput taskId={task.id} />` after the comments list.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/tasks/page.tsx
git commit -m "feat: add comment input to task detail drawer (#30)"
```

---

### Task 11: Empty State CTAs (#53)

**Files:**
- Modify: `src/components/ui/index.tsx`
- Modify: `src/app/(dashboard)/leads/page.tsx`
- Modify: `src/app/(dashboard)/pipeline/page.tsx`
- Modify: `src/app/(dashboard)/tasks/page.tsx`
- Modify: `src/app/(dashboard)/accounts/[id]/page.tsx`

- [ ] **Step 1: Enhance EmptyState component**

In `src/components/ui/index.tsx`, find the `EmptyState` component (around line 145). Update it to accept an optional `action` prop:

```tsx
export function EmptyState({ icon, title, description, action }: {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="py-12 px-6 text-center">
      <div className="text-2xl mb-2 opacity-30">{icon}</div>
      <div className="text-[13px] font-medium text-sub mb-1">{title}</div>
      <div className="text-[12px] text-muted leading-relaxed max-w-[280px] mx-auto">{description}</div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-3 py-1.5 text-[12px] font-medium text-brand hover:text-brand/80 transition-colors"
        >
          + {action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CTA to Leads empty state**

In `src/app/(dashboard)/leads/page.tsx`, find the EmptyState for "No active leads" (around line 377). Add:

```tsx
action={{ label: 'Create Lead', onClick: () => openNewLeadDrawer() }}
```

(Use whatever the existing function name is for opening the new lead drawer.)

- [ ] **Step 3: Add CTA to Pipeline empty state**

In `src/app/(dashboard)/pipeline/page.tsx`, find the EmptyState for "No open opportunities" (around line 435). Add:

```tsx
action={{ label: 'Create Opportunity', onClick: () => openNewOppDrawer() }}
```

- [ ] **Step 4: Add CTA to Tasks empty state**

In `src/app/(dashboard)/tasks/page.tsx`, find the EmptyState (around line 603). Add:

```tsx
action={{ label: 'Create Task', onClick: () => openNewTaskDrawer() }}
```

- [ ] **Step 5: Add CTAs to Account Detail empty states**

In `src/app/(dashboard)/accounts/[id]/page.tsx`:

- Contacts empty state (around line 986): Add `action={{ label: 'Add Contact', onClick: () => openAddContactDrawer() }}`
- Opportunities empty state (around line 1023): Add `action={{ label: 'Create Opportunity', onClick: () => openNewOppDrawer(acct) }}`
- Tasks empty state (around line 1109): No CTA (tasks are created from the tasks page, not account detail)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/index.tsx src/app/\(dashboard\)/leads/page.tsx src/app/\(dashboard\)/pipeline/page.tsx src/app/\(dashboard\)/tasks/page.tsx src/app/\(dashboard\)/accounts/\[id\]/page.tsx
git commit -m "feat: add CTA buttons to empty states across the app (#53)"
```

---

## Chunk 3: Mobile Responsiveness

### Task 12: Tasks Page Mobile (C-8)

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Make header responsive**

Find the header `<div>` (around line 561) with `flex items-center justify-between`. Change to:

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3.5">
```

Make the "New Task" button full-width on mobile:
```tsx
<button className="w-full sm:w-auto px-3 py-1.5 text-[12px] ...">
```

- [ ] **Step 2: Make tab navigation responsive**

Find the tab buttons (around line 578-592). Reduce mobile padding:

```tsx
className={cn('px-2.5 sm:px-3.5 py-2 ...')}
```

- [ ] **Step 3: Make search bar responsive**

Find the search + toggle bar (around line 595-600). Make it stack:

```tsx
<div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2.5">
  <SearchInput ... className="w-full sm:max-w-[240px]" />
  ...
</div>
```

- [ ] **Step 4: Improve task checkbox touch targets**

Find the task checkbox `<div>` (around line 540) with `w-4 h-4`. Wrap it in a touch target:

```tsx
<div
  className="flex items-center justify-center w-10 h-10 -m-3 cursor-pointer active:scale-95"
  onClick={...}
>
  <div className={cn('w-4 h-4 rounded border-[1.5px] flex-shrink-0 ...')}>
    ...
  </div>
</div>
```

Adjust the parent row's padding to compensate for the larger touch target.

- [ ] **Step 5: Make goal progress bars responsive**

Find goal group headers (around line 618). Replace `w-20` on the progress bar with `flex-1 max-w-[80px]`:

```tsx
<div className="flex-1 max-w-[80px] h-[3px] rounded-full bg-[var(--surface)] overflow-hidden">
```

- [ ] **Step 6: Add min-height to task rows**

Find the TaskRow component (around line 529). Add `min-h-[44px]` to the outer container for touch compliance:

```tsx
<div className={cn('flex items-center gap-2.5 px-3.5 py-2.5 min-h-[44px] rounded-lg ...')}>
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/tasks/page.tsx
git commit -m "feat: make tasks page mobile-responsive with proper touch targets (C-8)"
```

---

### Task 13: Drawer Mobile Polish (C-9)

**Files:**
- Modify: `src/components/shell/Drawer.tsx`
- Modify: All 11 drawer-containing page files (see spec for full list)

- [ ] **Step 1: Update Drawer.tsx shell**

In `src/components/shell/Drawer.tsx`:

Ensure body section (around line 23) has momentum scrolling:
```tsx
<div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
```

Ensure footer (around line 24-26) has proper stacking on mobile:
```tsx
<div className="px-5 py-3 border-t border-[var(--border)] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-1.5 flex-shrink-0">
```

- [ ] **Step 2: Update drawer forms in tasks/page.tsx**

In `src/app/(dashboard)/tasks/page.tsx`, find ALL drawer form inputs and apply:

Labels: Change `text-[10px]` to `text-[11px]`
Inputs: Change `text-[12px]` to `text-[12px] sm:text-sm`
Input padding: Change `py-1.5` to `py-2 sm:py-1.5`
Footer buttons: Add `w-full sm:w-auto min-h-[44px] sm:min-h-0`

Apply to: New Task drawer, Edit Task drawer, Complete Task drawer.

- [ ] **Step 3: Update drawer forms in leads/page.tsx**

Same pattern for New Lead and Convert Lead drawers.

- [ ] **Step 4: Update drawer forms in pipeline/page.tsx and pipeline/[id]/page.tsx**

Same pattern for New Opportunity, Close Won, Close Lost drawers.

- [ ] **Step 5: Update drawer forms in accounts/page.tsx and accounts/[id]/page.tsx**

Same pattern for New Account, Log Activity, Add Contact, Edit Contact, Edit Account, New Opportunity drawers.

- [ ] **Step 6: Update drawer forms in inbox, signals, settings, queue pages**

Same pattern for Email detail, Signal detail, Convert Signal, Invite Team, Edit & Approve drawers.

- [ ] **Step 7: Commit**

```bash
git add src/components/shell/Drawer.tsx src/app/\(dashboard\)/
git commit -m "feat: mobile-polish all drawer forms with responsive inputs and stacking buttons (C-9)"
```

---

## Chunk 4: Finalization

### Task 14: Update Backlog & Verify

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Mark completed items in backlog**

In `docs/BACKLOG.md`, update the Status field for these items from `Open` to `Done`:
- #1, #2, #3, #4, #6, #10, #11, #13, #14, #20, #21, #22, #23, #24 (Chunk B items not yet marked)
- #27, #30, #34, #36, #40, #47, #48, #50, #53 (Chunk C items)

- [ ] **Step 2: Run build to verify no TypeScript errors**

Run:
```bash
npx next build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 3: Run tests**

Run:
```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add docs/BACKLOG.md
git commit -m "docs: mark Chunk B and Chunk C items as Done in backlog"
```
