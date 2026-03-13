# Workflow Forms Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 missing CRM workflow forms (Close Won/Lost, Account Create, Opportunity Create, Activity Log) so users can perform core operations from the UI.

**Architecture:** All backends exist — this is purely frontend. Each form uses the existing `openDrawer()` Zustand pattern with React Query mutations. Dynamic forms (Close Lost, Opp Create) use React component bodies for re-rendering; static forms use plain state objects.

**Tech Stack:** Next.js 14 (App Router), React 18, TanStack React Query, Zustand, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-13-workflow-forms-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/queries/activities.ts` | Create | `useLogActivity` mutation hook + query keys |
| `src/lib/queries/accounts.ts` | Modify | Add `useCreateAccount` mutation hook |
| `src/lib/queries/opportunities.ts` | Modify | Add `useCreateOpportunity` mutation hook |
| `src/app/(dashboard)/pipeline/[id]/page.tsx` | Modify | Close Won/Lost drawer forms, Log Note button |
| `src/app/(dashboard)/accounts/page.tsx` | Modify | + New Account button + drawer |
| `src/app/(dashboard)/accounts/[id]/page.tsx` | Modify | + New Opp button in opps tab, + Log Note + quick-log chips in activity tab |
| `src/app/(dashboard)/pipeline/page.tsx` | Modify | + New Opportunity button + drawer |

---

## Chunk 1: Mutation Hooks

### Task 1: Create `useLogActivity` hook

**Files:**
- Create: `src/lib/queries/activities.ts`

- [ ] **Step 1: Create the activities query module**

```tsx
// src/lib/queries/activities.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';

export const activityKeys = {
  all: ['activities'] as const,
};

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type?: string;
      summary: string;
      detail?: string;
      accountId: string;
      source?: string;
    }) => api.activities.log(data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: activityKeys.all });
      // Also refresh the account detail view (which includes activities)
      qc.invalidateQueries({ queryKey: accountKeys.detail(vars.accountId) });
      // Refresh opp details too (they show account activities)
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `activities.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/activities.ts
git commit -m "feat: add useLogActivity mutation hook (W-14)"
```

---

### Task 2: Add `useCreateAccount` hook

**Files:**
- Modify: `src/lib/queries/accounts.ts`

- [ ] **Step 1: Add the mutation hook**

Add at the end of `src/lib/queries/accounts.ts`:

```tsx
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
// ... existing code ...

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type?: string;
      country?: string;
      notes?: string;
    }) => api.accounts.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}
```

Note: Update the import line to include `useMutation` and `useQueryClient` (currently only imports `useQuery` and `keepPreviousData`).

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/accounts.ts
git commit -m "feat: add useCreateAccount mutation hook (W-09)"
```

---

### Task 3: Add `useCreateOpportunity` hook

**Files:**
- Modify: `src/lib/queries/opportunities.ts`

- [ ] **Step 1: Add the mutation hook**

Add at the end of `src/lib/queries/opportunities.ts`:

```tsx
export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      accountId: string;
      stage?: string;
      amount?: number;
      closeDate?: string;
    }) => api.opportunities.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/opportunities.ts
git commit -m "feat: add useCreateOpportunity mutation hook (W-11)"
```

---

## Chunk 2: W-06 Close Won / Close Lost Drawers

### Task 4: Add Close Won drawer to pipeline detail

**Files:**
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

**Context:** The page already imports `useCloseWon`, `useCloseLost`, and `useStore` (for `openDrawer`). The "Closed Won" button at line ~278 currently calls `closeWon.mutate({ id: o.id })` directly. Replace it with a drawer opener.

- [ ] **Step 1: Add imports and openCloseWonDrawer function**

Add to the top of `OppDetailPage` component, after the existing hook calls:

```tsx
const { openDrawer, closeDrawer, addToast } = useStore();
```

Then add this function inside the component:

```tsx
function openCloseWonDrawer() {
  const defaultDue = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0];
  const state = {
    winNotes: '',
    competitorBeaten: '',
    createTask: true,
    taskTitle: `Onboarding kickoff: ${o.accName}`,
    taskDue: defaultDue,
  };

  openDrawer({
    title: 'Close Won',
    subtitle: 'Mark this deal as won',
    body: (
      <div
        className="flex flex-col gap-3"
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-won]') as HTMLButtonElement)?.click(); }}
      >
        {/* Context header */}
        <div className="p-3 rounded-md bg-[var(--surface)] border border-[var(--border)]">
          <div className="text-[13px] font-semibold text-[var(--text)]">{o.name}</div>
          <div className="font-mono text-[18px] font-semibold text-brand mt-0.5">{fmt(o.amt)}</div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Win Notes</span>
          <textarea
            rows={3}
            onChange={e => { state.winNotes = e.target.value; }}
            placeholder="What made us win this deal?"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Competitor Beaten</span>
          <input
            onChange={e => { state.competitorBeaten = e.target.value; }}
            placeholder="e.g. Salesforce, HubSpot"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
          />
        </label>

        <div className="border-t border-[var(--border)] pt-3 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              defaultChecked
              onChange={e => { state.createTask = e.target.checked; }}
              className="rounded border-[var(--border)]"
            />
            <span className="text-[11px] font-medium text-[var(--text)]">Create follow-up task</span>
          </label>
          <div className="mt-2 flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Task Title</span>
              <input
                defaultValue={state.taskTitle}
                onChange={e => { state.taskTitle = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
            <label className="flex flex-col gap-1 w-[130px]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Due Date</span>
              <input
                type="date"
                defaultValue={defaultDue}
                onChange={e => { state.taskDue = e.target.value; }}
                className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
          </div>
        </div>
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
          data-submit-won
          disabled={closeWon.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            closeWon.mutate(
              { id: o.id, winNotes: state.winNotes || undefined, competitorBeaten: state.competitorBeaten || undefined },
              {
                onSuccess: async () => {
                  let taskMsg = '';
                  if (state.createTask && state.taskTitle.trim()) {
                    try {
                      await api.tasks.create({ title: state.taskTitle.trim(), due: state.taskDue || undefined, accountId: o.accId });
                      taskMsg = ' Follow-up task created.';
                    } catch (err: any) {
                      addToast({ type: 'error', message: `Task failed: ${err.message}` });
                    }
                  }
                  addToast({ type: 'success', message: `Deal won! 🎉${taskMsg}` });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
        >
          Mark as Won
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 2: Add api import**

Add `import { api } from '@/lib/api-client';` to the imports if not already present.

Add `import { useStore } from '@/lib/store';` to the imports if not already present.

- [ ] **Step 3: Replace the "Closed Won" button onClick**

Change the existing button (around line 278):
```tsx
onClick={() => closeWon.mutate({ id: o.id })}
```
to:
```tsx
onClick={openCloseWonDrawer}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat: add Close Won drawer with follow-up task (W-06)"
```

---

### Task 5: Add Close Lost drawer to pipeline detail

**Files:**
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

**Context:** Close Lost needs conditional "Lost To" field and a revisit date — requires a React component body.

- [ ] **Step 1: Add CloseLostForm component**

Add this component above `OppDetailPage` in the same file:

```tsx
function CloseLostForm({ opp, onSubmit }: {
  opp: { id: string; name: string; amt: number; accId: string; accName: string };
  onSubmit: (data: { lossReason: string; lossCompetitor?: string; lossNotes?: string; revisitDate?: string }) => void;
}) {
  const [reason, setReason] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [notes, setNotes] = useState('');
  const [revisitDate, setRevisitDate] = useState('');

  const handleSubmit = () => {
    onSubmit({
      lossReason: reason,
      lossCompetitor: reason === 'Competitor' ? competitor || undefined : undefined,
      lossNotes: notes || undefined,
      revisitDate: revisitDate || undefined,
    });
  };

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(); }}
    >
      {/* Context header */}
      <div className="p-3 rounded-md bg-[var(--surface)] border border-[var(--border)]">
        <div className="text-[13px] font-semibold text-[var(--text)]">{opp.name}</div>
        <div className="font-mono text-[18px] font-semibold text-danger mt-0.5">{fmt(opp.amt)}</div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Loss Reason *</span>
        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
        >
          <option value="">Select reason...</option>
          <option value="Price">Price</option>
          <option value="Timing">Timing</option>
          <option value="Competitor">Competitor</option>
          <option value="No Budget">No Budget</option>
          <option value="No Decision">No Decision</option>
          <option value="Other">Other</option>
        </select>
      </label>

      {reason === 'Competitor' && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Lost To</span>
          <input
            value={competitor}
            onChange={e => setCompetitor(e.target.value)}
            placeholder="Who won the deal?"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Notes</span>
        <textarea
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="What could we have done differently?"
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
        />
      </label>

      <div className="border-t border-[var(--border)] pt-3 mt-1">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Revisit On (optional)</span>
          <input
            type="date"
            value={revisitDate}
            onChange={e => setRevisitDate(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
          <span className="text-[10px] text-[var(--muted)]">Creates a reminder task to revisit this prospect</span>
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `useState` import**

Ensure `useState` is imported: `import { useState } from 'react';`

- [ ] **Step 3: Add openCloseLostDrawer function inside OppDetailPage**

```tsx
function openCloseLostDrawer() {
  const handleSubmit = (data: { lossReason: string; lossCompetitor?: string; lossNotes?: string; revisitDate?: string }) => {
    if (!data.lossReason) {
      addToast({ type: 'error', message: 'Loss reason is required' });
      return;
    }
    closeLost.mutate(
      { id: o.id, lossReason: data.lossReason, lossCompetitor: data.lossCompetitor, lossNotes: data.lossNotes },
      {
        onSuccess: async () => {
          let taskMsg = '';
          if (data.revisitDate) {
            try {
              await api.tasks.create({ title: `Revisit: ${o.name}`, due: data.revisitDate, accountId: o.accId });
              taskMsg = ` Revisit task created for ${fDate(data.revisitDate)}.`;
            } catch (err: any) {
              addToast({ type: 'error', message: `Revisit task failed: ${err.message}` });
            }
          }
          addToast({ type: 'info', message: `Deal marked as lost.${taskMsg}` });
          closeDrawer();
        },
        onError: (err) => addToast({ type: 'error', message: err.message }),
      }
    );
  };

  openDrawer({
    title: 'Close Lost',
    subtitle: 'Record why this deal was lost',
    body: <CloseLostForm opp={{ id: o.id, name: o.name, amt: o.amt, accId: o.accId, accName: o.accName }} onSubmit={handleSubmit} />,
    footer: (
      <>
        <button
          className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
          onClick={closeDrawer}
        >
          Cancel
        </button>
        <button
          disabled={closeLost.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-danger text-white rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            // The CloseLostForm component calls onSubmit via Cmd+Enter
            // For footer button, we need a ref-based approach
            // Simpler: use data attribute to trigger
            (document.querySelector('[data-submit-lost]') as HTMLButtonElement)?.click();
          }}
        >
          Mark as Lost
        </button>
      </>
    ),
  });
}
```

**Important note:** The footer submit button can't directly access the CloseLostForm state. Better approach: add a hidden submit button inside the CloseLostForm that the footer button triggers via data attribute, OR restructure so the form component manages its own submit button. The simplest approach: have the `CloseLostForm` expose a submit mechanism via a ref or hidden button.

**Revised approach — use a ref callback pattern:**

Instead of the above, make `CloseLostForm` include its own action buttons and pass them as footer. Restructure:

```tsx
function openCloseLostDrawer() {
  // Use a mutable ref to get the submit function from the form
  const submitRef = { current: () => {} };

  openDrawer({
    title: 'Close Lost',
    subtitle: 'Record why this deal was lost',
    body: (
      <CloseLostForm
        opp={{ id: o.id, name: o.name, amt: o.amt, accId: o.accId, accName: o.accName }}
        onSubmit={(data) => {
          if (!data.lossReason) {
            addToast({ type: 'error', message: 'Loss reason is required' });
            return;
          }
          closeLost.mutate(
            { id: o.id, lossReason: data.lossReason, lossCompetitor: data.lossCompetitor, lossNotes: data.lossNotes },
            {
              onSuccess: async () => {
                let taskMsg = '';
                if (data.revisitDate) {
                  try {
                    await api.tasks.create({ title: `Revisit: ${o.name}`, due: data.revisitDate, accountId: o.accId });
                    taskMsg = ` Revisit task created for ${fDate(data.revisitDate)}.`;
                  } catch (err: any) {
                    addToast({ type: 'error', message: `Revisit task failed: ${err.message}` });
                  }
                }
                addToast({ type: 'info', message: `Deal marked as lost.${taskMsg}` });
                closeDrawer();
              },
              onError: (err) => addToast({ type: 'error', message: err.message }),
            }
          );
        }}
        registerSubmit={(fn) => { submitRef.current = fn; }}
      />
    ),
    footer: (
      <>
        <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
        <button
          disabled={closeLost.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-danger text-white rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => submitRef.current()}
        >
          Mark as Lost
        </button>
      </>
    ),
  });
}
```

Update `CloseLostForm` to accept `registerSubmit` prop:

```tsx
function CloseLostForm({ opp, onSubmit, registerSubmit }: {
  opp: { id: string; name: string; amt: number; accId: string; accName: string };
  onSubmit: (data: { lossReason: string; lossCompetitor?: string; lossNotes?: string; revisitDate?: string }) => void;
  registerSubmit: (fn: () => void) => void;
}) {
  // ... existing state ...

  const handleSubmit = () => { /* same as before */ };

  // Register the submit function so the footer button can call it
  useEffect(() => { registerSubmit(handleSubmit); });

  // ... existing JSX ...
}
```

- [ ] **Step 4: Replace "Closed Lost" button onClick**

Change the existing button (around line 284):
```tsx
onClick={() => closeLost.mutate({ id: o.id, lossReason: 'Unknown' })}
```
to:
```tsx
onClick={openCloseLostDrawer}
```

- [ ] **Step 5: Add `useEffect` import if not present**

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat: add Close Lost drawer with revisit task (W-06)"
```

---

## Chunk 3: W-09 Account Create + W-14 Activity Log

### Task 6: Add New Account drawer to accounts page

**Files:**
- Modify: `src/app/(dashboard)/accounts/page.tsx`

- [ ] **Step 1: Add imports**

Add to existing imports:
```tsx
import { useAccountsQuery, useCreateAccount } from '@/lib/queries/accounts';
import { useStore } from '@/lib/store';
```

- [ ] **Step 2: Add drawer opener inside AccountsPage**

After `const { data: resp, isLoading, isError, refetch } = useAccountsQuery(...)` add:

```tsx
const createAccount = useCreateAccount();
const { openDrawer, closeDrawer, addToast } = useStore();

const ACCOUNT_TYPES = ['Unknown', 'PPA Buyer', 'Certificate Trader', 'Corporate Offtaker'];
const COUNTRIES = ['Finland', 'Denmark', 'Sweden', 'Norway', 'Germany', 'Netherlands', 'UK', 'US'];

function openNewAccountDrawer() {
  const state = { name: '', type: 'Unknown', country: '', notes: '' };

  openDrawer({
    title: 'New Account',
    subtitle: 'Add a new account to the CRM',
    body: (
      <div
        className="flex flex-col gap-3"
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-account]') as HTMLButtonElement)?.click(); }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Company Name *</span>
          <input
            autoFocus
            onChange={e => { state.name = e.target.value; }}
            placeholder="e.g. Ørsted, Vattenfall"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
          />
        </label>

        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
            <select
              defaultValue="Unknown"
              onChange={e => { state.type = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Country</span>
            <select
              defaultValue=""
              onChange={e => { state.country = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="">Select...</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="Other">Other</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Notes / Pain Hypothesis</span>
          <textarea
            rows={3}
            onChange={e => { state.notes = e.target.value; }}
            placeholder="Initial pain hypothesis or notes..."
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
          />
        </label>
      </div>
    ),
    footer: (
      <>
        <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
        <button
          data-submit-account
          disabled={createAccount.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            if (!state.name.trim()) {
              addToast({ type: 'error', message: 'Company name is required' });
              return;
            }
            createAccount.mutate(
              { name: state.name.trim(), type: state.type, country: state.country || undefined, notes: state.notes || undefined },
              {
                onSuccess: () => { addToast({ type: 'success', message: `Account created: ${state.name}` }); closeDrawer(); },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
        >
          Create Account
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 3: Add the "+ New Account" button to the page header**

Find the header div (around line 53-57) and add a button:

```tsx
<div className="flex items-center justify-between mb-3.5">
  <div>
    <h1 className="text-[18px] font-semibold tracking-tight">Accounts</h1>
    <p className="text-[12px] text-[var(--sub)] mt-0.5">{sorted.length} account{sorted.length !== 1 ? 's' : ''}</p>
  </div>
  <button
    onClick={openNewAccountDrawer}
    className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
  >
    + New Account
  </button>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/accounts/page.tsx
git commit -m "feat: add New Account drawer with dedup (W-09)"
```

---

### Task 7: Add Activity Log drawer to account detail

**Files:**
- Modify: `src/app/(dashboard)/accounts/[id]/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { useLogActivity } from '@/lib/queries/activities';
import { useStore } from '@/lib/store';
```

- [ ] **Step 2: Add hooks and drawer opener inside AccountDetailPage**

After the existing hook calls:

```tsx
const logActivity = useLogActivity();
const { openDrawer, closeDrawer, addToast } = useStore();

function openLogActivityDrawer(preselectedType?: string) {
  const state = { type: preselectedType || 'Note', summary: '', detail: '' };

  openDrawer({
    title: 'Log Activity',
    subtitle: `${a.name}`,
    body: (
      <div
        className="flex flex-col gap-3"
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-activity]') as HTMLButtonElement)?.click(); }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
          <select
            defaultValue={state.type}
            onChange={e => { state.type = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            <option value="Note">Note</option>
            <option value="Call">Call</option>
            <option value="Meeting">Meeting</option>
            <option value="Email">Email</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Summary *</span>
          <input
            autoFocus
            onChange={e => { state.summary = e.target.value; }}
            placeholder="Brief summary of the activity"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Detail</span>
          <textarea
            rows={4}
            onChange={e => { state.detail = e.target.value; }}
            placeholder="Additional details..."
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
          />
        </label>
      </div>
    ),
    footer: (
      <>
        <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
        <button
          data-submit-activity
          disabled={logActivity.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            if (!state.summary.trim()) {
              addToast({ type: 'error', message: 'Summary is required' });
              return;
            }
            logActivity.mutate(
              { type: state.type, summary: state.summary.trim(), detail: state.detail || undefined, accountId: id, source: 'Manual' },
              {
                onSuccess: () => { addToast({ type: 'success', message: 'Activity logged' }); closeDrawer(); },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
        >
          Log Activity
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 3: Add Log Note button + quick-log chips to Activity tab**

Find the activity tab section (around line 293 `{tab === 'activity' && (`). Add buttons before the activity list:

```tsx
{tab === 'activity' && (
  <>
    <div className="flex items-center gap-2 mb-3">
      <button
        onClick={() => openLogActivityDrawer()}
        className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
      >
        + Log Note
      </button>
      <div className="flex gap-1">
        {[
          { type: 'Call', icon: '📞' },
          { type: 'Email', icon: '📧' },
          { type: 'Meeting', icon: '🤝' },
        ].map(({ type, icon }) => (
          <button
            key={type}
            onClick={() => openLogActivityDrawer(type)}
            className="px-2 py-1 text-[11px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--sub)] hover:bg-[var(--hover)] transition-colors"
          >
            {icon} {type}
          </button>
        ))}
      </div>
    </div>
    {accActs.length === 0 ? (
      <EmptyState icon="📅" title="No activity" description="Activity from emails, meetings, and notes will appear here." />
    ) : (
      /* existing activity timeline JSX */
    )}
  </>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/accounts/\[id\]/page.tsx
git commit -m "feat: add Activity Log drawer with quick-log chips (W-14)"
```

---

### Task 8: Add Log Note button to opportunity detail page

**Files:**
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

- [ ] **Step 1: Add useLogActivity import**

```tsx
import { useLogActivity } from '@/lib/queries/activities';
```

- [ ] **Step 2: Add hook and drawer opener in OppDetailPage**

After existing hooks:
```tsx
const logActivity = useLogActivity();
```

Add drawer opener (similar pattern to Task 7 but using the opp's account context):

```tsx
function openLogActivityDrawer(preselectedType?: string) {
  const state = { type: preselectedType || 'Note', summary: '', detail: '' };

  openDrawer({
    title: 'Log Activity',
    subtitle: `${o.accName}`,
    body: (
      <div
        className="flex flex-col gap-3"
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') (document.querySelector('[data-submit-activity]') as HTMLButtonElement)?.click(); }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
          <select defaultValue={state.type} onChange={e => { state.type = e.target.value; }} className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40">
            <option value="Note">Note</option>
            <option value="Call">Call</option>
            <option value="Meeting">Meeting</option>
            <option value="Email">Email</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Summary *</span>
          <input autoFocus onChange={e => { state.summary = e.target.value; }} placeholder="Brief summary of the activity" className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Detail</span>
          <textarea rows={4} onChange={e => { state.detail = e.target.value; }} placeholder="Additional details..." className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none" />
        </label>
      </div>
    ),
    footer: (
      <>
        <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
        <button
          data-submit-activity
          disabled={logActivity.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            if (!state.summary.trim()) { addToast({ type: 'error', message: 'Summary is required' }); return; }
            logActivity.mutate(
              { type: state.type, summary: state.summary.trim(), detail: state.detail || undefined, accountId: o.accId, source: 'Manual' },
              {
                onSuccess: () => { addToast({ type: 'success', message: 'Activity logged' }); closeDrawer(); },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
        >
          Log Activity
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 3: Add "+ Log Note" button to the Activity section header**

Find the Activity section header (around line 205):
```tsx
<div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]"><span className="text-[12.5px] font-semibold text-[var(--text)]">Activity</span></div>
```

Replace with:
```tsx
<div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
  <span className="text-[12.5px] font-semibold text-[var(--text)]">Activity</span>
  <button
    onClick={() => openLogActivityDrawer()}
    className="px-2 py-1 text-[10px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
  >
    + Log Note
  </button>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat: add Log Note button to opportunity detail (W-14)"
```

---

## Chunk 4: W-11 Opportunity Create

### Task 9: Add Opportunity Create drawer to pipeline page

**Files:**
- Modify: `src/app/(dashboard)/pipeline/page.tsx`

**Context:** This is the most complex form due to the account typeahead and live probability display. Uses a React component body.

- [ ] **Step 1: Add imports**

```tsx
import { useState, useEffect } from 'react';
import { useOpportunitiesQuery, useCreateOpportunity } from '@/lib/queries/opportunities';
import { KANBAN_STAGES, STAGE_PROB } from '@/lib/types';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api-client';
```

- [ ] **Step 2: Add OpportunityCreateForm component**

Add above `PipelinePage`:

```tsx
function OpportunityCreateForm({
  prefilledAccountId,
  prefilledAccountName,
  onSubmit,
  registerSubmit,
}: {
  prefilledAccountId?: string;
  prefilledAccountName?: string;
  onSubmit: (data: { name: string; accountId: string; stage: string; amount: number; closeDate: string }) => void;
  registerSubmit: (fn: () => void) => void;
}) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(prefilledAccountId || '');
  const [accountQuery, setAccountQuery] = useState(prefilledAccountName || '');
  const [accountResults, setAccountResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAccountName, setSelectedAccountName] = useState(prefilledAccountName || '');
  const [stage, setStage] = useState('Contacted');
  const [amount, setAmount] = useState(0);
  const defaultClose = new Date(Date.now() + 90 * 864e5).toISOString().split('T')[0];
  const [closeDate, setCloseDate] = useState(defaultClose);

  // Debounced account search
  useEffect(() => {
    if (prefilledAccountId || !accountQuery.trim() || accountQuery === selectedAccountName) {
      setAccountResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.accounts.list({ q: accountQuery });
        const results = (res?.data ?? []).slice(0, 5);
        setAccountResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        setAccountResults([]);
        setShowDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [accountQuery, prefilledAccountId, selectedAccountName]);

  const handleSubmit = () => {
    onSubmit({ name, accountId, stage, amount, closeDate });
  };

  useEffect(() => { registerSubmit(handleSubmit); });

  const prob = STAGE_PROB[stage] ?? 0;

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(); }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Opportunity Name *</span>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Ørsted PPA Deal 2026"
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
        />
      </label>

      {/* Account typeahead */}
      <label className="flex flex-col gap-1 relative">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Account *</span>
        {prefilledAccountId ? (
          <div className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]">
            {prefilledAccountName}
          </div>
        ) : (
          <>
            <input
              value={accountQuery}
              onChange={e => { setAccountQuery(e.target.value); setAccountId(''); setSelectedAccountName(''); }}
              placeholder="Search for an account..."
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            />
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 z-10 mt-0.5 rounded-md bg-[var(--elevated)] border border-[var(--border)] shadow-lg max-h-[160px] overflow-y-auto">
                {accountResults.map((acc: any) => (
                  <button
                    key={acc.id}
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-[var(--hover)] transition-colors flex items-center gap-1.5"
                    onMouseDown={e => {
                      e.preventDefault();
                      setAccountId(acc.id);
                      setAccountQuery(acc.name);
                      setSelectedAccountName(acc.name);
                      setShowDropdown(false);
                    }}
                  >
                    <span className="text-[var(--text)]">{acc.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--muted)]">{acc.type}</span>
                  </button>
                ))}
              </div>
            )}
            {accountQuery && !accountId && !showDropdown && accountQuery !== selectedAccountName && (
              <span className="text-[10px] text-warn">No account selected — search and pick one</span>
            )}
          </>
        )}
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Stage</span>
          <select
            value={stage}
            onChange={e => setStage(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            {KANBAN_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="text-[10px] text-[var(--muted)]">Probability: {prob}%</span>
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</span>
          <input
            type="number"
            value={amount || ''}
            onChange={e => setAmount(Number(e.target.value) || 0)}
            placeholder="0"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Close Date</span>
        <input
          type="date"
          value={closeDate}
          onChange={e => setCloseDate(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Add drawer opener function inside PipelinePage**

```tsx
const createOpp = useCreateOpportunity();
const { openDrawer, closeDrawer, addToast } = useStore();

function openNewOppDrawer(prefilledAccountId?: string, prefilledAccountName?: string) {
  const submitRef = { current: () => {} };

  // Map display stage names to Prisma enum values for the API
  const DISPLAY_TO_PRISMA: Record<string, string> = {
    'Solution Fit': 'SolutionFit',
    'Verbal Commit': 'VerbalCommit',
  };

  openDrawer({
    title: 'New Opportunity',
    subtitle: prefilledAccountName ? `For ${prefilledAccountName}` : 'Create a new deal',
    body: (
      <OpportunityCreateForm
        prefilledAccountId={prefilledAccountId}
        prefilledAccountName={prefilledAccountName}
        onSubmit={(data) => {
          if (!data.name.trim()) { addToast({ type: 'error', message: 'Name is required' }); return; }
          if (!data.accountId) { addToast({ type: 'error', message: 'Account is required' }); return; }
          const prismaStage = DISPLAY_TO_PRISMA[data.stage] ?? data.stage;
          createOpp.mutate(
            { name: data.name.trim(), accountId: data.accountId, stage: prismaStage, amount: data.amount, closeDate: data.closeDate || undefined },
            {
              onSuccess: () => { addToast({ type: 'success', message: `Opportunity created: ${data.name}` }); closeDrawer(); },
              onError: (err) => addToast({ type: 'error', message: err.message }),
            }
          );
        }}
        registerSubmit={(fn) => { submitRef.current = fn; }}
      />
    ),
    footer: (
      <>
        <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
        <button
          disabled={createOpp.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => submitRef.current()}
        >
          Create Opportunity
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 4: Add "+ New Opportunity" button to pipeline page header**

Find the header div (around line 62-76) and add a button after the view toggle:

```tsx
<div className="flex items-center gap-2">
  <div className="hidden md:flex border border-[var(--border)] rounded-md overflow-hidden">
    {/* existing view toggle buttons */}
  </div>
  <button
    onClick={() => openNewOppDrawer()}
    className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
  >
    + New Opportunity
  </button>
</div>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/page.tsx
git commit -m "feat: add New Opportunity drawer with account typeahead (W-11)"
```

---

### Task 10: Add "+ New Opportunity" to account detail opps tab

**Files:**
- Modify: `src/app/(dashboard)/accounts/[id]/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { useCreateOpportunity } from '@/lib/queries/opportunities';
import { KANBAN_STAGES, STAGE_PROB } from '@/lib/types';
import { api } from '@/lib/api-client';
```

- [ ] **Step 2: Copy OpportunityCreateForm component**

Copy the `OpportunityCreateForm` component from pipeline/page.tsx into this file (above `AccountDetailPage`), OR extract it to a shared location. For now, copy it inline to follow the existing pattern of self-contained pages.

- [ ] **Step 3: Add hooks and drawer opener inside AccountDetailPage**

```tsx
const createOpp = useCreateOpportunity();
```

Add `openNewOppDrawer` function (same as Task 9 step 3, but with `prefilledAccountId={id}` and `prefilledAccountName={a.name}`):

```tsx
function openNewOppDrawer() {
  const submitRef = { current: () => {} };
  const DISPLAY_TO_PRISMA: Record<string, string> = { 'Solution Fit': 'SolutionFit', 'Verbal Commit': 'VerbalCommit' };

  openDrawer({
    title: 'New Opportunity',
    subtitle: `For ${a.name}`,
    body: (
      <OpportunityCreateForm
        prefilledAccountId={id}
        prefilledAccountName={a.name}
        onSubmit={(data) => {
          if (!data.name.trim()) { addToast({ type: 'error', message: 'Name is required' }); return; }
          const prismaStage = DISPLAY_TO_PRISMA[data.stage] ?? data.stage;
          createOpp.mutate(
            { name: data.name.trim(), accountId: id, stage: prismaStage, amount: data.amount, closeDate: data.closeDate || undefined },
            {
              onSuccess: () => { addToast({ type: 'success', message: `Opportunity created: ${data.name}` }); closeDrawer(); },
              onError: (err) => addToast({ type: 'error', message: err.message }),
            }
          );
        }}
        registerSubmit={(fn) => { submitRef.current = fn; }}
      />
    ),
    footer: (
      <>
        <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
        <button disabled={createOpp.isPending} className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => submitRef.current()}>Create Opportunity</button>
      </>
    ),
  });
}
```

- [ ] **Step 4: Add button to the Opportunities tab**

Find the opps tab section (around line 265 `{tab === 'opps' && (`). Add a button before the list:

```tsx
{tab === 'opps' && (
  <>
    <div className="flex justify-end mb-2">
      <button
        onClick={openNewOppDrawer}
        className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
      >
        + New Opportunity
      </button>
    </div>
    {accOpps.length === 0 ? (
      <EmptyState icon="📊" title="No opportunities" description="Create one or convert a qualified lead." />
    ) : (
      /* existing opps list */
    )}
  </>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/accounts/\[id\]/page.tsx
git commit -m "feat: add New Opportunity button to account detail (W-11)"
```

---

## Chunk 5: Final Verification

### Task 11: Build verification and cleanup

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Run existing tests**

Run: `npm test 2>&1 | tail -20`
Expected: All existing tests pass

- [ ] **Step 4: Run linter**

Run: `npx eslint src/lib/queries/activities.ts src/app/\(dashboard\)/pipeline/\[id\]/page.tsx src/app/\(dashboard\)/accounts/page.tsx src/app/\(dashboard\)/accounts/\[id\]/page.tsx src/app/\(dashboard\)/pipeline/page.tsx --fix 2>&1 | tail -20`
Expected: No errors (warnings OK)

- [ ] **Step 5: Fix any issues and commit**

If lint/build found issues:
```bash
git add -u
git commit -m "fix: address lint and build issues in workflow forms"
```

- [ ] **Step 6: Squash merge into main**

```bash
git checkout main
git merge claude/thirsty-poincare --no-ff -m "feat: add workflow forms — Close Won/Lost, Account Create, Opportunity Create, Activity Log (W-06, W-09, W-11, W-14)"
```
