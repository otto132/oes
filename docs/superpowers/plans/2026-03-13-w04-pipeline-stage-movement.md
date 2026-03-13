# W-04 Pipeline Stage Movement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add toast feedback to pipeline stage movement and build Close Won / Close Lost drawers with outcome metadata capture.

**Architecture:** All mutation hooks (`useMoveStage`, `useCloseWon`, `useCloseLost`) and API endpoints already exist. This is purely UI: add `onSuccess`/`onError` toast callbacks to existing mutation calls, and replace the direct Close Won/Close Lost button clicks with drawer openers. Single file change.

**Tech Stack:** React 19, TanStack React Query, Zustand (drawer/toast), Next.js App Router

**Spec:** `docs/superpowers/specs/2026-03-13-w03-w04-lead-conversion-pipeline-movement-design.md`

---

## Chunk 1: Toast Feedback + Close Drawers

### Task 1: Add toast feedback to stage movement

**Files:**
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

- [ ] **Step 1: Add imports for store and adapters**

At the top of the file, after the existing imports (lines 1-8), add:

```typescript
import { useStore } from '@/lib/store';
import { mapOppStage } from '@/lib/adapters';
```

- [ ] **Step 2: Initialize store hooks**

Inside `OppDetailPage()`, after the existing `closeLost` hook (line 113), add:

```typescript
const { openDrawer, closeDrawer } = useStore();
const addToast = useStore(s => s.addToast);
```

- [ ] **Step 3: Add toast callbacks to the stage move buttons**

The current move button `onClick` (line 264) is:
```typescript
onClick={() => move.mutate({ id: o.id, stage: toPrismaStage(s) })}
```

Replace with:
```typescript
onClick={() => move.mutate(
  { id: o.id, stage: toPrismaStage(s) },
  {
    onSuccess: () => addToast({ type: 'success', message: `Stage → ${s}` }),
    onError: (err: Error) => addToast({ type: 'error', message: `Move failed: ${err.message}` }),
  }
)}
```

Note: `s` is already the display stage name (from `STAGES` array), so no `mapOppStage()` conversion needed here. The `mapOppStage` import is for cases where we get a Prisma enum back from the API.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat(pipeline): add toast feedback to stage movement (W-04)"
```

---

### Task 2: Add Close Won drawer

**Files:**
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

- [ ] **Step 1: Create `openCloseWonDrawer` function**

Add this function inside `OppDetailPage()`, after the hook initializations and before the `if (isLoading)` check:

```typescript
function openCloseWonDrawer() {
  const state = { winNotes: '', competitorBeaten: '' };

  openDrawer({
    title: 'Close Won',
    subtitle: o!.name,
    body: (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Win Notes</span>
          <textarea
            placeholder="What helped us win?"
            onChange={e => { state.winNotes = e.target.value; }}
            rows={3}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 resize-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Competitor Beaten (optional)</span>
          <input
            placeholder="Which competitor?"
            onChange={e => { state.competitorBeaten = e.target.value; }}
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
          disabled={closeWon.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            closeWon.mutate(
              {
                id: o!.id,
                winNotes: state.winNotes.trim() || undefined,
                competitorBeaten: state.competitorBeaten.trim() || undefined,
              },
              {
                onSuccess: () => {
                  addToast({ type: 'success', message: `Deal won! ${o!.name}` });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: `Close failed: ${err.message}` }),
              }
            );
          }}
        >
          Confirm Win
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 2: Wire the Close Won button to open the drawer**

Replace the current Close Won button (lines 275-280):

```typescript
<button
  disabled={isMutating}
  onClick={() => closeWon.mutate({ id: o.id })}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-brand font-medium hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Won
</button>
```

With:

```typescript
<button
  disabled={isMutating}
  onClick={openCloseWonDrawer}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-brand font-medium hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Won
</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat(pipeline): add Close Won drawer with outcome fields (W-04)"
```

---

### Task 3: Add Close Lost drawer

**Files:**
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

- [ ] **Step 1: Create `openCloseLostDrawer` function**

Add this function after `openCloseWonDrawer`:

```typescript
function openCloseLostDrawer() {
  const state = { lossReason: '', lossCompetitor: '', lossNotes: '' };

  openDrawer({
    title: 'Close Lost',
    subtitle: o!.name,
    body: (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Loss Reason *</span>
          <select
            defaultValue=""
            onChange={e => { state.lossReason = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            <option value="" disabled>Select a reason</option>
            <option value="Price">Price</option>
            <option value="Competitor">Competitor</option>
            <option value="Timing">Timing</option>
            <option value="No Decision">No Decision</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Loss Competitor (optional)</span>
          <input
            placeholder="Who won the deal?"
            onChange={e => { state.lossCompetitor = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Loss Notes (optional)</span>
          <textarea
            placeholder="Additional context"
            onChange={e => { state.lossNotes = e.target.value; }}
            rows={3}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 resize-none"
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
          disabled={closeLost.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-danger text-white rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            if (!state.lossReason) {
              addToast({ type: 'error', message: 'Loss reason is required' });
              return;
            }
            closeLost.mutate(
              {
                id: o!.id,
                lossReason: state.lossReason,
                lossCompetitor: state.lossCompetitor.trim() || undefined,
                lossNotes: state.lossNotes.trim() || undefined,
              },
              {
                onSuccess: () => {
                  addToast({ type: 'info', message: `Deal closed: ${o!.name}` });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: `Close failed: ${err.message}` }),
              }
            );
          }}
        >
          Confirm Loss
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 2: Wire the Close Lost button to open the drawer**

Replace the current Close Lost button (lines 282-287):

```typescript
<button
  disabled={isMutating}
  onClick={() => closeLost.mutate({ id: o.id, lossReason: 'Unknown' })}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-danger hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Lost
</button>
```

With:

```typescript
<button
  disabled={isMutating}
  onClick={openCloseLostDrawer}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-danger hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Lost
</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat(pipeline): add Close Lost drawer with outcome fields (W-04)"
```

---

### Task 4: Verify end-to-end flow

- [ ] **Step 1: Start dev server if not running**

Run: `cd /Users/ottosavasti/Desktop/eco-insight && npm run dev`

- [ ] **Step 2: Navigate to an opportunity detail page**

Go to `http://localhost:3000/pipeline`, click on an opportunity to open the detail page.

- [ ] **Step 3: Test stage movement**

Click a stage button (e.g., "Discovery"). Confirm:
- Toast shows "Stage → Discovery"
- Stage button updates to show checkmark
- Button is disabled while mutation is pending

- [ ] **Step 4: Test Close Won drawer**

Click "Closed Won". Confirm:
- Drawer opens with win notes textarea and competitor input
- "Confirm Win" button works with or without filling fields
- Toast shows "Deal won! {name}" on success
- Drawer closes after success
- Opportunity stage updates to Closed Won

- [ ] **Step 5: Test Close Lost drawer**

Click "Closed Lost" on another opportunity. Confirm:
- Drawer opens with loss reason dropdown (required), competitor input, notes textarea
- Submit without selecting loss reason shows error toast
- After selecting reason and submitting: toast shows "Deal closed: {name}"
- Drawer closes after success

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix(pipeline): address W-04 integration issues"
```
