# Mega Build: Type Unification + Kanban DnD + CRUD Forms + Light Mode + Visual Polish

**Date:** 2026-03-14
**Status:** Approved

## Overview

Five-phase build that transforms eco-insight from a demo-quality app into a polished, functional SaaS product. Phases are ordered by dependency: type unification first (touches every file), then features built on clean types, then visual polish last.

## Phase 1: Type Unification

**Goal:** Rewrite frontend types to match Prisma naming exactly, simplifying the adapter layer.

### Type Renames

**User:** `ini` → `initials`, `ac` → `color`

**FIUACScores:** `f` → `scoreFit`, `i` → `scoreIntent`, `u` → `scoreUrgency`, `a` → `scoreAccess`, `c` → `scoreCommercial`

**DealHealth:** `eng` → `healthEngagement`, `stake` → `healthStakeholders`, `comp` → `healthCompetitive`, `time` → `healthTimeline`

**Signal:** `src` → `source`, `srcUrl` → `sourceUrl`, `at` → `detectedAt`, `sum` → `summary`, `rel` → `relevance`, `conf` → `confidence` (change type from `string` to `number`), `why` → `reasoning`

**Lead:** `src` → `source`, `fit` → `moduleFit`, `conf` → `confidence` (change type from `string` to `number`)

**Account:** `cc` → `countryCode`, `pipe` → `pipelineValue`, `lastAct` → `lastActivityAt`, `fit` → `moduleFit`, `aiConf` → `aiConfidence`

**Opportunity:** `accId` → `accountId`, `accName` → `accountName`, `amt` → `amount`, `prob` → `probability`, `close` → `closeDate`, `next` → `nextAction`, `nextDate` → `nextActionDate`, `lossComp` → `lossCompetitor`

**QueueItem:** `conf` → `confidence`, `confBreak` → `confidenceBreakdown`, `pri` → `priority`, `rejReason` → `rejectionReason`

**Task:** `accName` → `accountName`, `accId` → `accountId`, `due` → `dueDate`, `pri` → `priority`, `src` → `source`

**TaskComment:** `by` → `author`, `at` → `createdAt`

**Goal:** `accName` → `accountName`, `accId` → `accountId`

**Activity:** `accId` → `accountId`, `accName` → `accountName`, `sum` → `summary`, `who` → `author`, `src` → `source`, `date` → `createdAt` (maps from Prisma `createdAt`)

**Email:** `subj` → `subject`, `from` → `fromEmail`, `prev` → `preview`, `dt` → `receivedAt`, `cls` → `classification`, `clsConf` → `classificationConf`, `acc` → `accountName`, `accId` → `accountId`, `linked` → `isLinked`, `unread` → `isUnread`, `archived` → `isArchived` (optional), `agent` → `classifierAgent`

**Meeting:** `dur` → `duration`, `acc` → `accountName`, `accId` → `accountId`, `who` → `attendees`, `prep` → `prepStatus`, `time` → `startTime` (derived: adapter formats `Date` to `HH:MM` string), `date` remains (adapter converts `Date` to ISO string)

### Enum Renames

**OppStage:** `'Solution Fit'` → `'SolutionFit'`, `'Closed Won'` → `'ClosedWon'`, `'Closed Lost'` → `'ClosedLost'`, `'Verbal Commit'` → `'VerbalCommit'`

**ContactRole:** `'Economic Buyer'` → `'EconomicBuyer'`, `'Technical Buyer'` → `'TechnicalBuyer'`

**TaskStatus:** `'In Progress'` → `'InProgress'`, `'In Review'` → `'InReview'`

### Constants Updates

`STAGES`, `KANBAN_STAGES`, `STAGE_PROB`, `STAGE_COLOR`, and `LEAD_STAGES` arrays/records must update their keys to match new PascalCase enum values. For example:
- `STAGE_PROB` keys: `'Solution Fit': 50` → `'SolutionFit': 50`
- `STAGE_COLOR` keys: `'Solution Fit': '#33a882'` → `'SolutionFit': '#33a882'`
- `KANBAN_STAGES` array values: `'Solution Fit'` → `'SolutionFit'`

### Display Labels

Add `displayLabel(value: string): string` utility in `src/lib/utils.ts` for rendering PascalCase enums as human-readable text in the UI (e.g. `'SolutionFit'` → `'Solution Fit'`, `'EconomicBuyer'` → `'Economic Buyer'`). Inserts a space before each uppercase letter that follows a lowercase letter. Used in stage badges, status badges, role selects, and anywhere enums are displayed.

### Adapter Simplification

`adapters.ts` is simplified but **not eliminated**. Remaining responsibilities:
- Date → ISO string conversion
- Optional field spreading (conditionals for nullable fields)
- Nested object flattening: `account: { id, name }` → `accountId`/`accountName` (Opportunity, Task, Goal, Activity)
- Meeting: `startTime` Date → `HH:MM` string formatting, `duration` number → display string
- Confidence number formatting where needed (moved to UI display layer)

What's **removed** from adapters: all enum maps (`OPP_STAGE_MAP`, `CONTACT_ROLE_MAP`, `SIGNAL_STATUS_MAP`, `TASK_STATUS_MAP`), field renaming (since FE fields now match Prisma).

### Files Affected

- `src/lib/types.ts` — type definitions + constants (`STAGES`, `KANBAN_STAGES`, `STAGE_PROB`, `STAGE_COLOR`)
- `src/lib/adapters.ts` — remove enum maps, simplify field mapping
- `src/lib/data.ts` — mock data field names
- `src/lib/utils.ts` — add `displayLabel()`, update `STAGE_PROB` references
- `src/components/ui/index.tsx` — FIUACBars, ScorePill (score field names)
- `src/components/layout/Sidebar.tsx` — `user.initials`
- 8 dashboard pages + 2 detail pages
- `src/lib/queries/opportunities.ts`, `src/lib/queries/tasks.ts`
- `src/app/api/queue/route.ts`
- `src/lib/__tests__/adapters.test.ts`

## Phase 2: Pipeline Kanban Drag & Drop

**Goal:** HTML5 native drag-and-drop for moving deals between stage columns.

### Implementation

- `draggable="true"` + `onDragStart`/`onDragEnd` on opportunity cards
- `onDragOver`/`onDrop` on stage columns
- On drop: wire into existing `useMoveStage()` mutation hook (already in `src/lib/queries/opportunities.ts` with optimistic update logic)
- Visual feedback: dragging card reduced opacity, target column `border-color: var(--brand)` highlight
- Empty columns show drop zone placeholder during drag
- Mobile: no drag (uses existing list view)

### Files Affected

- `src/app/(dashboard)/pipeline/page.tsx` — add drag handlers to existing kanban cards/columns

## Phase 3: CRUD Forms

**Goal:** Create/edit forms for leads and contacts. Inline editing on detail pages. Account create form already exists.

### Lead Create Form

- Fields: company, domain, type (dropdown), country, region, pain (textarea)
- Drawer pattern matching existing OpportunityCreateForm
- Mutation: `api.leads.create()` via existing hook

### Account Create Form

**Already exists** in `accounts/page.tsx` via `openNewAccountDrawer()`. Uses types: `PPA Buyer`, `Certificate Trader`, `Corporate Offtaker`, etc. No changes needed unless type list should be updated.

### Contact Create Form

- Fields: name, title, email, phone, role (Champion/EconomicBuyer/TechnicalBuyer/Influencer/Blocker), warmth (Strong/Warm/Cold)
- Rendered in drawer from account detail page
- Calls contacts API endpoint

### Inline Editing (Detail Pages)

- Account detail: click-to-edit on pain, whyNow, competitors, status
- Opportunity detail: click-to-edit on nextAction, amount, closeDate, stage
- Pattern: click field → swap to input → blur/Enter saves via PATCH mutation → swap back to display

### Files Affected

- `src/app/(dashboard)/leads/page.tsx` — add create form + drawer trigger
- `src/app/(dashboard)/accounts/[id]/page.tsx` — add contact create form + inline editing
- `src/app/(dashboard)/pipeline/[id]/page.tsx` — add inline editing

## Phase 4: Light Mode Polish

**Goal:** Audit and fix hardcoded dark-mode colors so light mode works properly.

### Approach

- Grep for hardcoded hex colors (`#fafafa`, `#111113`, `#09090b`, `#27272a`, `#1e1e22`, etc.) in component files
- Replace with CSS variable references (`var(--text)`, `var(--surface)`, `var(--elevated)`, etc.)
- Verify theme toggle applies `dark` class on `<html>` correctly at page load (prevent flash)
- Root layout must set initial theme class server-side based on cookie/localStorage
- Test all components in both modes: stage badges, score pills, confidence dots, drawer overlay, form inputs

### Files Affected

- `src/app/globals.css` — potentially minor additions
- ~10 page/component files with hardcoded color values
- Root layout for initial theme class

## Phase 5: Visual Enhancements

### A. Kanban Card Polish

- Gradient left border color mapped to health score (green → yellow → red)
- Thin progress bar at card top showing stage position in pipeline (% through KANBAN_STAGES)
- "Xd in stage" badge — use Opportunity `updatedAt` field from Prisma (already in schema) as proxy for last stage change
- Hover reveals quick-action buttons (move to next stage, edit amount)
- File: `pipeline/page.tsx`

### B. Smooth Transitions & Micro-interactions

- Staggered `fadeUp` on list items: `animation-delay: calc(var(--i) * 50ms)`
- Kanban drag: `scale(1.03)` + elevated shadow on grabbed card
- Status badge changes: brief green pulse animation
- Dashboard stat numbers: count-up animation on mount via `requestAnimationFrame`
- Files: `globals.css` (keyframes) + page components (CSS variable `--i` per item)

### C. Dashboard Sparklines

- SVG sparklines (no library) in home page stat cards
- 7-day trend data from API or computed from recent pipeline/activity changes
- Up/down arrow with percentage delta (green positive, red negative)
- Gradient fill under the sparkline for visual weight
- File: `src/app/(dashboard)/page.tsx`

### D. Wired Command Palette (Cmd+K)

- Connect existing `CommandPalette` component to `/api/search` endpoint (already exists at `src/app/api/search/route.ts` — searches across accounts, opportunities, leads, contacts)
- Show recent items by default (localStorage), fuzzy filter on type
- Group results by type: Accounts, Deals, Leads, Contacts
- Keyboard navigation: arrow keys + Enter to open
- File: `CommandPalette` component + search integration

## Execution Order

1. Phase 1 (Type Unification) — must land first, touches every file
2. Phase 2 (Kanban DnD) — builds on clean types
3. Phase 3 (CRUD Forms) — builds on clean types
4. Phase 4 (Light Mode) — independent but best after type changes settled
5. Phase 5 (Visual Polish) — final layer

Phases 2 and 3 can be parallelized after Phase 1 lands.

## Testing Strategy

- TypeScript compiler (`tsc --noEmit`) validates type rename completeness
- Manual smoke test each page after type unification
- Kanban DnD: test drag between all stage pairs, test optimistic revert on network error
- CRUD forms: test create + verify in list, test inline edit + verify persists on refresh
- Light mode: visual check every page in both themes
- Sparklines: verify SVG renders with real data range
