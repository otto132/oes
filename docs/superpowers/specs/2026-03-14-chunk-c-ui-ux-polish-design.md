# Chunk C: UI/UX Polish, Mobile, & Maintenance

> **Date:** 2026-03-14
> **Status:** Approved
> **Scope:** 12 items (7 backlog + 5 new from audit)
> **Skipped:** #36 (signal detail drawer) and #47 (agent pause/resume) — already implemented

---

## Items

| # | Title | Type | Effort |
|---|-------|------|--------|
| 27 | WCAG contrast fix for `--muted` | CSS | 1 |
| 30 | Task comment input in drawer | Frontend | 2 |
| 34 | Auto-archive stale signals | Backend | 2 |
| 40 | Sensitive data logging review | Backend | 1 |
| 48 | Seed data relative dates | Backend | 2 |
| 50 | Health endpoint enhancement | Backend | 1 |
| 53 | Empty state CTAs | Frontend | 2 |
| C-8 | Tasks page mobile responsiveness | Frontend | 3 |
| C-9 | Drawer mobile polish (all drawers) | Frontend | 2 |
| C-10 | Edit Task drawer improvements | Frontend | 2 |
| C-11 | Close Won/Lost drawer improvements | Frontend | 2 |
| C-12 | Aria-labels on icon-only buttons | Frontend | 1 |

**Total effort:** ~21 points

---

## 1. WCAG Contrast Fix (#27)

### Problem
Dark mode `--muted` is `#52525b` on `#09090b` background (~4.1:1 contrast ratio). Fails WCAG AA for normal text (requires 4.5:1).

### Change
In `src/app/globals.css`, change the `.dark` selector:
```css
/* Before */
--muted: #52525b;

/* After */
--muted: #71717a;
```

Zinc-500 (`#71717a`) on `#09090b` gives ~5.4:1 ratio, passing WCAG AA.

Light mode `#868e96` already passes (~5.7:1). No change needed.

### Files
- `src/app/globals.css` (1 line)

### Acceptance
- Dark mode muted text meets 4.5:1 contrast ratio
- No visual regression on pages using `--muted` (labels, badges, descriptions)

---

## 2. Task Comment Input (#30)

### Problem
Task Detail drawer shows existing comments but has no input to add new ones. The backend API (`POST /api/tasks` with action `'comment'`), Prisma model (`TaskComment`), adapter (`adaptTaskComment`), and React Query mutation (`useCommentOnTask`) all exist.

### Change
Add a comment input form at the bottom of the comments section in the Task Detail drawer (`tasks/page.tsx`, `openTaskDetail` function, ~line 494).

**UI:**
- Textarea (2 rows, auto-expand) with placeholder "Add a comment..."
- Submit button (arrow icon) aligned right
- Cmd/Ctrl+Enter to submit
- Optimistic update: show comment immediately with loading indicator
- Clear input on successful submission

**Wiring:**
- Use existing `useCommentOnTask()` mutation hook
- Pass `taskId` and `text` to mutation
- Invalidate task query on success (already handled by hook)

### Files
- `src/app/(dashboard)/tasks/page.tsx` — add comment input in `openTaskDetail`

### Acceptance
- User can type and submit comments in task detail drawer
- Comment appears immediately (optimistic)
- Keyboard shortcut works (Cmd/Ctrl+Enter)
- Input clears after submission

---

## 3. Auto-Archive Stale Signals (#34)

### Problem
Signals with status `new_signal` accumulate indefinitely. Only `dismissed` signals older than 180 days are cleaned up by the weekly retention cron.

### Change
In `src/lib/retention.ts`, add a new pass before the existing dismissed cleanup:

```typescript
// Auto-dismiss signals older than 90 days that are still new_signal
const staleSignals = await db.signal.updateMany({
  where: {
    status: 'new_signal',
    detectedAt: { lt: new Date(now.getTime() - 90 * 864e5) },
  },
  data: { status: 'dismissed' },
});
```

Uses `updateMany` (not delete). Signals remain accessible via the dismissed filter. The existing 180-day deletion pass will eventually clean them up.

The `DataRetentionRun` model tracks `dismissedSignals` which currently counts deleted dismissed signals. The auto-dismiss count will be logged separately via `logger.info()` in the retention function but NOT added to the `dismissedSignals` counter (which tracks deletions, not status transitions). This avoids conflating two different metrics.

### Files
- `src/lib/retention.ts` (~8 lines)

### Acceptance
- Signals with status `new_signal` older than 90 days are auto-dismissed on weekly cron
- Dismissed signals remain queryable
- Count of auto-dismissed signals logged via `logger.info()`

---

## 4. Sensitive Data Logging (#40)

### Problem
Two locations use raw `console.error()` bypassing the logger utility's redaction:
1. `src/app/api/queue/route.ts` line 274: `console.error('Chain coordinator error:', err)`
2. `src/lib/integrations/run-sync.ts` line 154: `console.error(...)` in catch block

The logger at `src/lib/logger.ts` has regex-based redaction for tokens, secrets, passwords, API keys.

### Change
Replace both `console.error()` calls with `logger.error()`:
1. Queue route: `logger.error('Chain coordinator error', { error: err })`
2. Run-sync: `logger.error('Sync error', { error: err })`

### Files
- `src/app/api/queue/route.ts` (1 line)
- `src/lib/integrations/run-sync.ts` (1 line)

### Acceptance
- Zero raw `console.error()` calls in API routes and integration code
- All error logging goes through the redaction pipeline

---

## 5. Seed Data Relative Dates (#48)

### Problem
All seed dates in `prisma/seed.ts` are hardcoded to March 2026. Once that date passes, seed data will appear entirely in the past (or future dates will be wrong).

### Change
Add date helper functions at the top of `prisma/seed.ts`:

```typescript
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
const daysFromNow = (n: number) => new Date(now.getTime() + n * 864e5);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 36e5);
```

Replace all hardcoded dates with relative equivalents. Mapping:
- Signal `detectedAt` values → `daysAgo(1)` through `daysAgo(4)`
- Account `lastActivityAt` → `daysAgo(5)` through `daysAgo(24)`
- Opportunity `closeDate` → `daysFromNow(30)` through `daysFromNow(120)`
- Opportunity `nextActionDate` → `daysFromNow(1)` through `daysFromNow(7)`
- Task `due` dates → `daysAgo(4)` through `daysFromNow(7)`
- Task comment `createdAt` → `daysAgo(5)` through `daysAgo(1)`
- Activity `createdAt` → `daysAgo(1)` through `daysAgo(4)`
- Email `receivedAt` → `hoursAgo(2)` through `daysAgo(4)`
- Meeting `date`/`startTime` → `daysFromNow(0)` through `daysFromNow(3)`
- Queue item `createdAt` → `daysAgo(1)` through `daysAgo(3)`

### Files
- `prisma/seed.ts`

### Acceptance
- Zero hardcoded date strings in seed file
- `npx prisma db seed` produces data with dates relative to current date
- Meetings appear in "today's schedule" on home dashboard

---

## 6. Health Endpoint Enhancement (#50)

### Problem
Health endpoint returns only `{ status, db, version }`. Not enough for monitoring services to track trends.

### Change
Enhance `src/app/api/health/route.ts`:

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

export async function HEAD() {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
```

### Files
- `src/app/api/health/route.ts`

### Acceptance
- GET returns db latency, memory, uptime, timestamp
- HEAD returns 200/503 for lightweight pings
- Compatible with UptimeRobot, Better Uptime, etc.

---

## 7. Empty State CTAs (#53)

### Problem
11 empty states across the app show text only. No actionable buttons to help users take the next step.

### Change

**Enhance EmptyState component** in `src/components/ui/index.tsx`:

```typescript
interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}
```

Add optional button below description, styled as a subtle brand-colored link button.

**Add CTAs to these empty states:**

| Page | Empty State | CTA Label | Action |
|------|-------------|-----------|--------|
| Leads | "No active leads" | "Create Lead" | Open new lead drawer |
| Pipeline | "No open opportunities" | "Create Opportunity" | Open new opportunity drawer |
| Tasks | "No reviews pending" / "All tasks complete" | "Create Task" | Open new task drawer |
| Accounts > Contacts | "No contacts" | "Add Contact" | Open add contact drawer |
| Accounts > Opportunities | "No opportunities" | "Create Opportunity" | Open new opportunity drawer |
| Accounts > Tasks | "No open tasks" | "Create Task" | Open new task drawer |

**No CTAs for:** Signals (agent-driven), Inbox (email-driven), Queue (agent-driven), Accounts > Activity (event-driven).

### Files
- `src/components/ui/index.tsx` — enhance EmptyState
- `src/app/(dashboard)/leads/page.tsx`
- `src/app/(dashboard)/pipeline/page.tsx`
- `src/app/(dashboard)/tasks/page.tsx`
- `src/app/(dashboard)/accounts/[id]/page.tsx`

### Acceptance
- EmptyState component accepts optional `action` prop
- 6 empty states show CTA buttons
- Clicking CTA opens the appropriate creation drawer
- Button styling consistent with app design language

---

## 8. Tasks Page Mobile Responsiveness (C-8)

### Problem
Tasks page has zero responsive breakpoints. Touch targets are too small, layout doesn't adapt to 375px screens.

### Changes

**Header (lines 561-575):**
- Stack vertically on mobile: `flex-col sm:flex-row`
- "New Task" button full width on mobile: `w-full sm:w-auto`

**Tab navigation (lines 578-592):**
- Reduce tab padding on mobile: `px-2.5 sm:px-3.5`
- Add gradient fade hint on scroll overflow edges
- Ensure tab bar doesn't push content off-screen

**Search + toggle bar (lines 595-600):**
- Search full width on mobile: `w-full sm:max-w-[240px]`
- Stack "Show completed" below search on mobile: `flex-col sm:flex-row`

**Task checkboxes (line 540):**
- Keep visual size at `w-4 h-4` but wrap in a `w-10 h-10` transparent touch target
- Add `active:scale-95` feedback for touch

**Goal group headers (line 618):**
- Progress bar: `flex-1` instead of fixed `w-20`
- Text remains as-is (already compact)

**General:**
- Add `min-h-[44px]` to all interactive rows for touch compliance
- Ensure `px-4` body padding on mobile is sufficient

### Files
- `src/app/(dashboard)/tasks/page.tsx`

### Acceptance
- Tasks page usable at 375px width
- All touch targets minimum 44px
- Tab navigation scrollable with visual indicator
- Search and controls don't overflow
- Visual test on mobile viewport

---

## 9. Drawer Mobile Polish (C-9)

### Problem
All 20+ drawers share common mobile issues: tiny form inputs (`text-[12px]`), small labels (`text-[10px]`), non-stacking footer buttons, and no scroll indicators.

### Changes

**Drawer.tsx component:**
- Ensure body section has `overflow-y-auto` with momentum scrolling
- Footer sticky at bottom with `flex-shrink-0`

**Form input pattern (applied across all drawer forms):**
- Input text: `text-[12px] sm:text-sm` (12px desktop, 14px mobile for comfortable typing)
- Labels: minimum `text-[11px]` (up from `text-[10px]`)
- Input padding: `px-2.5 py-2 sm:py-1.5` (taller touch targets on mobile)

**Footer button pattern:**
- Stack on mobile: `flex-col-reverse sm:flex-row` (primary action on top when stacked)
- Full width buttons on mobile: `w-full sm:w-auto`
- Minimum button height: `min-h-[44px] sm:min-h-0`

These are pattern changes applied to all drawer form implementations.

### Files
- `src/components/shell/Drawer.tsx` — scroll and footer layout
- `src/app/(dashboard)/tasks/page.tsx` — new task, edit task, complete task, task detail drawers
- `src/app/(dashboard)/leads/page.tsx` — new lead, convert lead drawers
- `src/app/(dashboard)/pipeline/page.tsx` — new opportunity drawer
- `src/app/(dashboard)/pipeline/[id]/page.tsx` — close won, close lost drawers
- `src/app/(dashboard)/accounts/page.tsx` — new account drawer
- `src/app/(dashboard)/accounts/[id]/page.tsx` — log activity, add/edit contact, edit account, new opportunity drawers
- `src/app/(dashboard)/inbox/page.tsx` — email detail drawer
- `src/app/(dashboard)/signals/page.tsx` — signal detail, convert signal drawers
- `src/app/(dashboard)/settings/page.tsx` — invite team member drawer
- `src/app/(dashboard)/queue/page.tsx` — edit & approve drawer

### Acceptance
- Drawer forms comfortable to use on mobile
- Footer buttons stack vertically on small screens
- Inputs are large enough for thumb typing
- Scrolling works smoothly with visible footer

---

## 10. Edit Task Drawer Improvements (C-10)

### Problem
Edit Task drawer (tasks/page.tsx lines 349-451) only allows editing title, priority, and due date. Can't reassign assignees or reviewer. No notes field.

### Schema Change Required
The Task model has no `notes` field. Add:
```prisma
model Task {
  // ... existing fields ...
  notes       String?   @db.Text
}
```
Run `npx prisma migrate dev --name add-task-notes`.

### API Changes Required
- `src/lib/schemas/tasks.ts` — add `notes: z.string().optional()` to `patchTaskSchema`
- `src/app/api/tasks/[id]/route.ts` — include `notes` in PATCH handler's Prisma update
- `src/lib/adapters.ts` — include `notes` in `adaptTask()` output

### UI Changes
Add to Edit Task drawer form:
- **Assignee selector:** Dropdown of team members (use existing `useTeamQuery()` from `src/lib/queries/settings.ts`). The Task model has `assignees User[]` (many-to-many), so use multi-select.
- **Reviewer selector:** Same dropdown, single-select. Task model has `reviewerId String?`.
- **Notes textarea:** 3-row textarea for task context. Maps to new `notes` field.

The task PATCH API already accepts `assigneeIds` and `reviewerId` fields. Only `notes` is new.

### Files
- `prisma/schema.prisma` — add `notes` field to Task model
- `src/lib/schemas/tasks.ts` — add `notes` to `patchTaskSchema`
- `src/app/api/tasks/[id]/route.ts` — include `notes` in PATCH update
- `src/lib/adapters.ts` — include `notes` in `adaptTask()`
- `src/app/(dashboard)/tasks/page.tsx` — edit drawer UI

### Acceptance
- Edit Task drawer shows assignee, reviewer, and notes fields
- Changes persist via PATCH API
- Dropdowns populated from team members query
- Migration runs cleanly (no data loss — field is optional)

---

## 11. Close Won/Lost Drawer Improvements (C-11)

### Problem
Close Won drawer has only `winNotes` (textarea) and `competitorBeaten` (text). Close Lost has `lossReason` (select with 7 options), conditional `lossCompetitor`, and `lossNotes` (textarea). Both could capture more deal intelligence.

### Existing Opportunity Fields (no migration needed for these)
- `winNotes: String? @db.Text` — "What made us win"
- `competitorBeaten: String?` — competitor name
- `lossReason: String?` — loss reason select value
- `lossCompetitor: String?` — competitor that won
- `lossNotes: String? @db.Text` — "What can we learn"

### Schema Change Required
Add two new optional fields to the Opportunity model:
```prisma
model Opportunity {
  // ... existing fields ...
  lessonsLearned  String? @db.Text
  keyStakeholders String?
}
```
Run `npx prisma migrate dev --name add-opp-deal-intelligence`.

### API Changes Required
- `src/lib/schemas/opportunities.ts` — add `lessonsLearned` and `keyStakeholders` to `closeWonSchema` and `closeLostSchema`
- `src/app/api/opportunities/route.ts` — include new fields in close_won and close_lost handlers
- `src/lib/adapters.ts` — include new fields in `adaptOpportunity()`

### UI Changes

**Close Won drawer** — enhance existing form:
- Keep: "What made us win" (`winNotes`), "Competitor Beaten" (`competitorBeaten`)
- Add: "Key Stakeholders" (text input, maps to `keyStakeholders`) — who were the decision makers
- Add: "Lessons Learned" (textarea, maps to `lessonsLearned`) — what to replicate
- Note: "Revenue captured" is NOT added — the existing `amount` field already captures deal value; no need for a separate revenue field at close time.

**Close Lost drawer** — enhance existing form:
- Keep: Loss Reason select (`lossReason`, already has 7 options including Price/Timing/Competitor/No Budget/No Decision/Champion Left/Other)
- Keep: Conditional "Who did we lose to?" (`lossCompetitor`, shown when reason=Competitor)
- Keep: "What can we learn?" (`lossNotes`)
- Add: "Lessons Learned" (textarea, maps to `lessonsLearned`) — broader reflection beyond immediate learnings
- Note: The existing `lossNotes` ("What can we learn?") already covers the "Could we have won?" concept, so we don't add a duplicate field. Instead, rename the label to "What could we have done differently?" for clarity, keeping the same `lossNotes` field.

### Files
- `prisma/schema.prisma` — add `lessonsLearned`, `keyStakeholders` to Opportunity
- `src/lib/schemas/opportunities.ts` — update Zod schemas
- `src/app/api/opportunities/route.ts` — update close handlers
- `src/lib/adapters.ts` — update `adaptOpportunity()`
- `src/app/(dashboard)/pipeline/[id]/page.tsx` — close won/lost drawer UI

### Acceptance
- Close Won captures stakeholders and lessons alongside existing fields
- Close Lost captures lessons alongside existing reason/competitor/notes
- New fields optional (no breaking change)
- Migration runs cleanly
- All data persists via updated API handlers

---

## 12. Aria-Labels on Icon-Only Buttons (C-12)

### Problem
Multiple icon-only buttons across the app lack `aria-label`, making them invisible to screen readers.

### Changes

Add `aria-label` to:
- Drawer close button (`Drawer.tsx`) → `aria-label="Close drawer"`
- Sidebar collapse/expand toggle → `aria-label="Toggle sidebar"`
- Home dashboard schedule chevrons → `aria-label="Previous day"` / `aria-label="Next day"`
- Any pagination chevrons → `aria-label="Previous page"` / `aria-label="Next page"`
- Inbox unread indicator → `aria-label="Unread"` (or use `role="status"`)
- Search clear buttons → `aria-label="Clear search"`
- Any other icon-only `<button>` found during implementation

### Files
- `src/components/shell/Drawer.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/app/(dashboard)/page.tsx`
- Other pages as discovered during implementation

### Acceptance
- Zero icon-only buttons without `aria-label`
- Screen reader announces button purpose
- No visual change

---

## Schema Migrations Required

Two migrations are needed. Run in this order:

1. **`add-task-notes`** — adds `notes String? @db.Text` to Task model
2. **`add-opp-deal-intelligence`** — adds `lessonsLearned String? @db.Text` and `keyStakeholders String?` to Opportunity model

Both are additive (new optional fields). No data loss. No breaking changes.

---

## Dependencies

- #27, C-12 (CSS/aria) — no dependencies, can go first
- #34, #40, #48, #50 — backend items, independent of each other
- #53 — depends on knowing drawer open functions per page
- C-8, C-9 — mobile work, C-9 should go after C-8 (task-specific first, then global pattern)
- C-10 — requires migration 1 (add-task-notes) before UI work
- C-11 — requires migration 2 (add-opp-deal-intelligence) before UI work
- #30 — task comments, independent

---

## Backlog Updates

After completion, mark these as Done in `docs/BACKLOG.md`:
- #27, #30, #34, #40, #48, #50, #53
- #36 (already done), #47 (already done)

Items C-8 through C-12 are new scope not in the original backlog.
