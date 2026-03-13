# W-03 Lead → Account/Opportunity Conversion — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add action buttons (Advance, Convert, Disqualify) to lead cards and wire the Convert flow through a drawer form.

**Architecture:** The API (`action: 'convert'`) and api-client (`api.leads.convert()`) already exist. This is UI wiring: one new mutation hook in `queries/leads.ts` + action buttons and a convert drawer in `leads/page.tsx`. Follows the established drawer pattern from signals page (W-02).

**Tech Stack:** React 19, TanStack React Query, Zustand (drawer/toast), Next.js App Router

**Spec:** `docs/superpowers/specs/2026-03-13-w03-w04-lead-conversion-pipeline-movement-design.md`

---

## Chunk 1: Mutation Hook + Lead Card Actions + Convert Drawer

### Task 1: Add `useConvertLead` mutation hook

**Files:**
- Modify: `src/lib/queries/leads.ts`

- [ ] **Step 1: Add the `useConvertLead` hook**

Add this after the existing `useDisqualifyLead` hook (line 30):

```typescript
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';

// ... existing code ...

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; accountName?: string; accountType?: string; oppName?: string; oppAmount?: number; oppStage?: string }) =>
      api.leads.convert(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
```

Note: Import `accountKeys` from `./accounts` and `oppKeys` from `./opportunities` at the top of the file.

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/ottosavasti/Desktop/eco-insight && npx tsc --noEmit src/lib/queries/leads.ts 2>&1 | head -20`

If there are import issues, ensure the import paths resolve correctly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/leads.ts
git commit -m "feat(leads): add useConvertLead mutation hook (W-03)"
```

---

### Task 2: Add action buttons to lead cards

**Files:**
- Modify: `src/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Add imports and hooks**

Update the imports at the top of the file. The current imports (lines 1-5):

```typescript
'use client';
import { useLeadsQuery } from '@/lib/queries/leads';
import { Badge, Avatar, FIUACBars, ScorePill, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
import { compositeScore } from '@/lib/utils';
import type { Lead } from '@/lib/types';
```

Replace with:

```typescript
'use client';
import { useStore } from '@/lib/store';
import { useLeadsQuery, useAdvanceLead, useDisqualifyLead, useConvertLead } from '@/lib/queries/leads';
import { Badge, Avatar, FIUACBars, ScorePill, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
import { compositeScore } from '@/lib/utils';
import type { Lead } from '@/lib/types';
```

- [ ] **Step 2: Initialize hooks in the component**

Inside `LeadsPage()`, after the existing `useLeadsQuery` call (line 40), add:

```typescript
const { openDrawer, closeDrawer } = useStore();
const addToast = useStore(s => s.addToast);
const advance = useAdvanceLead();
const disqualify = useDisqualifyLead();
const convertLead = useConvertLead();
```

- [ ] **Step 3: Add action buttons to desktop kanban cards**

Inside the desktop kanban card `div` (the one starting at line 73 with `className="rounded-lg p-3 mb-1.5 bg-[var(--elevated)]..."`), add an action row after the FIUAC bars line (line 81). The actions should appear on hover.

Replace the existing card content (lines 73-82):

```typescript
<div key={l.id} className="group rounded-lg p-3 mb-1.5 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:-translate-y-px hover:border-[var(--border-strong)] transition-all">
  <div className="text-[10px] text-muted mb-0.5">{l.type || 'Unknown'} · {l.country || '—'}</div>
  <div className="text-[12.5px] font-medium mb-1.5">{l.company}</div>
  <div className="text-[11px] text-sub leading-tight line-clamp-2 mb-2">{l.pain || 'No pain hypothesis yet'}</div>
  <div className="flex items-center justify-between mb-1">
    <div className="flex items-center gap-1">{l.fit.slice(0, 2).map(f => <Badge key={f} variant="ok" className="!text-[8px]">{f}</Badge>)}</div>
    <Avatar initials={l.owner.ini} color={l.owner.ac} size="xs" />
  </div>
  <div className="flex items-center gap-1.5"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
  {/* Action buttons — visible on hover (desktop) */}
  <div className="hidden group-hover:flex items-center gap-1 mt-2 pt-2 border-t border-[var(--border)]">
    {l.stage === 'Qualified' ? (
      <button
        disabled={convertLead.isPending}
        onClick={() => openConvertDrawer(l)}
        className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--brand)] text-[#09090b] hover:brightness-110 transition-colors disabled:opacity-50"
      >
        Convert
      </button>
    ) : (
      <button
        disabled={advance.isPending}
        onClick={() => advance.mutate(l.id, {
          onSuccess: (data: any) => addToast({ type: 'success', message: `Lead advanced to ${data?.data?.stage || 'next stage'}` }),
          onError: (err: Error) => addToast({ type: 'error', message: err.message }),
        })}
        className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
      >
        Advance
      </button>
    )}
    <button
      disabled={disqualify.isPending}
      onClick={() => disqualify.mutate(l.id, {
        onSuccess: () => addToast({ type: 'info', message: 'Lead disqualified' }),
        onError: (err: Error) => addToast({ type: 'error', message: err.message }),
      })}
      className="px-2 py-1 text-[10px] text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
    >
      Disqualify
    </button>
  </div>
</div>
```

Key changes:
- Added `group` class to the card wrapper for hover targeting
- Added the action row with `hidden group-hover:flex` for desktop hover reveal
- Advance button shows for New/Researching stages, Convert button shows for Qualified
- Disqualify always available

- [ ] **Step 4: Add action buttons to mobile list cards**

For the mobile cards (starting at line 95), add always-visible action buttons. Replace the mobile card (lines 95-102):

```typescript
<div key={l.id} className="rounded-lg p-3 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] hover:border-[var(--border-strong)] transition-colors">
  <div className="flex items-center justify-between mb-1">
    <span className="text-[12.5px] font-medium">{l.company}</span>
    <Badge variant={stageMeta[l.stage]?.variant || 'neutral'} className="!text-[9px]">{l.stage}</Badge>
  </div>
  <div className="text-[11px] text-sub mb-1.5">{l.type} · {l.country || '—'}</div>
  <div className="flex items-center gap-1.5 mb-2"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
  {/* Action buttons — always visible on mobile */}
  <div className="flex items-center gap-1 pt-2 border-t border-[var(--border)]">
    {l.stage === 'Qualified' ? (
      <button
        disabled={convertLead.isPending}
        onClick={() => openConvertDrawer(l)}
        className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--brand)] text-[#09090b] hover:brightness-110 transition-colors disabled:opacity-50"
      >
        Convert
      </button>
    ) : (
      <button
        disabled={advance.isPending}
        onClick={() => advance.mutate(l.id, {
          onSuccess: (data: any) => addToast({ type: 'success', message: `Lead advanced to ${data?.data?.stage || 'next stage'}` }),
          onError: (err: Error) => addToast({ type: 'error', message: err.message }),
        })}
        className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
      >
        Advance
      </button>
    )}
    <button
      disabled={disqualify.isPending}
      onClick={() => disqualify.mutate(l.id, {
        onSuccess: () => addToast({ type: 'info', message: 'Lead disqualified' }),
        onError: (err: Error) => addToast({ type: 'error', message: err.message }),
      })}
      className="px-2 py-1 text-[10px] text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
    >
      Disqualify
    </button>
  </div>
</div>
```

Key change from desktop: uses `flex` instead of `hidden group-hover:flex` so buttons are always visible on mobile.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/leads/page.tsx
git commit -m "feat(leads): add advance/convert/disqualify action buttons to cards (W-03)"
```

---

### Task 3: Add convert drawer

**Files:**
- Modify: `src/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Add `openConvertDrawer` function**

Add this function inside the `LeadsPage` component, after the hook initializations and before the `if (isLoading)` check. This follows the exact pattern from `openConvertDrawer` in `signals/page.tsx` (lines 53-124):

```typescript
function openConvertDrawer(l: Lead) {
  const state = {
    accountName: l.company,
    accountType: l.type || 'Unknown',
    country: l.country || '',
    createOpp: false,
    oppName: `${l.company} — Opportunity`,
    oppAmount: '',
    oppStage: 'Discovery',
  };

  openDrawer({
    title: 'Convert to Account',
    subtitle: l.company,
    body: (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Account Name</span>
          <input
            defaultValue={state.accountName}
            onChange={e => { state.accountName = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Account Type</span>
          <select
            defaultValue={state.accountType}
            onChange={e => { state.accountType = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            <option value="Unknown">Unknown</option>
            <option value="PPA Buyer">PPA Buyer</option>
            <option value="Certificate Trader">Certificate Trader</option>
            <option value="Corporate Offtaker">Corporate Offtaker</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Country</span>
          <input
            defaultValue={state.country}
            onChange={e => { state.country = e.target.value; }}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>

        {/* Opportunity toggle */}
        <label className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
          <input
            type="checkbox"
            defaultChecked={state.createOpp}
            onChange={e => {
              state.createOpp = e.target.checked;
              const oppSection = document.getElementById('opp-fields');
              if (oppSection) oppSection.style.display = e.target.checked ? 'flex' : 'none';
            }}
            className="rounded border-[var(--border)]"
          />
          <span className="text-[11px] font-medium text-[var(--text)]">Also create opportunity</span>
        </label>
        <div id="opp-fields" className="flex-col gap-3" style={{ display: 'none' }}>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Opportunity Name</span>
            <input
              defaultValue={state.oppName}
              onChange={e => { state.oppName = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</span>
            <input
              type="number"
              placeholder="0"
              onChange={e => { state.oppAmount = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Stage</span>
            <select
              defaultValue={state.oppStage}
              onChange={e => { state.oppStage = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="Identified">Identified</option>
              <option value="Contacted">Contacted</option>
              <option value="Discovery">Discovery</option>
              <option value="Qualified">Qualified</option>
            </select>
          </label>
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
          disabled={convertLead.isPending}
          className="px-3.5 py-1.5 text-[12px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => {
            if (!state.accountName.trim()) {
              addToast({ type: 'error', message: 'Account name is required' });
              return;
            }
            if (state.createOpp && !state.oppName.trim()) {
              addToast({ type: 'error', message: 'Opportunity name is required' });
              return;
            }
            convertLead.mutate(
              {
                id: l.id,
                accountName: state.accountName.trim(),
                accountType: state.accountType,
                ...(state.createOpp ? {
                  oppName: state.oppName.trim(),
                  oppAmount: state.oppAmount ? Number(state.oppAmount) : undefined,
                  oppStage: state.oppStage,
                } : {}),
              },
              {
                onSuccess: () => {
                  addToast({ type: 'success', message: `Account created: ${state.accountName}` });
                  closeDrawer();
                },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
        >
          Convert
        </button>
      </>
    ),
  });
}
```

- [ ] **Step 2: Verify the page compiles and renders**

Run: `cd /Users/ottosavasti/Desktop/eco-insight && npx next build 2>&1 | tail -20`

Or if dev server is running, check for compilation errors in the terminal.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/leads/page.tsx
git commit -m "feat(leads): add convert-to-account drawer with optional opportunity (W-03)"
```

---

### Task 4: Verify end-to-end flow

- [ ] **Step 1: Start dev server if not running**

Run: `cd /Users/ottosavasti/Desktop/eco-insight && npm run dev`

- [ ] **Step 2: Verify leads page loads**

Navigate to `http://localhost:3000/leads`. Confirm:
- Kanban cards show action buttons on hover (desktop)
- "Advance" shows on New/Researching leads
- "Convert" shows on Qualified leads
- "Disqualify" shows on all leads

- [ ] **Step 3: Test advance action**

Click "Advance" on a New lead. Confirm:
- Toast shows success message with new stage
- Lead moves to Researching column
- Button is disabled while mutation is pending

- [ ] **Step 4: Test convert flow**

Click "Convert" on a Qualified lead. Confirm:
- Drawer opens with pre-filled account name, type, country
- "Also create opportunity" checkbox reveals opp fields
- Submit creates account (check Accounts page)
- Lead disappears from kanban
- Toast confirms creation

- [ ] **Step 5: Test disqualify action**

Click "Disqualify" on a lead. Confirm:
- Toast shows "Lead disqualified"
- Lead disappears from kanban

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -u
git commit -m "fix(leads): address W-03 integration issues"
```
