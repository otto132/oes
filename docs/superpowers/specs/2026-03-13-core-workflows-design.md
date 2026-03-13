# Core Workflows Design Spec (W-01, W-02, W-04, W-07)

> Date: 2026-03-13
> Status: Draft
> Scope: Four frontend workflow features that make the CRM actionable

---

## Context

The backend API routes for queue approval, signal conversion, pipeline stage movement, and task creation already exist and are functional. The frontend is missing the wiring and UI forms to expose these capabilities to users. All four features follow the same implementation pattern: wire existing React Query mutations to UI elements using the existing Drawer and Toast system.

## Shared Enhancement: Toast with Action Link

**Current state:** Toast supports `{ type, message }` only.

**Change:** Extend the `Toast` interface to support an optional action:

```typescript
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; href: string };
}
```

The `ToastContainer` renders the action as a clickable link (using `next/link`) styled as an underlined text after the message. Clicking the link dismisses the toast, clears the auto-dismiss timer, and navigates. Toasts with an action link use a longer auto-dismiss duration (8s instead of 5s) to give users time to read and click.

**Files:** `src/components/ui/Toast.tsx`, `src/lib/store.ts` (update `addToast` signature)

## Shared Enhancement: Typed API Errors

**Current state:** The `post()` helper in `api-client.ts` throws a generic `Error` with the response message string. Status codes (e.g. 409 Conflict) are lost.

**Change:** Add an `ApiError` class that preserves the HTTP status code:

```typescript
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

Update `post()` and `get()` in `api-client.ts` to throw `ApiError` instead of plain `Error`. Mutation `onError` callbacks can then check `error instanceof ApiError && error.status === 409` to handle conflicts specifically.

**Files:** `src/lib/api-client.ts`

---

## W-01: Queue Approval with Visible Side-Effects

### Problem

When a user approves a queue item, the API creates entities (leads, tasks, activities, account updates) but the UI only shows a generic success state. The user cannot verify that the side-effect occurred or navigate to the created entity.

### Design

After `approve.mutate()` succeeds, fire a contextual toast based on the queue item type:

| Queue Type | Toast Message | Action Link |
|-----------|---------------|-------------|
| `lead_qualification` | "Lead created for {company}" | "View Lead →" → `/leads` |
| `task_creation` | "Task created: {title}" | "View Tasks →" → `/tasks` |
| `enrichment` | "Account updated: {field}" | "View Account →" → `/accounts/{accId}` |
| `outreach_draft` | "Outreach logged for {account}" | "View Account →" → `/accounts/{accId}` |

### Implementation

1. **API response check:** Verify the POST `/api/queue` approve response returns enough data to construct the toast (item type, payload fields, accId). Current code returns `{ data: adaptedQueueItem }` — the adapted item contains `type`, `payload`, `accName`, and `accId`, which is sufficient.

2. **Mutation `onSuccess` callback:** In the queue page (or in `useApproveQueueItem`), read the returned item and call `addToast()` with the appropriate message and action link.

3. **Defensive payload fallbacks:** Toast message construction must handle missing payload fields gracefully. Use `payload.company || item.accName || 'item'` for lead_qualification, `payload.task || item.title || 'task'` for task_creation, `payload.field || 'field'` for enrichment.

4. **Cross-query invalidation:** After approving, invalidate related queries so other pages reflect the change:
   - `lead_qualification` → invalidate `leadKeys.all`
   - `task_creation` → invalidate `taskKeys.all`
   - `enrichment` → invalidate `accountKeys.detail(accId)`
   - `outreach_draft` → invalidate `accountKeys.detail(accId)` (activity created, lastActivityAt updated)

### Files Changed

- `src/app/(dashboard)/queue/page.tsx` — add `onSuccess` toast logic
- `src/lib/queries/queue.ts` — add cross-query invalidation in `useApproveQueueItem`
- `src/components/ui/Toast.tsx` — add action link rendering
- `src/lib/store.ts` — update Toast type

---

## W-02: Signal → Lead Conversion

### Problem

The "→ Lead" button on signal cards and the "Convert to Lead" button in the signal detail drawer have no click handlers. The `useConvertSignal` mutation hook exists but is not wired to the UI.

### Design

**"→ Lead" button on card:** Opens a confirmation drawer with pre-filled form.

**Drawer form fields:**
- Company name (text input, pre-filled from signal companies array or signal title)
- Type (dropdown: "Energy Company", "Industrial", "Government", "Utility", "Unknown"; default: "Unknown")
- Country (text input, default: empty)

**Pre-fill logic:**
- Company: First entry from the signal's source data, or extract from signal title
- The signal object on the frontend has `title` and `src` — use title as the company name default

**Submit flow:**
1. Call `convertSignal.mutate({ id: signal.id, company, type, country })`
2. On success: toast "Lead created for {company}" with action `{ label: 'View Leads →', href: '/leads' }`, close drawer
3. On 409 error (detected via `ApiError.status === 409`): toast (error) "Lead or account already exists for {company}"
4. On other error: toast (error) "Failed to convert signal"
5. Invalidate `leadKeys.all` on success so the Leads page shows the new lead immediately.

**"→ Lead" button visibility:** Hide the button on signals with status `converted` (they already show a green check icon and reduced opacity).

**Detail drawer footer:** The "Convert to Lead" button in the signal detail drawer footer should close the detail drawer and open a new conversion drawer (simpler than swapping content in-place; consistent with re-calling `openDrawer()`).

### Files Changed

- `src/app/(dashboard)/signals/page.tsx` — wire "→ Lead" button, add conversion drawer form, wire detail drawer footer button

---

## W-04: Pipeline Close-Out Drawers

### Problem

The "Closed Won" and "Closed Lost" buttons on the opportunity detail page work but provide no form for capturing close-out details. Close Lost hardcodes reason as "Unknown".

### Design

**Close Won button:** Opens a drawer with:
- Win notes (textarea, optional, placeholder: "What made us win this deal?")
- Competitor beaten (text input, optional, placeholder: "e.g. Salesforce, HubSpot")
- "Close as Won" primary button

**Close Lost button:** Opens a drawer with:
- Loss reason (dropdown, required: "Price", "Timing", "Competitor", "No Budget", "No Decision", "Champion Left", "Other")
- Loss competitor (text input, optional, shows when reason is "Competitor", placeholder: "Who did we lose to?")
- Loss notes (textarea, optional, placeholder: "What can we learn from this?")
- "Close as Lost" danger-styled button

**Submit flow (both):**
1. Call existing `closeWon.mutate({ id, winNotes, competitorBeaten })` or `closeLost.mutate({ id, lossReason, lossCompetitor, lossNotes })`
2. On success: toast "Deal closed as Won ✓" or "Deal closed as Lost" + close drawer + refetch opportunity detail
3. On error: toast (error) "Failed to close deal"

**Stage move buttons:** Already functional — no changes needed.

### Files Changed

- `src/app/(dashboard)/pipeline/[id]/page.tsx` — replace direct mutation calls with drawer-opening handlers

Note: The existing `useCloseWon` and `useCloseLost` hooks already accept the correct fields (`winNotes`, `competitorBeaten`, `lossReason`, `lossCompetitor`, `lossNotes`). No changes needed to mutation hooks. All submit buttons must be disabled while `isPending` is true (consistent with existing queue approve pattern).

---

## W-07: Task Create Form

### Problem

There is no UI to create tasks. The API endpoint `POST /api/tasks` exists and accepts title, due, priority, accountId, assigneeIds, reviewerId, and goalId.

### Design

**Entry point:** "New Task" button in the tasks page header, positioned next to the search input.

**Drawer form fields:**
- Title (text input, required, placeholder: "What needs to be done?")
- Due date (date input, default: 7 days from now)
- Priority (dropdown: "High", "Medium", "Low"; default: "Medium")
- Account (optional dropdown, populated from accounts list via `useAccountsQuery`)
- Goal (optional dropdown, populated from `goals` array returned by `useTasksQuery` response — the GET `/api/tasks` endpoint already returns `{ data: { tasks, goals }, meta }`)

**Out of scope for v1:** Assignee selection and reviewer assignment. Tasks are auto-assigned to the current user (the API defaults `assigneeIds` to `[ownerId]`).

**Submit flow:**
1. Add `useCreateTask` mutation hook in `src/lib/queries/tasks.ts`
2. Call `createTask.mutate({ title, due, priority, accountId, goalId })`
3. On success: toast "Task created: {title}" with action `{ label: 'View →', href: '/tasks' }`, close drawer, invalidate tasks query
4. On error: toast (error) "Failed to create task"

**Account dropdown data:** Use a lightweight query — either the existing `useAccountsQuery` or a new minimal endpoint. Since accounts are already fetched on other pages, reusing the existing query with `staleTime` is sufficient.

### Files Changed

- `src/app/(dashboard)/tasks/page.tsx` — add "New Task" button, add creation drawer form
- `src/lib/queries/tasks.ts` — add `useCreateTask` mutation hook

---

## Out of Scope

- Edit & Approve on queue items (future)
- Drag-and-drop pipeline kanban (W-05, separate feature)
- Task complete with follow-ups drawer (W-08, separate feature)
- Optimistic updates (UX-06, separate feature)

## Testing Strategy

- Manual verification: approve queue item → navigate to created entity
- Manual verification: convert signal → see lead in Leads page
- Manual verification: close won/lost with form data → verify data persists on refresh
- Manual verification: create task → see task in list
- Unit tests for any new utility functions (none expected — this is pure wiring)

## Risk

Low. All API routes are tested and functional. This is frontend wiring using established patterns (Drawer, Toast, React Query mutations). No schema changes, no new API routes.
