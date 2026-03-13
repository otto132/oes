# Core Workflows Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 4 core CRM workflows to make approve, convert, close, and create actions functional with user feedback.

**Architecture:** All backends already exist. This is frontend wiring: extend the Toast primitive with action links, add an ApiError class for status-code-aware error handling, then wire contextual toasts and drawer forms into 3 pages. Two features (W-02 signal conversion drawer, W-07 task create drawer) are already implemented and only need minor enhancements.

**Tech Stack:** React 19, Next.js 15, Zustand, React Query (TanStack Query), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-13-core-workflows-design.md`

---

## Chunk 1: Shared Infrastructure (ApiError + Toast Action Link)

### Task 1: Add ApiError class to api-client.ts

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add ApiError class and update get/post helpers**

Add the `ApiError` class above the existing `get`/`post` functions, then update both to throw `ApiError` instead of plain `Error`:

```typescript
// Add after the imports, before BASE:
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

Update the `get` function (line 20-23):
```typescript
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, err.error?.message || err.error || `API ${path}: ${res.status}`);
  }
  return res.json();
}
```

Update the `post` function (line 26-37):
```typescript
async function post<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, err.error?.message || err.error || `API ${path}: ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds (ApiError is backward-compatible — existing `catch(err)` blocks still work since `ApiError extends Error`)

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: add ApiError class with HTTP status codes to api-client"
```

---

### Task 2: Add action link support to Toast

**Files:**
- Modify: `src/lib/store.ts`
- Modify: `src/components/ui/Toast.tsx`

- [ ] **Step 1: Update Toast interface and addToast in store.ts**

In `src/lib/store.ts`, update the `Toast` interface (line 6-10) to add optional action:

```typescript
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; href: string };
}
```

Update the `addToast` signature in the `Store` interface (line 20):
```typescript
addToast: (toast: { type: Toast['type']; message: string; action?: Toast['action'] }) => void;
```

Update the `addToast` implementation (line 38-48) to pass through the action and use longer timeout for toasts with actions:

```typescript
addToast: (toast) => {
  const id = `toast-${++_toastCounter}-${Date.now()}`;
  const newToast: Toast = { id, ...toast };
  set(s => {
    const next = [...s.toasts, newToast];
    return { toasts: next.length > 3 ? next.slice(next.length - 3) : next };
  });
  // Longer timeout for toasts with action links
  setTimeout(() => get().removeToast(id), toast.action ? 8000 : 5000);
},
```

- [ ] **Step 2: Update Toast.tsx to render action links**

In `src/components/ui/Toast.tsx`, add the `Link` import at the top:

```typescript
import Link from 'next/link';
```

Update the toast message span and add the action link (replace line 50 — the `<span>` with the message):

```tsx
<span className="text-[12px] text-[var(--text)] leading-snug flex-1">
  {toast.message}
  {toast.action && (
    <>
      {' '}
      <Link
        href={toast.action.href}
        onClick={() => removeToast(toast.id)}
        className="underline decoration-dotted hover:decoration-solid"
      >
        {toast.action.label}
      </Link>
    </>
  )}
</span>
```

Update the progress bar animation duration — toasts with actions need 8s animation instead of 5s. Replace the progress bar div (line 58):

```tsx
<div className={`absolute bottom-0 left-0 h-[2px] ${colors.bar} opacity-40 ${toast.action ? 'toast-progress-long' : 'toast-progress'}`} />
```

- [ ] **Step 3: Add the long-duration progress bar CSS animation**

In `src/app/globals.css`, add after the existing `toast-progress` keyframe/animation:

```css
.toast-progress-long {
  animation: toast-shrink 8s linear forwards;
}
```

Note: The existing `toast-progress` class uses a `toast-shrink` keyframe that goes from `width: 100%` to `width: 0%`. The long variant reuses the same keyframe with a longer duration. If the existing animation name differs, match it.

- [ ] **Step 4: Verify build passes**

Run: `npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts src/components/ui/Toast.tsx src/app/globals.css
git commit -m "feat: add action link support to Toast component"
```

---

## Chunk 2: W-01 Queue Approval Side-Effects

### Task 3: Add cross-query invalidation and contextual toasts to queue approve

**Files:**
- Modify: `src/lib/queries/queue.ts`
- Modify: `src/app/(dashboard)/queue/page.tsx`

- [ ] **Step 1: Update useApproveQueueItem to invalidate related queries**

In `src/lib/queries/queue.ts`, add imports for the keys from other query modules:

```typescript
import { leadKeys } from './leads';
import { taskKeys } from './tasks';
import { accountKeys } from './accounts';
```

Replace the `useApproveQueueItem` function (lines 20-27) with a version that accepts the queue item type and accId for targeted invalidation:

```typescript
export function useApproveQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, editedPayload }: { id: string; editedPayload?: Record<string, unknown> }) =>
      api.queue.approve(id, editedPayload),
    onSuccess: (_data, _vars) => {
      qc.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}
```

Note: We keep the hook simple and do cross-invalidation at the call site (in the page component's `onSuccess` callback), because the hook doesn't have access to the queue item's `type` and `accId`. The page component already has this context.

- [ ] **Step 2: Update queue page approve callbacks with contextual toasts and cross-invalidation**

In `src/app/(dashboard)/queue/page.tsx`, add imports at the top:

```typescript
import { useQueryClient } from '@tanstack/react-query';
import { leadKeys } from '@/lib/queries/leads';
import { taskKeys } from '@/lib/queries/tasks';
import { accountKeys } from '@/lib/queries/accounts';
```

Inside the `QueuePage` component (after `const { addToast, openDrawer, closeDrawer } = useStore();`), add a queryClient ref and a helper function:

```typescript
const qc = useQueryClient();

function handleApproveSuccess(q: QueueItem) {
  const p = q.payload || {};
  switch (q.type) {
    case 'lead_qualification':
      addToast({
        type: 'success',
        message: `Lead created for ${p.company || q.accName || 'company'}`,
        action: { label: 'View Leads →', href: '/leads' },
      });
      qc.invalidateQueries({ queryKey: leadKeys.all });
      break;
    case 'task_creation':
      addToast({
        type: 'success',
        message: `Task created: ${p.task || q.title || 'task'}`,
        action: { label: 'View Tasks →', href: '/tasks' },
      });
      qc.invalidateQueries({ queryKey: taskKeys.all });
      break;
    case 'enrichment':
      addToast({
        type: 'success',
        message: `Account updated: ${p.field || 'field'}`,
        action: q.accId ? { label: 'View Account →', href: `/accounts/${q.accId}` } : undefined,
      });
      if (q.accId) qc.invalidateQueries({ queryKey: accountKeys.detail(q.accId) });
      break;
    case 'outreach_draft':
      addToast({
        type: 'success',
        message: `Outreach logged for ${q.accName || 'account'}`,
        action: q.accId ? { label: 'View Account →', href: `/accounts/${q.accId}` } : undefined,
      });
      if (q.accId) qc.invalidateQueries({ queryKey: accountKeys.detail(q.accId) });
      break;
    default:
      addToast({ type: 'success', message: 'Approved' });
  }
}
```

Update the inline Approve button `onClick` (around line 258-265). Replace the `onSuccess` callback:

```typescript
onSuccess: () => handleApproveSuccess(q),
```

Similarly update the Edit & Approve drawer's `onSuccess` (around line 105-108). Replace:

```typescript
onSuccess: () => {
  handleApproveSuccess(q);
  closeDrawer();
},
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/queue.ts src/app/\(dashboard\)/queue/page.tsx
git commit -m "feat(queue): contextual approval toasts with entity links and cross-query invalidation"
```

---

## Chunk 3: W-02 Signal Conversion Enhancements

### Task 4: Add leadKeys invalidation and 409 error handling to signal conversion

**Files:**
- Modify: `src/lib/queries/signals.ts`
- Modify: `src/app/(dashboard)/signals/page.tsx`

- [ ] **Step 1: Update useConvertSignal to also invalidate leadKeys**

In `src/lib/queries/signals.ts`, add import:

```typescript
import { leadKeys } from './leads';
```

Update `useConvertSignal` (lines 25-32) to invalidate both signal and lead queries:

```typescript
export function useConvertSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, company, type, country }: { id: string; company: string; type?: string; country?: string }) =>
      api.signals.convert(id, company, type, country),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: signalKeys.all });
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
```

- [ ] **Step 2: Update signal conversion drawer with toast action link and 409 handling**

In `src/app/(dashboard)/signals/page.tsx`, add import for `ApiError`:

```typescript
import { ApiError } from '@/lib/api-client';
```

In the `openConvertDrawer` function, update the convert mutation callbacks (around lines 110-115). Replace the `onSuccess` and `onError` callbacks:

```typescript
onSuccess: () => {
  addToast({
    type: 'success',
    message: `Lead created for ${state.company}`,
    action: { label: 'View Leads →', href: '/leads' },
  });
  closeDrawer();
},
onError: (err) => {
  if (err instanceof ApiError && err.status === 409) {
    addToast({ type: 'error', message: `Lead or account already exists for ${state.company}` });
  } else {
    addToast({ type: 'error', message: `Failed to convert signal: ${err.message}` });
  }
},
```

- [ ] **Step 3: Verify build passes**

Run: `npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/signals.ts src/app/\(dashboard\)/signals/page.tsx
git commit -m "feat(signals): add lead query invalidation and 409 conflict handling on convert"
```

---

## Chunk 4: W-04 Pipeline Close-Out Drawers

### Task 5: Replace Close Won/Lost buttons with drawer forms

**Files:**
- Modify: `src/app/(dashboard)/pipeline/[id]/page.tsx`

- [ ] **Step 1: Add store and toast imports**

In `src/app/(dashboard)/pipeline/[id]/page.tsx`, add imports:

```typescript
import { useStore } from '@/lib/store';
```

Inside the `OppDetailPage` component, after the mutation hook declarations (after line 113), add:

```typescript
const { openDrawer, closeDrawer, addToast } = useStore();
```

- [ ] **Step 2: Add openCloseWonDrawer function**

Add this function inside the component, after the `addToast` line:

```typescript
function openCloseWonDrawer() {
  const state = { winNotes: '', competitorBeaten: '' };

  openDrawer({
    title: 'Close Won',
    subtitle: o!.name,
    body: (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">What made us win this deal?</span>
          <textarea
            onChange={e => { state.winNotes = e.target.value; }}
            rows={3}
            placeholder="Key factors, differentiators, timing..."
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Competitor Beaten (optional)</span>
          <input
            onChange={e => { state.competitorBeaten = e.target.value; }}
            placeholder="e.g. Salesforce, HubSpot"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
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
          className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            closeWon.mutate(
              {
                id: o!.id,
                winNotes: state.winNotes || undefined,
                competitorBeaten: state.competitorBeaten || undefined,
              },
              {
                onSuccess: () => {
                  addToast({ type: 'success', message: 'Deal closed as Won ✓' });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: `Failed to close deal: ${err.message}` }),
              }
            );
          }}
        >
          Close as Won
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 3: Add openCloseLostDrawer function**

Add this function right after `openCloseWonDrawer`:

```typescript
function openCloseLostDrawer() {
  const state = { lossReason: '', lossCompetitor: '', lossNotes: '' };
  let reasonEl: HTMLSelectElement | null = null;
  let competitorEl: HTMLDivElement | null = null;

  openDrawer({
    title: 'Close Lost',
    subtitle: o!.name,
    body: (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Loss Reason</span>
          <select
            ref={el => { reasonEl = el; }}
            defaultValue=""
            onChange={e => {
              state.lossReason = e.target.value;
              if (competitorEl) {
                competitorEl.style.display = e.target.value === 'Competitor' ? 'flex' : 'none';
              }
            }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            <option value="" disabled>Select a reason…</option>
            <option value="Price">Price</option>
            <option value="Timing">Timing</option>
            <option value="Competitor">Competitor</option>
            <option value="No Budget">No Budget</option>
            <option value="No Decision">No Decision</option>
            <option value="Champion Left">Champion Left</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <div
          ref={el => { competitorEl = el; }}
          className="flex flex-col gap-1"
          style={{ display: 'none' }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Who did we lose to?</span>
            <input
              onChange={e => { state.lossCompetitor = e.target.value; }}
              placeholder="e.g. Competitor name"
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">What can we learn? (optional)</span>
          <textarea
            onChange={e => { state.lossNotes = e.target.value; }}
            rows={3}
            placeholder="Lessons learned, what to improve..."
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
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
          className="px-3.5 py-1.5 text-[12px] font-medium bg-red-500/[.15] text-red-400 border border-red-500/[.2] rounded-md hover:bg-red-500/[.25] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            if (!state.lossReason) {
              addToast({ type: 'error', message: 'Please select a loss reason' });
              return;
            }
            closeLost.mutate(
              {
                id: o!.id,
                lossReason: state.lossReason,
                lossCompetitor: state.lossCompetitor || undefined,
                lossNotes: state.lossNotes || undefined,
              },
              {
                onSuccess: () => {
                  addToast({ type: 'info', message: 'Deal closed as Lost' });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: `Failed to close deal: ${err.message}` }),
              }
            );
          }}
        >
          Close as Lost
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 4: Wire the buttons to open drawers instead of mutating directly**

Replace the Close Won button (around line 275-280). Change from:

```tsx
<button
  disabled={isMutating}
  onClick={() => closeWon.mutate({ id: o.id })}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-brand font-medium hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Won
</button>
```

To:

```tsx
<button
  disabled={isMutating}
  onClick={() => openCloseWonDrawer()}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-brand font-medium hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Won
</button>
```

Replace the Close Lost button (around line 282-287). Change from:

```tsx
<button
  disabled={isMutating}
  onClick={() => closeLost.mutate({ id: o.id, lossReason: 'Unknown' })}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-danger hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Lost
</button>
```

To:

```tsx
<button
  disabled={isMutating}
  onClick={() => openCloseLostDrawer()}
  className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-danger hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
>
  Closed Lost
</button>
```

- [ ] **Step 5: Verify build passes**

Run: `npx next build --no-lint 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/pipeline/\[id\]/page.tsx
git commit -m "feat(pipeline): add Close Won/Lost drawer forms with structured data capture"
```

---

## Chunk 5: Verification

### Task 6: Final verification

- [ ] **Step 1: Run all existing tests**

Run: `npx vitest run`
Expected: All 143+ tests pass

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run full build**

Run: `npx next build --no-lint`
Expected: Build succeeds with no errors

- [ ] **Step 4: Manual smoke test checklist**

Start the dev server and verify these flows work:
1. **Queue page**: Approve an item → see contextual toast with entity link → click link → navigate to correct page
2. **Signals page**: Click "→ Lead" → drawer opens with pre-filled company → submit → see toast with "View Leads →" link
3. **Pipeline detail**: Click "Closed Won" → drawer opens with win notes form → submit → deal closes → toast confirms
4. **Pipeline detail**: Click "Closed Lost" → drawer opens with loss reason dropdown → select reason → submit → toast confirms
5. **Tasks page**: Click "+ New Task" → fill form → submit → task appears in list (this should already work)
