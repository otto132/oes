# Workflow Forms Design Spec

> **Backlog items**: W-06, W-09, W-11, W-14
> **Date**: 2026-03-13
> **Status**: Reviewed

---

## Overview

Four missing workflow forms that prevent core CRM operations. All backends already exist — this work is purely frontend drawer forms following the established `openDrawer()` + React Query mutation pattern.

### Drawer body pattern: React components for dynamic forms

The existing drawer pattern uses `openDrawer({ body: <JSX> })` with a plain JS state object. This works for static forms but **cannot re-render** when state changes (e.g., conditional fields, live probability display). Forms that need dynamic behavior must use a **React component** as the body:

```tsx
function CloseWonForm({ opp, onSubmit }: Props) {
  const [state, setState] = useState({ ... });
  return <div>...</div>;  // re-renders on state changes
}

openDrawer({ title: '...', body: <CloseWonForm opp={o} onSubmit={handleSubmit} /> });
```

This applies to: W-06 Close Lost (conditional "Lost To" field), W-11 (auto-probability display, typeahead). Static forms (W-09, W-14, W-06 Close Won) can use the existing plain state pattern.

### Cross-cutting enhancements

**Cmd+Enter / Ctrl+Enter to submit**: All drawers attach a `onKeyDown` handler on the form wrapper div that checks for `(e.metaKey || e.ctrlKey) && e.key === 'Enter'` and triggers submit.

**`isPending` guard**: All submit buttons are disabled while the mutation is in-flight, consistent with the existing pattern in pipeline detail (`isMutating` guard from commit `65db64d`).

**Error handling**: All mutations include `onError: (err) => addToast({ type: 'error', message: err.message })`. The `api-client.ts` `post()` function already parses error response bodies and throws with the message, so 409s and other errors surface automatically.

---

## W-06: Close Won / Close Lost Flows

### Problem

Pipeline detail page has "Closed Won" and "Closed Lost" buttons that fire mutations directly with no user input. Close Won sends empty data. Close Lost hardcodes `lossReason: 'Unknown'`.

### Close Won Drawer

**Trigger**: Existing "Closed Won" button in `pipeline/[id]/page.tsx` Move Stage section.

**Context header** (non-editable, visual confirmation):
- Deal name (bold)
- Deal amount (mono font)

**Fields**:
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Win Notes | textarea | No | — |
| Competitor Beaten | text input | No | — |

**Follow-up task section**:
- Checkbox: "Create follow-up task" (default: checked)
- Title: pre-filled "Onboarding kickoff: {account name}" (editable)
- Due date: date picker, default +7 days

**Submit behavior**:
1. Call `closeWon.mutate({ id, winNotes, competitorBeaten })`
2. If follow-up checkbox checked, call `api.tasks.create({ title, due, accountId: o.accId })` after close-won succeeds
3. If task creation fails, show error toast but do **not** roll back the close-won (deal stays closed)
4. Toast: "Deal won! 🎉" + "Follow-up task created" if applicable
5. Close drawer, query invalidation refreshes page

**API**: `POST /api/opportunities` with `action: 'close_won'` — already implemented. Task creation uses `accountId` (available as `o.accId` from the opp detail data), not `accountName`.

### Close Lost Drawer

**Trigger**: Existing "Closed Lost" button.

**Context header**: Same deal name + amount confirmation.

**Fields**:
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Loss Reason | select | Yes | — | Options: "Price", "Timing", "Competitor", "No Budget", "No Decision", "Other" |
| Lost To | text input | No | — | Conditionally shown when reason is "Competitor" (requires React component body — see pattern note above) |
| Notes | textarea | No | — | |

**Revisit date section**:
- Optional date picker: "Revisit on"
- When set, creates a task "Revisit: {deal name}" with that due date after close-lost mutation succeeds

**Submit behavior**:
1. Validate loss reason is selected
2. Call `closeLost.mutate({ id, lossReason, lossCompetitor, lossNotes })`
3. If revisit date set, call `api.tasks.create({ title: 'Revisit: {deal name}', due: revisitDate, accountId: o.accId })`. If task creation fails, show error toast but do not roll back the close-lost
4. Toast: "Deal marked as lost" + "Revisit task created on {date}" if applicable
5. Close drawer

**API**: `POST /api/opportunities` with `action: 'close_lost'` — already implemented.

### Files touched
- `src/app/(dashboard)/pipeline/[id]/page.tsx` — replace bare mutation calls with drawer openers

### No new hooks needed
`useCloseWon` and `useCloseLost` already exist in `src/lib/queries/opportunities.ts`. Task creation uses existing `api.tasks.create()` from `api-client.ts` directly (one-off call, not worth a separate mutation hook).

---

## W-09: Account Create Form

### Problem

No way to create accounts from the UI. API with dedup exists at `POST /api/accounts`.

### Trigger points
- **"+ New Account"** button in Accounts page header (next to title)

### Drawer

**Fields**:
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Name | text input | Yes | — | |
| Type | select | No | "Unknown" | Options: "Unknown", "PPA Buyer", "Certificate Trader", "Corporate Offtaker" (from existing data) |
| Country | select | No | — | Hardcoded list of common countries from seed data: "Finland", "Denmark", "Sweden", "Norway", "Germany", "Netherlands", "UK", "US", plus an "Other" option with freeform text input |
| Notes / Pain | textarea | No | — | Maps to `pain` field in API |

**Submit behavior**:
1. Validate name is non-empty
2. Call `createAccount.mutate({ name, type, country, notes })`
3. On 409 (duplicate): error toast with existing account name
4. On success: toast "Account created: {name}", close drawer, invalidate accounts query

### New code
- `useCreateAccount` mutation hook in `src/lib/queries/accounts.ts`
- `openNewAccountDrawer()` function in `accounts/page.tsx`

### Files touched
- `src/app/(dashboard)/accounts/page.tsx` — add button + drawer opener
- `src/lib/queries/accounts.ts` — add `useCreateAccount` hook

---

## W-11: Opportunity Create Form

### Problem

No way to create opportunities from the UI. API exists at `POST /api/opportunities`.

### Trigger points
- **"+ New Opportunity"** button in Pipeline page header
- **"+ New Opportunity"** button in Account detail → Opportunities tab (pre-fills account)

### Drawer

**Fields**:
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Name | text input | Yes | — | |
| Account | typeahead input | Yes | Pre-filled when opened from account detail | Debounced search against `/api/accounts?q=`; shows matching accounts with type badge; resolves to `accountId` |
| Stage | select | No | "Contacted" | Options from `KANBAN_STAGES` (excludes "Identified", "Closed Won", "Closed Lost" — new opps start at Contacted minimum) |
| Amount | number input | No | 0 | |
| Close Date | date picker | No | +90 days | |

**Auto-probability display**: Read-only line below stage select showing "Probability: {X}%" that updates live as stage changes, using `STAGE_PROB` from `src/lib/types.ts` (which uses display-name keys like `'Solution Fit'`). Requires React component body for live re-rendering.

**Account typeahead behavior** (highest-complexity item in this spec):
- User types → debounced (300ms) fetch to `/api/accounts?q={input}`
- Dropdown shows matching accounts (name + type badge), max 5 results
- Selecting sets `accountId` in state and displays account name as read-only text
- When opened from account detail: field is pre-filled and read-only, `accountId` already set
- If no match found: show "No accounts found" — user must create account first
- Implementation: inline within the `OpportunityCreateForm` component (no extracted typeahead component). Uses `useState` for query text, `useEffect` with debounce timer for search, simple absolute-positioned dropdown div

**Submit behavior**:
1. Validate name and accountId are present
2. Call `createOpportunity.mutate({ name, accountId, stage, amount, closeDate })`
3. On success: toast "Opportunity created: {name}", close drawer, invalidate opportunities + account detail queries

### New code
- `useCreateOpportunity` mutation hook in `src/lib/queries/opportunities.ts`
- `openNewOppDrawer(prefilledAccountId?, prefilledAccountName?)` function — used from both pipeline page and account detail page

### Files touched
- `src/app/(dashboard)/pipeline/page.tsx` — add button + drawer opener
- `src/app/(dashboard)/accounts/[id]/page.tsx` — add button in opps tab + drawer opener
- `src/lib/queries/opportunities.ts` — add `useCreateOpportunity` hook

---

## W-14: Activity Log on Account Detail

### Problem

Account detail has an Activity tab showing a timeline of activities. No way to add entries manually.

### Trigger points
- **"+ Log Note"** button at the top of the Activity tab on account detail
- **Quick-log chips** below the button: "📞 Call", "📧 Email", "🤝 Meeting" — open drawer with type pre-selected
- **"+ Log Note"** button on Opportunity detail page Activity section (pre-fills `accountId` from the opportunity's account)

### Drawer

**Fields**:
| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Type | select | No | "Note" (or pre-selected from chip) | Options: "Note", "Call", "Meeting", "Email" |
| Summary | text input | Yes | — | |
| Detail | textarea | No | — | |

`accountId` is passed implicitly from the context (account detail or opp detail) — not a visible field.

**Submit behavior**:
1. Validate summary is non-empty
2. Call `logActivity.mutate({ type, summary, detail, accountId, source: 'Manual' })`
3. On success: toast "Activity logged", close drawer, invalidate account detail query so timeline refreshes

### New code
- `src/lib/queries/activities.ts` (new file) — `useLogActivity` mutation hook + query keys
- `openLogActivityDrawer(accountId, preselectedType?)` function

### Files touched
- `src/app/(dashboard)/accounts/[id]/page.tsx` — add button + chips in activity tab + drawer opener
- `src/app/(dashboard)/pipeline/[id]/page.tsx` — add button in activity section + drawer opener
- `src/lib/queries/activities.ts` — new file

---

## Testing Strategy

Unit testing for these drawer forms is low-value (they're thin UI over existing tested APIs). The right verification is:

1. **Build passes** — `npm run build` with no errors
2. **TypeScript** — no type errors from new hooks or state objects
3. **Manual smoke test** — each drawer opens, submits, shows toast, closes, and data refreshes
4. **Existing tests** — `npm test` still passes (no regressions)

If Q-04 (E2E tests) is implemented later, these 4 flows should be added to the critical path test suite.

---

## Scope exclusions

- No optimistic updates (UX-06 is a separate backlog item)
- No drag-and-drop for pipeline (W-05 is separate)
- No account typeahead component extraction — inline implementation for now
- No new API endpoints needed — all backends exist
