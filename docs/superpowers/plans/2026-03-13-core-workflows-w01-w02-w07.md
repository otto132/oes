# Core Workflows W-01, W-02, W-07 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire three decorative buttons to their existing API mutations with toast feedback and form drawers.

**Architecture:** Each workflow adds `onSuccess`/`onError` callbacks to existing React Query mutations and uses the Zustand drawer/toast store for UI. No new components — forms render as ReactNode inside the existing drawer. One new mutation hook (`useCreateTask`) is needed.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand (store.ts), React Query (@tanstack/react-query), Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-core-workflows-w01-w02-w07-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/queries/tasks.ts` | Add `useCreateTask` mutation hook |
| Modify | `src/app/(dashboard)/queue/page.tsx` | Toast callbacks on approve/reject, Edit & Approve drawer |
| Modify | `src/app/(dashboard)/signals/page.tsx` | Convert-to-lead form drawer, dismiss wiring |
| Modify | `src/app/(dashboard)/tasks/page.tsx` | New Task button + form drawer |

---

## Chunk 1: Mutation Hook + Queue Approval (W-01)

### Task 1: Add `useCreateTask` mutation hook

**Files:**
- Modify: `src/lib/queries/tasks.ts`

- [ ] **Step 1: Add the mutation hook**

Add after the existing `useCommentOnTask` function:

```ts
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      accountId?: string;
      priority?: string;
      due?: string;
      goalId?: string;
    }) => api.tasks.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in `tasks.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/tasks.ts
git commit -m "feat(tasks): add useCreateTask mutation hook"
```

---

### Task 2: Wire queue approve/reject with toast feedback (W-01 core)

**Files:**
- Modify: `src/app/(dashboard)/queue/page.tsx`

The approve button (line 141) already calls `approve.mutate({ id: q.id })`. The reject dropdown (line 135) already calls `reject.mutate(...)`. Both need `onSuccess`/`onError` callbacks with toast messages.

- [ ] **Step 1: Import `useStore` and add toast helper**

Add to the imports at the top of the file:

```ts
import { useStore } from '@/lib/store';
```

Inside `QueuePage()`, after the existing hooks (line 24), add:

```ts
const addToast = useStore(s => s.addToast);
```

- [ ] **Step 2: Add toast message map and helper**

Inside `QueuePage()`, after `addToast`:

```ts
const SIDE_EFFECT_MSG: Record<string, string> = {
  lead_qualification: 'Lead created in pipeline',
  task_creation: 'Task created',
  enrichment: 'Account field updated',
  outreach_draft: 'Outreach logged as activity',
};
```

- [ ] **Step 3: Wire approve button with toast callback**

Replace the approve button (line 141-143):

```tsx
<button
  onClick={() =>
    approve.mutate(
      { id: q.id },
      {
        onSuccess: () => addToast({ type: 'success', message: `Approved — ${SIDE_EFFECT_MSG[q.type] || 'Done'}` }),
        onError: (err) => addToast({ type: 'error', message: `Approve failed: ${err.message}` }),
      }
    )
  }
  disabled={approve.isPending}
  className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 ml-auto flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
>
  <Check className="w-3 h-3" /> Approve
</button>
```

- [ ] **Step 4: Wire reject dropdown with toast callback**

Replace the reject button onClick inside the REJECT_REASONS map (line 135):

```tsx
<button
  key={r}
  onClick={() => {
    reject.mutate(
      { id: q.id, reason: r },
      {
        onSuccess: () => addToast({ type: 'info', message: `Rejected — ${r}` }),
        onError: (err) => addToast({ type: 'error', message: `Reject failed: ${err.message}` }),
      }
    );
    setRejectOpen(null);
  }}
  disabled={reject.isPending}
  className="block w-full text-left px-2.5 py-1.5 text-[11px] text-sub rounded-md hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50 transition-colors"
>
  {r}
</button>
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/queue/page.tsx
git commit -m "feat(queue): add toast feedback on approve/reject (W-01)"
```

---

### Task 3: Wire Edit & Approve drawer (W-01 edit flow)

**Files:**
- Modify: `src/app/(dashboard)/queue/page.tsx`

The "Edit & Approve" button (line 140) is decorative. Wire it to open the drawer with editable payload fields, then call approve with the edited payload.

- [ ] **Step 1: Import `useStore` drawer methods**

Update the existing `addToast` line to also destructure drawer methods:

```ts
const { addToast, openDrawer, closeDrawer } = useStore();
```

(Replace the `useStore(s => s.addToast)` selector with the full destructure.)

- [ ] **Step 2: Add the `openEditDrawer` function**

Inside `QueuePage()`, add this function after the `SIDE_EFFECT_MSG` map:

```ts
function openEditDrawer(q: QueueItem) {
  // Build initial editable state from payload
  const p = q.payload || {};
  let fields: Record<string, { label: string; value: string; multiline?: boolean }> = {};
  if (q.type === 'outreach_draft') {
    fields = {
      subject: { label: 'Subject', value: p.subject || '' },
      body: { label: 'Body', value: p.body || '', multiline: true },
    };
  } else if (q.type === 'lead_qualification') {
    fields = {
      company: { label: 'Company', value: p.company || '' },
      pain: { label: 'Pain Point', value: p.pain || '' },
      type: { label: 'Type', value: p.type || '' },
    };
  } else if (q.type === 'enrichment') {
    fields = {
      after: { label: `New value for "${p.field}"`, value: p.after || '' },
    };
  } else if (q.type === 'task_creation') {
    fields = {
      task: { label: 'Task', value: p.task || '' },
      due: { label: 'Due Date', value: p.due || '' },
    };
  }

  // We need a mutable ref for form state since drawer body is a ReactNode snapshot
  const state = { ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value])) };

  openDrawer({
    title: 'Edit & Approve',
    subtitle: q.title,
    body: (
      <div className="flex flex-col gap-3">
        {Object.entries(fields).map(([key, f]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{f.label}</span>
            {f.multiline ? (
              <textarea
                defaultValue={f.value}
                onChange={e => { state[key] = e.target.value; }}
                rows={5}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 resize-y"
              />
            ) : (
              <input
                defaultValue={f.value}
                onChange={e => { state[key] = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            )}
          </label>
        ))}
      </div>
    ),
    footer: (
      <>
        <button
          className="px-3 py-1.5 text-[12px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
          onClick={closeDrawer}
        >
          Cancel
        </button>
        <button
          className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          onClick={() => {
            const editedPayload = { ...q.payload, ...state };
            approve.mutate(
              { id: q.id, editedPayload },
              {
                onSuccess: () => {
                  addToast({ type: 'success', message: `Approved (edited) — ${SIDE_EFFECT_MSG[q.type] || 'Done'}` });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: `Approve failed: ${err.message}` }),
              }
            );
          }}
        >
          Save & Approve
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 3: Wire the Edit & Approve button**

Replace the decorative Edit & Approve button (line 140):

```tsx
<button
  onClick={() => openEditDrawer(q)}
  className="px-2 py-1 text-[11px] font-medium rounded-md text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
>
  Edit & Approve
</button>
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/queue/page.tsx
git commit -m "feat(queue): wire Edit & Approve drawer with editable payload (W-01)"
```

---

## Chunk 2: Signal Conversion (W-02)

### Task 4: Wire Signal → Lead conversion flow (W-02)

**Files:**
- Modify: `src/app/(dashboard)/signals/page.tsx`

- [ ] **Step 1: Import mutation hooks and toast**

Update imports at top of file. Add:

```ts
import { useSignalsQuery, useConvertSignal, useDismissSignal } from '@/lib/queries/signals';
```

(Replace the existing `useSignalsQuery`-only import.)

- [ ] **Step 2: Add hooks inside `SignalsPage()`**

After the existing hooks (line 19), add:

```ts
const convert = useConvertSignal();
const dismiss = useDismissSignal();
const addToast = useStore(s => s.addToast);
```

- [ ] **Step 3: Add the `openConvertDrawer` function**

Add inside `SignalsPage()`, after the hooks:

```ts
function openConvertDrawer(s: Signal) {
  const state = { company: s.title, type: 'Unknown', country: '' };

  openDrawer({
    title: 'Convert to Lead',
    subtitle: `From signal: ${s.title.slice(0, 50)}`,
    body: (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Company Name</span>
          <input
            defaultValue={state.company}
            onChange={e => { state.company = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
          <select
            defaultValue={state.type}
            onChange={e => { state.type = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            <option value="Unknown">Unknown</option>
            <option value="PPA Buyer">PPA Buyer</option>
            <option value="Certificate Trader">Certificate Trader</option>
            <option value="Corporate Offtaker">Corporate Offtaker</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Country (optional)</span>
          <input
            defaultValue={state.country}
            onChange={e => { state.country = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
      </div>
    ),
    footer: (
      <>
        <button
          className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
          onClick={closeDrawer}
        >
          Cancel
        </button>
        <button
          className="px-3.5 py-1.5 text-[12px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          onClick={() => {
            if (!state.company.trim()) {
              addToast({ type: 'error', message: 'Company name is required' });
              return;
            }
            convert.mutate(
              { id: s.id, company: state.company.trim(), type: state.type, country: state.country.trim() || undefined },
              {
                onSuccess: () => {
                  addToast({ type: 'success', message: `Lead created: ${state.company}` });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
        >
          Create Lead
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 4: Wire the "→ Lead" button**

Replace the "→ Lead" button (line 99):

```tsx
<button
  className="px-2 py-1 text-[11px] font-medium rounded-md bg-[var(--brand)] text-[#09090b] hover:brightness-110 transition-colors"
  onClick={e => { e.stopPropagation(); openConvertDrawer(s); }}
>
  → Lead
</button>
```

- [ ] **Step 5: Wire the dismiss "✕" button**

Replace the dismiss button (line 100):

```tsx
<button
  className="px-1.5 py-1 text-[11px] text-[var(--sub)] hover:bg-[var(--hover)] rounded-md transition-colors"
  onClick={e => {
    e.stopPropagation();
    dismiss.mutate(s.id, {
      onSuccess: () => addToast({ type: 'info', message: 'Signal dismissed' }),
      onError: (err) => addToast({ type: 'error', message: err.message }),
    });
  }}
>
  ✕
</button>
```

- [ ] **Step 6: Wire the drawer footer "Convert to Lead" button**

In the `viewDetail` function, replace the footer "Convert to Lead" button (line 51):

```tsx
<button
  className="px-3.5 py-1.5 text-[12.5px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors"
  onClick={() => { closeDrawer(); openConvertDrawer(s); }}
>
  Convert to Lead
</button>
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/signals/page.tsx
git commit -m "feat(signals): wire signal-to-lead conversion and dismiss (W-02)"
```

---

## Chunk 3: Task Create Form (W-07)

### Task 5: Wire Task create form (W-07)

**Files:**
- Modify: `src/app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Import the new mutation hook**

Update imports at top of file:

```ts
import { useTasksQuery, useCreateTask } from '@/lib/queries/tasks';
```

- [ ] **Step 2: Add hooks inside `TasksPage()`**

After existing hooks (around line 15), add:

```ts
const createTask = useCreateTask();
const addToast = useStore(s => s.addToast);
```

- [ ] **Step 3: Add the `openNewTaskDrawer` function**

Add inside `TasksPage()`, after the hooks:

```ts
function openNewTaskDrawer() {
  const defaultDue = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
  const state = { title: '', priority: 'Medium', due: defaultDue, accountName: '', goalId: '' };

  openDrawer({
    title: 'New Task',
    subtitle: 'Create a manual task',
    body: (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Title</span>
          <input
            autoFocus
            onChange={e => { state.title = e.target.value; }}
            placeholder="e.g. Follow up with Ørsted on PPA terms"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Priority</span>
            <select
              defaultValue="Medium"
              onChange={e => { state.priority = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Due Date</span>
            <input
              type="date"
              defaultValue={defaultDue}
              onChange={e => { state.due = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Account (optional)</span>
          <input
            onChange={e => { state.accountName = e.target.value; }}
            placeholder="e.g. Ørsted, Vattenfall"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-muted focus:outline-none focus:border-brand/40"
          />
        </label>
        {goals.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Goal (optional)</span>
            <select
              defaultValue=""
              onChange={e => { state.goalId = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="">No goal</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>{g.title}{g.accName ? ` (${g.accName})` : ''}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    ),
    footer: (
      <>
        <button
          className="px-3.5 py-1.5 text-[12px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
          onClick={closeDrawer}
        >
          Cancel
        </button>
        <button
          className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          onClick={() => {
            if (!state.title.trim()) {
              addToast({ type: 'error', message: 'Title is required' });
              return;
            }
            createTask.mutate(
              {
                title: state.title.trim(),
                priority: state.priority,
                due: state.due || undefined,
                goalId: state.goalId || undefined,
              },
              {
                onSuccess: () => {
                  addToast({ type: 'success', message: `Task created: ${state.title}` });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: `Failed: ${err.message}` }),
              }
            );
          }}
        >
          Create Task
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 4: Add "New Task" button to the page header**

Replace the header div (lines 139-147). Add a button next to the title:

```tsx
<div className="flex items-center justify-between mb-3.5">
  <div>
    <h1 className="text-[18px] font-semibold tracking-tight">Tasks</h1>
    <p className="text-[12.5px] text-sub mt-0.5">
      {mine.filter(t => t.status !== 'Done').length} mine · {all.filter(t => t.status !== 'Done').length} total
      {overdue.length > 0 && <span className="text-danger"> · {overdue.length} overdue</span>}
    </p>
  </div>
  <button
    onClick={openNewTaskDrawer}
    className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 transition-colors flex items-center gap-1"
  >
    + New Task
  </button>
</div>
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/tasks/page.tsx
git commit -m "feat(tasks): add New Task button and create form drawer (W-07)"
```

---

## Chunk 4: Verification

### Task 6: Full verification pass

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit --pretty`
Expected: Clean — no errors

- [ ] **Step 2: Run existing tests**

Run: `npm test`
Expected: All existing tests pass

- [ ] **Step 3: Visual verification via dev server**

Start dev server, verify each workflow:
1. Queue page: click Approve → toast appears with side-effect message; click Edit & Approve → drawer opens with editable fields, Save & Approve → toast + drawer closes; click Reject → toast confirms
2. Signals page: click → Lead → drawer opens with company pre-filled, Create Lead → toast + drawer closes; click ✕ → signal dismissed with toast; open signal detail → Convert to Lead opens form drawer
3. Tasks page: "New Task" button visible, click → drawer opens, fill title + submit → toast + drawer closes, new task appears in list

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: address verification issues from W-01/W-02/W-07"
```
(Only if changes were needed.)
