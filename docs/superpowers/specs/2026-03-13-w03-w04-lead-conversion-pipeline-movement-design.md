# W-03 Lead Conversion + W-04 Pipeline Stage Movement — Design Spec

> Generated: 2026-03-13
> Status: Approved
> Scope: Two independent features to be implemented in parallel

---

## W-03: Lead → Account/Opportunity Conversion

### Overview

Add action buttons to lead cards in the kanban view and wire the Convert flow through a drawer form. The API endpoint (`action: 'convert'`) and api-client method (`api.leads.convert()`) already exist — this is purely UI wiring plus mutation hooks.

### Lead Card Actions

Each lead card gets contextual action buttons that appear on hover (desktop) or always visible (mobile), rendered as a compact row at the card bottom. Available actions depend on stage:

| Lead Stage   | Available Actions                         |
|-------------|-------------------------------------------|
| New          | Advance (→ Researching), Disqualify       |
| Researching  | Advance (→ Qualified), Disqualify         |
| Qualified    | **Convert** (→ Account), Disqualify       |

- **Advance** — calls `api.leads.advance(id)`, shows success toast using display stage name from API response, no drawer needed
- **Disqualify** — calls `api.leads.disqualify(id)`, shows info toast `"Lead disqualified"`, no drawer needed
- **Convert** — opens the Convert drawer (see below)

All actions disable while their mutation is pending (`isPending` guard).

### Convert Drawer

Follows the established drawer pattern from W-02 (signal → lead conversion):

**Header:**
- Title: "Convert to Account"
- Subtitle: `{lead.company}`

**Body — Account Fields (always visible):**
- Account Name — text input, pre-filled from `lead.company`
- Account Type — select dropdown (matching W-02 pattern), pre-filled from `lead.type`. Options: PPA Buyer, Certificate Trader, Corporate Offtaker, Unknown
- Country — text input, pre-filled from `lead.country`

**Body — Opportunity Toggle:**
- Checkbox: "Also create opportunity"
- When checked, reveals:
  - Opportunity Name — text input, default: `"{company} — Opportunity"`
  - Amount — number input, default empty
  - Stage — dropdown following pipeline progression: Identified, Contacted, Discovery (default), Qualified

**Footer:**
- Cancel button (calls `closeDrawer()`)
- "Convert" button (disabled while `isPending`)

**Form State:**
- Mutable closure object pattern (same as W-02 signals)
- `onChange` handlers update state directly

**Validation:**
- Account Name required (trim + check)
- If opp checkbox checked: Opp Name required

**On Submit:**
```
convertLead.mutate(
  { id, accountName, accountType, oppName?, oppAmount?, oppStage? },
  {
    onSuccess: () => toast success + closeDrawer,
    onError: (err) => toast error
  }
)
```

**Query Invalidation on Success:**
- Invalidate `leadKeys.all` (lead disappears from kanban)
- Invalidate `accountKeys.all` (new account appears)
- Invalidate `oppKeys.all` (if opportunity created)

### New Mutation Hook (`src/lib/queries/leads.ts`)

`useAdvanceLead()` and `useDisqualifyLead()` already exist in `queries/leads.ts`. Only one new hook is needed:

```typescript
useConvertLead()  — mutationFn: api.leads.convert(id, data) → invalidates leadKeys.all + accountKeys.all + oppKeys.all
```

Note: `accountKeys` imported from `queries/accounts.ts`, `oppKeys` from `queries/opportunities.ts`.

### Files Changed

| File | Change |
|------|--------|
| `src/app/(dashboard)/leads/page.tsx` | Add action buttons to lead cards, add convert drawer opener function, import `useStore` for drawer/toast |
| `src/lib/queries/leads.ts` | Add `useConvertLead()` hook (advance/disqualify already exist) |

### Existing Infrastructure (no changes needed)

- `src/app/api/leads/route.ts` — already has `advance`, `disqualify`, `convert` handlers
- `src/lib/api-client.ts` — already has `api.leads.advance()`, `api.leads.disqualify()`, `api.leads.convert()`
- `src/components/shell/Drawer.tsx` — existing drawer component
- `src/lib/store.ts` — `openDrawer()`, `closeDrawer()`, `addToast()`

---

## W-04: Pipeline Stage Movement — Toast Feedback + Close Drawers

### Overview

The opportunity detail page already has stage buttons wired to `useMoveStage()`, `useCloseWon()`, and `useCloseLost()` mutation hooks. What's missing: toast feedback on all stage actions, and drawers for Close Won / Close Lost to capture outcome metadata.

### Toast Feedback on Stage Movement

Add `onSuccess` / `onError` callbacks to the existing `move.mutate()` call in the detail page:

- **Move success:** toast `"Stage → {display stage name}"` (use `mapOppStage()` from adapters to convert Prisma enum to display name)
- **Move error:** toast `"Move failed: {error.message}"`

### Close Won Drawer

Triggered when user clicks the "Closed Won" button (replaces direct mutation call):

**Header:**
- Title: "Close Won"
- Subtitle: `{opportunity.name}`

**Body:**
- Win Notes — textarea, optional, placeholder "What helped us win?"
- Competitor Beaten — text input, optional, placeholder "Which competitor?"

**Footer:**
- Cancel + "Confirm Win" (disabled while `isPending`)

**On Submit:**
```
closeWon.mutate(
  { id, winNotes, competitorBeaten },
  {
    onSuccess: () => toast "Deal won! {opp.name}" + closeDrawer,
    onError: (err) => toast error
  }
)
```

### Close Lost Drawer

Triggered when user clicks the "Closed Lost" button:

**Header:**
- Title: "Close Lost"
- Subtitle: `{opportunity.name}`

**Body:**
- Loss Reason — dropdown, **required**. Options: Price, Competitor, Timing, No Decision, Other
- Loss Competitor — text input, optional, placeholder "Who won the deal?"
- Loss Notes — textarea, optional, placeholder "Additional context"

**Footer:**
- Cancel + "Confirm Loss" (disabled while `isPending`)

**Validation:**
- Loss Reason required

**On Submit:**
```
closeLost.mutate(
  { id, lossReason, lossCompetitor, lossNotes },
  {
    onSuccess: () => toast "Deal closed: {opp.name}" + closeDrawer,
    onError: (err) => toast error
  }
)
```

### Files Changed

| File | Change |
|------|--------|
| `src/app/(dashboard)/pipeline/[id]/page.tsx` | Import `useStore` for drawer/toast, add toast callbacks to move handler, replace close won/lost direct calls with drawer openers |

### Existing Infrastructure (no changes needed)

- `src/app/api/opportunities/route.ts` — already handles `move`, `close_won`, `close_lost` with activity logging
- `src/lib/queries/opportunities.ts` — `useMoveStage()`, `useCloseWon()`, `useCloseLost()` hooks exist
- `src/lib/api-client.ts` — `api.opportunities.move()`, `.closeWon()`, `.closeLost()` exist

---

## Parallel Implementation Notes

These two features are fully independent:
- **W-03** touches `leads/page.tsx` + `queries/leads.ts`
- **W-04** touches `pipeline/[id]/page.tsx` only

No shared file edits. Safe for parallel worktree execution.

### UI Patterns (shared conventions)

Both features follow the same established patterns:
- Drawer form with mutable state object in closure
- `isPending` guards on submit buttons
- Toast feedback via `addToast()` from store
- Query invalidation on mutation success
- Input styling: `px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)]`
