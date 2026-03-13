# Core Workflows: W-01, W-02, W-07

Wire three core workflow buttons to their existing API mutations with toast feedback and form drawers.

## Context

All three APIs are fully implemented (Prisma + NextAuth). React Query mutation hooks exist for queue and signals. Toast and drawer systems are in the Zustand store and rendered in the dashboard layout. This work is purely frontend wiring.

## W-01: Queue Approval with Visible Side-Effects

**Files:** `src/app/(dashboard)/queue/page.tsx`

### Approve button — toast feedback
The "Approve" button (line 141) already calls `approve.mutate({ id })`. Add `onSuccess` callback that shows a toast describing the side-effect based on queue type:
- `lead_qualification` → "Lead created in pipeline"
- `task_creation` → "Task created"
- `enrichment` → "Account field updated"
- `outreach_draft` → "Outreach logged as activity"

Add `onError` callback showing error toast.

### Reject button — toast feedback
The reject dropdown (line 135) already calls `reject.mutate()`. Add success/error toast callbacks.

### Edit & Approve button
The "Edit & Approve" button (line 140) is decorative. Wire it to:
1. Open the existing drawer with editable fields based on `q.type`:
   - `outreach_draft`: editable subject + body textarea
   - `lead_qualification`: editable company, pain, type fields
   - `enrichment`: editable "after" value
   - `task_creation`: editable task title + due date
2. Footer has "Cancel" and "Save & Approve" buttons
3. "Save & Approve" calls `approve.mutate({ id, editedPayload: { ...editedFields } })`
4. Success toast same as direct approve

## W-02: Signal → Lead Conversion Flow

**Files:** `src/app/(dashboard)/signals/page.tsx`

### "→ Lead" button — quick inline form
The button (line 99) currently only stops propagation. Wire it to:
1. Open drawer with title "Convert to Lead"
2. Form fields:
   - Company name (text input, pre-filled from `signal.title` — extract company-like name or use full title)
   - Type (select: PPA Buyer, Certificate Trader, Corporate Offtaker, Unknown — default Unknown)
   - Country (text input, optional)
3. Footer: "Cancel" + "Create Lead" buttons
4. Submit calls `useConvertSignal()` with `{ id, company, type, country }`
5. Success toast: "Lead created: {company}"
6. Error toast shows API message (handles 409 duplicate)
7. Drawer closes on success

### Dismiss button
The "✕" button (line 100) does nothing. Wire to `useDismissSignal()` with success toast "Signal dismissed".

### Drawer "Convert to Lead" button
The detail drawer footer (line 51) has a "Convert to Lead" button that just closes. Wire it to open the same conversion form (reuse the same function).

## W-07: Task Create Form

**Files:** `src/app/(dashboard)/tasks/page.tsx`, `src/lib/queries/tasks.ts`

### New mutation hook
Add `useCreateTask` to `queries/tasks.ts`:
```ts
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; accountId?: string; priority?: string; due?: string; goalId?: string }) =>
      api.tasks.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
```

### "New Task" button
Add a button in the page header (next to the title) that opens a drawer.

### Task form drawer
Drawer with title "New Task", form fields:
- Title (text input, required)
- Priority (select: High / Medium / Low, default Medium)
- Due date (date input, default 7 days from now)
- Account (text input — free text for now, will match by name later)
- Goal (select from existing `goals` array, optional)

Footer: "Cancel" + "Create Task" buttons. Submit calls `useCreateTask()`. Success toast: "Task created: {title}". Error toast on failure. Drawer closes on success.

## Non-Goals
- No account autocomplete/search (future UX enhancement)
- No assignee picker (defaults to current user via API)
- No keyboard shortcuts for new forms
- Toast component already exists — no UX-03 work needed here

## Testing
- Each workflow tested manually via dev server
- Verify toast appears on success/error
- Verify list refreshes after mutation (React Query invalidation)
- Verify drawer opens/closes correctly
- Verify 409 duplicate handling on signal conversion
