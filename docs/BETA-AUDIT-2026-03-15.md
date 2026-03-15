# Beta-Readiness Audit Report — Eco-Insight Revenue OS

**Date:** March 15, 2026
**Auditor:** Cross-functional product audit team (QA, Design, Frontend, Backend, Security, Ops)
**Scope:** Full codebase review for internal beta readiness (March 16, 2026)
**Build status:** Compiles successfully. 417/418 unit tests pass. No lint errors.

---

## PHASE 1 — Product Understanding

### What the app is

Eco-Insight Revenue OS is an AI-assisted Revenue Operations (RevOps) CRM platform built for the Guarantees of Origin (GoO), renewable energy certificates, and PPA market. It combines pipeline management, lead qualification, email/calendar sync, and 9 AI agents that automate market intelligence, lead scoring, email classification, outreach drafting, deal health monitoring, and weekly digest generation — all with human-in-the-loop approval via an approval queue.

### Who it is for

- Sales teams at renewable energy trading/certificate companies
- Revenue Operations managers overseeing pipeline health
- Deal strategists monitoring competitive positioning
- Team admins managing users and integrations

### Core jobs-to-be-done

1. **Manage sales pipeline** — Track opportunities from Discovery to Won/Lost with health scoring
2. **Qualify and convert leads** — Score leads via FIUAC framework, convert to accounts + deals
3. **Review AI suggestions** — Approve/reject/edit AI-generated actions (outreach, enrichment, tasks)
4. **Monitor market signals** — Discover and act on market intelligence from RSS feeds
5. **Manage email/calendar** — Sync Outlook, classify emails, prep for meetings
6. **Track tasks and goals** — Assign, review, and complete action items
7. **Get weekly digests** — AI-generated pipeline summaries with founder-operator voice

### Critical beta workflows

| Workflow | Desktop | Mobile | Both |
|----------|---------|--------|------|
| View dashboard stats & next-best-actions | | | X |
| Browse and approve queue items | | | X |
| View pipeline kanban, drag deals between stages | X | | |
| View pipeline as list/cards | | X | |
| Create new opportunity | | | X |
| View account detail with contacts | | | X |
| Browse and convert leads | | | X |
| Read inbox emails with classification | | | X |
| View meeting calendar and prep | | | X |
| Create and complete tasks | | | X |
| Search via Cmd+K | X | | |
| Check notifications | | | X |
| Team/settings management | X | | |

### Demo path (10-minute internal walkthrough)

1. **Home dashboard** (30s) — Stats cards, next-best-actions, schedule, at-risk deals
2. **Approval queue** (90s) — Show pending AI suggestions, approve one with edits, reject one
3. **Signals** (60s) — Show market intelligence, convert a signal to a lead
4. **Leads kanban** (60s) — Show FIUAC scoring, advance a lead, convert one to account+deal
5. **Pipeline kanban** (90s) — Drag a deal forward, show health scores, open a deal detail
6. **Account detail** (60s) — Show contacts, opportunities, activity timeline
7. **Inbox** (60s) — Show classified emails, thread view with sentiment
8. **Meetings** (30s) — Show calendar, meeting prep tab
9. **Tasks** (30s) — Show task list, complete one with follow-up
10. **Weekly digest** (30s) — Show AI-generated summary

**Demo path risks:**
- Pipeline kanban drag-drop has no debounce — rapid drags could cause race conditions
- Queue approve with edits has no field-level validation in the edit drawer
- Lead conversion is a multi-step transaction — if DB is slow, it could timeout during demo
- Inbox requires Microsoft Graph sync to have real data (seed data covers this)

---

## PHASE 2 — Technical Health / Under-the-Hood Audit

### Build / Compile

- **Build:** Passes cleanly. All pages compile. First Load JS shared = 102 kB (good).
- **TypeScript:** 14 type errors in test file `ai-guardrails.test.ts` (mock types not cast properly). Production code compiles clean.
- **Lint:** No ESLint warnings or errors.

### Test Health

- **Unit tests:** 417 pass, 1 fails (`auth-callbacks.test.ts` — `db.user.count` not mocked for auto-provisioning path)
- **Test coverage:** Agent logic, schemas, API routes, crypto, audit, retention all covered. No frontend component tests.

### Critical Technical Issues

#### T-01: Unbounded queries loading all records into memory
- **Files:** `opportunities/route.ts:46` (pipeline aggregation), `home/route.ts:29-40` (at-risk deals)
- **Why it matters:** With 1000+ deals, these queries load everything into memory. Dashboard could crash or be very slow for power users.
- **Severity:** HIGH
- **Fix:** Use Prisma `groupBy` for aggregation, add `take: 100` limits.
- **Must fix before beta:** Yes — dashboard is the landing page

#### T-02: N+1 queries in bulk operations and import
- **Files:** `leads/route.ts:200-205` (bulk advance loops with individual queries), `import/execute/route.ts:38-65` (per-row queries)
- **Why it matters:** 2000-row import does 4000+ individual queries. Bulk lead advance with 100 leads = 200 queries.
- **Severity:** HIGH
- **Fix:** Use `findMany` upfront, then `updateMany` or `createMany`.
- **Must fix before beta:** Import yes (users will import). Bulk advance can wait.

#### T-03: Missing transaction in import execution
- **File:** `import/execute/route.ts:38-65`
- **Why it matters:** If import fails at row 500, first 499 records are committed, rest fail. User gets partial import with no way to undo.
- **Severity:** HIGH
- **Must fix before beta:** Yes

#### T-04: No rate limiting on any endpoint
- **Why it matters:** No protection against brute-force, API exhaustion, or accidental loops.
- **Severity:** HIGH
- **Must fix before beta:** No (internal beta with trusted users), but must fix before public beta

#### T-05: Bulk operations accept unbounded arrays
- **File:** `leads/route.ts:196-230`
- **Why it matters:** No MAX_IDS check. Could send 100k IDs causing DoS.
- **Severity:** HIGH
- **Must fix before beta:** Add simple `ids.length > 500` check (5 minutes)

#### T-06: Unscoped signal query in global search
- **File:** `search/route.ts:32`
- **Why it matters:** Uses `db.signal` instead of `scoped.signal` — could return signals from other tenants in multi-tenant setup. Currently single-tenant, but still a data isolation bug.
- **Severity:** HIGH (architecture) / MEDIUM (beta risk)
- **Must fix before beta:** Should fix (simple one-liner)

#### T-07: Missing input validation on date fields
- **Files:** `leads/route.ts:177`, `tasks/route.ts:64`, `tasks/[id]/route.ts:65`
- **Why it matters:** `new Date(invalidString)` creates Invalid Date objects that propagate silently through the system.
- **Severity:** MEDIUM
- **Fix:** Validate with Zod date schema before parsing

#### T-08: Missing pagination on related entities
- **Files:** `tasks/route.ts:35` (comments unbounded), `opportunities/route.ts:24` (contacts unbounded)
- **Why it matters:** Account with 10k contacts or task with 10k comments loads everything.
- **Severity:** MEDIUM
- **Must fix before beta:** No (seed data has small amounts)

#### T-09: Race conditions on check-then-act patterns
- **Files:** `queue/route.ts:154-177`, `opportunities/route.ts:82-98`, `accounts/route.ts:120`
- **Why it matters:** Two users approving same queue item, or moving same deal simultaneously, could cause conflicts.
- **Severity:** MEDIUM
- **Must fix before beta:** No (small team, low collision risk)

#### T-10: Missing assignee/reviewer validation
- **Files:** `tasks/route.ts:66`, `tasks/[id]/route.ts:70`, `leads/route.ts:224`
- **Why it matters:** Can assign tasks/leads to non-existent user IDs or users from other tenants.
- **Severity:** MEDIUM
- **Must fix before beta:** No (internal users know valid team members)

#### T-11: Fire-and-forget notification cleanup
- **File:** `notifications/route.ts:33`
- **Why it matters:** Runs `deleteMany` on every GET request with `.catch(() => {})`. Could silently fail or cause perf issues at scale.
- **Severity:** LOW
- **Must fix before beta:** No

#### T-12: No error boundaries in dashboard layout
- **File:** `layout.tsx` — No Suspense wrapper or error boundary for child content
- **Why it matters:** Single component error crashes the entire dashboard
- **Severity:** MEDIUM
- **Must fix before beta:** No (but annoying if it happens)

### Dead Code / Unused

- No significant dead code found. Codebase is clean.
- Minor: COUNTRIES and REGIONS arrays in accounts page could be externalized to constants.

### State Management

- Zustand for UI state (theme, drawer, palette, toasts) — clean and well-structured
- React Query for server state with 30s stale time — appropriate
- Optimistic mutations with rollback — well-implemented
- Pending/failed mutation tracking via custom hooks — good pattern

### Performance

- First Load JS: 102 kB shared, largest page (tasks) 134 kB — acceptable
- No code splitting beyond Next.js defaults (pages are already split)
- No image optimization needed (app has no images)
- Database queries generally well-indexed via Prisma schema
- SSE notifications use in-memory pub/sub — works for single server, breaks on horizontal scale

---

## PHASE 3 — Functional Testing

### Workflow: Queue Approval (Core Loop)

- **Happy path:** Works. Items show with type badges, payloads display correctly, approve/reject updates status.
- **Approve with edits:** Edit drawer opens with payload fields, but **no field-level validation** — empty strings accepted. User could approve a blank outreach email.
- **Reject:** Works but rejection reason options are hardcoded and may not cover all cases.
- **Edge case:** Two users approving same item simultaneously — no optimistic lock, second approval would succeed silently on an already-approved item.
- **Missing:** No undo window after approval (design doc mentions 30-second undo, not implemented).

### Workflow: Lead Management

- **Happy path:** Create lead, advance through stages, convert to account+deal — all work.
- **Bulk actions:** Bulk advance, disqualify, assign all function but lack confirmation dialogs for destructive actions.
- **Convert flow:** Transaction creates Account + Opportunity + updates Lead. Works but no loading indicator during the multi-step transaction.
- **Pause/Resume:** Pause sets `pausedUntil` date. Resume reactivates. **Missing validation**: `pausedUntil` date not validated — past dates accepted.
- **FIUAC scoring:** Displays correctly. Scores come from lead qualifier agent or manual entry.

### Workflow: Pipeline Management

- **Desktop kanban:** Works. Drag-drop moves deals between stages. **Forward-only** constraint enforced with toast warning.
- **Mobile:** Falls back to card list. Stage visible but no drag-drop. Users must use "Move" button instead.
- **Bulk operations:** Bulk move, close-lost, reassign available. **Bulk close-lost has no confirmation dialog** — this is destructive.
- **Stage regression:** Moving backward shows warning toast but allows it. No confirmation dialog.
- **Deal detail:** Health scores, next actions, win/loss metadata display correctly.
- **Create opportunity:** Drawer form with account typeahead. Works but no debounce on typeahead search.

### Workflow: Account Management

- **List view:** Search, type filter, owner filter work. No empty state when filters return zero results.
- **Detail view:** Contacts, opportunities, activities, tasks all display. Tabs work.
- **Create account:** Drawer with domain validation and cert management fields. Duplicate name check exists.
- **Import CSV:** File upload, AI-powered field mapping, preview, execute. **Import lacks transaction** — partial imports possible.
- **Edit account:** Inline editing with save. Works.

### Workflow: Inbox

- **Thread view:** Emails grouped by thread. Classification badges (positive_reply, objection, etc.) display.
- **Keyboard shortcuts:** j/k for navigation, e for archive, t for create task. **Conflict risk**: shortcuts fire even when focused on text inputs (only checks for INPUT/TEXTAREA, misses contentEditable).
- **Archive/Task creation:** Works from quick actions.
- **Missing:** No confirmation for archive action.

### Workflow: Tasks

- **Create:** Drawer with title, assignees, priority, due date, subtasks, reviewer. Works.
- **Complete:** Shows notes field and optional follow-up tasks. Creates activity log.
- **Comments with @mentions:** UserPicker triggered on @. Mentions create notifications. Works.
- **Subtasks:** Add, check off, reorder. **Subtask deletion has no undo**.
- **Bulk actions:** Complete selected, reassign. Works.

### Workflow: Meetings

- **Calendar view:** Shows meetings in date range. Navigation between weeks works.
- **Prep tab:** Notes entry, status toggle (draft/ready). Works.
- **Outcome tab:** Sentiment, notes, follow-up actions. Triggers meeting-analyst agent on save.
- **Meeting drawer:** Tabbed (Prep/Outcome). Works on desktop. **On mobile, tabs may be cramped**.

### Workflow: Settings

- **Team management:** Invite users (domain-restricted), change roles, activate/deactivate. Works.
- **Integrations:** Microsoft Graph connection flow. Shows connected/disconnected status.
- **Agent settings:** Enable/disable agents, configure schedule, set run limits. Works.
- **Profile:** Update name, notification preferences. Works.

### Volume Stress Testing (Reasoned)

| Entity | 0 items | 1 item | 10 items | 100 items | 1000+ items |
|--------|---------|--------|----------|-----------|-------------|
| Accounts | EmptyState shown | Works | Works | Pagination needed | No pagination — full list loads |
| Leads | EmptyState shown | Works | Works | Kanban columns scroll | Performance concern — all in memory |
| Pipeline | EmptyState shown | Works | Works | Kanban scrolls horizontally | All opps loaded for aggregation — crash risk |
| Tasks | EmptyState shown | Works | Works | Grouped view helps | Comments unbounded per task |
| Queue | EmptyState shown | Works | Works | Cursor pagination — good | Pagination handles scale |
| Inbox | EmptyState shown | Works | Works | Pagination — good | Works |
| Meetings | "No meetings" text | Works | Works | Calendar scrolls | No pagination — all loaded |
| Signals | EmptyState shown | Works | Works | No pagination | Full list — concern at scale |
| Notifications | "No notifications" | Works | Load-more works | Works | Works |

### Destructive Action Protection

| Action | Confirmation | Undo | Audit Trail |
|--------|-------------|------|-------------|
| Delete contact | Yes (ConfirmDialog) | No | Activity log |
| Close deal lost | No confirmation for bulk | No | Activity log |
| Disqualify lead | No pre-warning | No | Stage change logged |
| Bulk disqualify leads | No confirmation | No | Logged |
| Archive email | No confirmation | No | No |
| Deactivate user | Yes (ConfirmDialog) | Reactivate option | Audit log |
| Queue reject | No confirmation | No | Activity log |
| Delete subtask | No confirmation | No | No |
| Import execute | No confirmation | No | No |

### Keyboard / Power-User Audit

- Cmd+K command palette: Works, good search with recent pages and quick actions
- Tab order: Forms generally follow logical order. No explicit `tabindex` management.
- Cmd/Ctrl+Enter: Submits drawer forms. Good.
- Cmd/Ctrl+click: Standard link behavior for opening in new tabs — works for Next.js links.
- Copy record IDs: Not directly exposed in UI. Users would need to inspect URL.

---

## PHASE 4 — Desktop UI/UX Audit

### What works well on desktop

- **Dashboard:** Clean information density. Stats cards with sparklines, next-best-actions list, schedule, and at-risk deals provide a good executive overview.
- **Pipeline kanban:** Professional look with health bars, owner avatars, and deal amounts. Drag-drop is smooth.
- **Queue:** Clear approval workflow with type badges, agent attribution tags, and expandable payloads.
- **Sidebar navigation:** Well-organized into Core/CRM/Workflow/System sections with badge counts for items needing attention.
- **Command palette:** Fast, comprehensive search across entities. Recent pages list is useful.
- **Notification dropdown:** Filter tabs (All/Unread/Queue/Tasks/Mentions) with load-more pagination — well-designed.

### Desktop UX Issues

#### D-01: Duplicate theme toggle
- TopBar and Sidebar both have theme toggle buttons visible on desktop simultaneously.
- **Impact:** Confusing — user doesn't know which to use. Creates inconsistency perception.
- **Fix:** Remove from TopBar on desktop, keep in Sidebar only.

#### D-02: "New" button lacks context
- TopBar "New" button always visible but creates different things depending on current page context.
- **Impact:** User unsure what "New" will create without clicking it.
- **Fix:** Show label like "New Deal" or "New Task" based on current route.

#### D-03: Account typeahead in pipeline lacks debounce
- Typing in account search field fires API call on every keystroke.
- **Impact:** Sluggish feel, unnecessary API load.
- **Fix:** Add 300ms debounce (consistent with SearchInput pattern).

#### D-04: Pipeline stage aggregation shown as raw numbers
- Total pipeline value and weighted value shown but without currency formatting context.
- **Impact:** "Pipeline: 2450000" is harder to parse than "Pipeline: 2,450,000 EUR".
- **Fix:** Use `fmt()` utility consistently for large numbers.

#### D-05: Queue edit drawer lacks field validation
- User can approve queue items with empty required fields.
- **Impact:** Creates records with missing data (e.g., outreach email with no subject).
- **Fix:** Add required field checks before approval submission.

#### D-06: Settings page is a single mega-page
- All settings (Team, Integrations, Agents, Profile) on one page with tab navigation.
- **Impact:** Long page, especially Agent settings with per-agent configuration.
- **Fix:** Acceptable for beta, but consider splitting into sub-routes later.

#### D-07: Hardcoded `Cmd+K` shortcut label
- Sidebar shows "⌘K" regardless of OS. Windows/Linux users would expect "Ctrl+K".
- **Impact:** Minor confusion for non-Mac users.
- **Fix:** Detect OS and show appropriate modifier key.

#### D-08: No skip-to-content link
- No accessibility skip link to bypass sidebar navigation.
- **Impact:** Screen reader and keyboard-only users must tab through entire sidebar on every page.
- **Fix:** Add hidden skip link at top of layout.

---

## PHASE 5 — Mobile UI/UX Audit

### Mobile Navigation

- **BottomNav:** 5 main tabs (Home, Queue, Pipeline, Inbox, Tasks) + "More" menu for remaining pages.
- **More menu:** Grid of 6 additional pages (Signals, Leads, Accounts, Meetings, Settings, Admin).
- **Sidebar:** Completely hidden on mobile. Navigation relies entirely on BottomNav.

### Per-Workflow Mobile Assessment

| Workflow | Rating | Notes |
|----------|--------|-------|
| Dashboard | ✅ Works well | Stats cards stack vertically. Sections scroll naturally. |
| Queue approval | ⚠️ Usable but awkward | Queue items readable but edit drawer on mobile may be cramped. Approve/reject buttons are small. |
| Pipeline | ⚠️ Usable but awkward | Falls back to card list (no kanban). Cards show key info but miss source/close date. No drag-drop on mobile. |
| Lead kanban | ⚠️ Usable but awkward | Cards stack vertically. Action buttons wrap awkwardly on small screens. |
| Account list | ✅ Works well | Card-based layout adapts. |
| Account detail | ⚠️ Usable but awkward | Many detail tabs, each with tables that may overflow. |
| Inbox | ⚠️ Usable but awkward | Thread list works. Thread detail needs back button. Keyboard shortcuts (j/k/e/t) irrelevant on mobile. |
| Tasks | ⚠️ Usable but awkward | Task cards readable. Subtask management (add/reorder/delete) difficult with small touch targets. |
| Meetings | ⚠️ Usable but awkward | Calendar navigation buttons very small (20px). Date display small. |
| Signals | ✅ Works well | Card-based list adapts well. |
| Digest | ❌ Not ready | Sidebar layout `w-72` hardcoded — leaves only 103px for content on 375px screen. |
| Settings | ⚠️ Usable but awkward | Form inputs and selects work but small. Agent config section is dense. |
| Import | ❌ Not ready | Mapping table with select dropdowns at `text-xs` is nearly unusable on mobile. |
| Admin | ✅ Works well | Stats grid adapts. |
| Command palette | ⚠️ Usable but awkward | Max-height hardcoded at 340px. On small phones, results area too short. |

### Critical Mobile Issues

#### M-01: Tap targets below 44px minimum across the app
- **Affected components:** BottomNav badges (14px), Drawer close button (28px), NotificationDropdown filter tabs (30px), ConfirmDialog buttons (30px), Toast close button (12px), SearchInput clear button (14px), BulkActionBar buttons (30px), Meeting navigation buttons (20px), Pipeline detail edit buttons (30px)
- **WCAG 2.5.5 violation.** Significant usability issue — users will accidentally tap wrong targets.
- **Fix:** Apply minimum `min-h-[44px] min-w-[44px]` to all interactive elements.

#### M-02: Drawer height assumption ignores virtual keyboard
- Drawer uses `max-h-[92vh]` on mobile. When virtual keyboard opens for form inputs, drawer content gets pushed off-screen.
- **Fix:** Use `max-h-[calc(100dvh-env(safe-area-inset-bottom))]` or JavaScript-based height calculation.

#### M-03: Digest page layout broken on mobile
- Sidebar `w-72` (288px) hardcoded. On 375px viewport, content area is only 87px wide.
- **Fix:** Hide sidebar on mobile, use full-width list with expandable cards.

#### M-04: Import mapping table unusable on mobile
- Select dropdowns at `text-xs px-2 py-1` (28px height) in a horizontally scrolling table.
- **Fix:** Switch to vertical card layout on mobile with larger select elements.

#### M-05: NotificationDropdown max-height overflow
- `max-h-[420px]` hardcoded. On viewport < 640px, dropdown extends below fold.
- **Fix:** Use `max-h-[calc(100vh-120px)]` for responsive height.

#### M-06: BulkActionBar overlaps BottomNav
- BulkActionBar positioned `fixed bottom-4` doesn't account for BottomNav height.
- **Fix:** Add `bottom-[calc(3.5rem+1rem+env(safe-area-inset-bottom))]` on mobile.

#### M-07: Command palette max-height too small on mobile
- `max-h-[340px]` on small phones (iPhone SE) leaves ~120px for results.
- **Fix:** Use `max-h-[60vh]`.

### iOS Safari-specific concerns

- `pb-[env(safe-area-inset-bottom)]` on BottomNav — correctly handles home indicator.
- 100vh bug: Drawer uses `92vh` which partially mitigates but doesn't fully solve.
- Input zoom: No `font-size: 16px` enforcement on inputs — iOS Safari will zoom on focus for inputs < 16px.
- Rubber-band scrolling: Could cause visual glitch on drawer/modal backdrops.

---

## PHASE 6 — Cross-Device Consistency

### Where it feels like one app

- **Navigation structure:** Sidebar on desktop, BottomNav on mobile — different but consistent conceptually. Same pages accessible from both.
- **Color system:** CSS variables ensure consistent theming across devices.
- **Data display:** Same React Query hooks power both views — data is identical.
- **Action availability:** All CRUD operations available on both devices (though some are harder to reach on mobile via "More" menu).
- **Toast/notification system:** Works consistently across devices.

### Where it feels fragmented

#### X-01: Pipeline kanban vs card list
- Desktop: Full kanban board with drag-drop, stage columns, visual flow.
- Mobile: Flat card list with no stage grouping or visual flow.
- **Impact:** Users who learn pipeline management on desktop will be confused by the stripped-down mobile view.

#### X-02: Features buried in "More" menu on mobile
- Signals, Leads, Accounts, Meetings all require opening "More" menu on mobile.
- **Impact:** 4 of 13 pages require an extra tap. Frequently-used features like Leads feel hidden.
- **Suggestion:** Consider making BottomNav configurable or smart (show most-used pages).

#### X-03: Keyboard shortcuts only on desktop
- Cmd+K, j/k navigation, e/t quick actions — none work on mobile.
- **Not a bug** but creates two different muscle-memory experiences.

#### X-04: Theme toggle in different locations
- Desktop: Both Sidebar and TopBar (duplicated)
- Mobile: Only in BottomNav "More" > Settings
- **Impact:** Inconsistent discoverability.

#### X-05: Digest page layout completely different
- Desktop: Side-by-side list + detail
- Mobile: Layout breaks (see M-03)
- **Impact:** Not just different — it's broken on mobile.

#### X-06: Import workflow impractical on mobile
- Desktop: Table-based field mapping with dropdowns — works well.
- Mobile: Same table squeezed into small viewport — unusable (see M-04).
- **Impact:** Import should be desktop-only or have a mobile-specific layout.

---

## PHASE 7 — Beta-Risk Audit

### What could go wrong tomorrow

#### R-01: Dashboard crash with large datasets
- If seed data grows beyond expected size or a test user bulk-imports records, home dashboard loads all at-risk opportunities without limit. Could cause visible slowdown or timeout.
- **Likelihood:** MEDIUM (depends on tester behavior)
- **Impact:** HIGH (first screen users see)
- **Mitigation:** Add `take: 100` to at-risk opps query (5-minute fix)

#### R-02: Import creates partial data
- Beta tester imports a CSV, connection hiccup at row 50 of 200 — first 50 records committed, rest lost.
- **Likelihood:** LOW (internal network is stable)
- **Impact:** HIGH (confusing, no undo)
- **Mitigation:** Wrap in transaction

#### R-03: Queue item approved with empty fields
- Tester opens edit drawer, clears a field, approves — creates record with missing data.
- **Likelihood:** MEDIUM (curious testers will try)
- **Impact:** MEDIUM (bad data, but discoverable)
- **Mitigation:** Add required field checks

#### R-04: Mobile digest page visually broken
- Tester opens digest on phone — sees squeezed, unusable layout.
- **Likelihood:** HIGH (testers will try mobile)
- **Impact:** MEDIUM (specific page, not core flow)
- **Mitigation:** Add responsive layout or hide sidebar on mobile

#### R-05: Rapid pipeline drag causes race condition
- Tester drags deal between stages quickly — multiple mutations fire without debounce.
- **Likelihood:** LOW (requires intentional rapid dragging)
- **Impact:** MEDIUM (deal could end up in wrong stage)
- **Mitigation:** Add debounce to drag handler

#### R-06: Inbox shortcuts interfere with typing
- Tester uses keyboard shortcuts while focused on input with contentEditable — shortcut fires AND text enters.
- **Likelihood:** LOW (specific scenario)
- **Impact:** LOW (accidental archive/task creation)

#### R-07: Seed data feels thin for some areas
- No failed agent runs, no failed syncs, no accepted invitations in seed data.
- **Likelihood:** HIGH (testers will look at these areas)
- **Impact:** LOW (just looks empty, not broken)
- **Mitigation:** Add edge-case seed data

#### R-08: First-run experience is blank
- No onboarding flow, no help tooltips, no "getting started" guide. Beta testers must figure out the app by exploration.
- **Likelihood:** HIGH
- **Impact:** MEDIUM (internal users can ask questions)
- **Mitigation:** Draft a 1-page quick start guide and share with testers

### Demo path revisited

| Step | Risk | Severity |
|------|------|----------|
| Home dashboard | At-risk opps unbounded query | MEDIUM |
| Queue approval | Edit drawer lacks validation | MEDIUM |
| Signals | No issues found | LOW |
| Lead conversion | Transaction could timeout on slow DB | LOW |
| Pipeline kanban | Drag-drop race condition | LOW |
| Account detail | No issues found | LOW |
| Inbox | Keyboard shortcut conflict | LOW |
| Meetings | Small navigation buttons | LOW |
| Tasks | Subtask delete no undo | LOW |
| Weekly digest | Seed data exists, looks good | LOW |

---

## PHASE 8 — Missing Areas / Blind Spots

### Onboarding / First-Run
- No welcome wizard, guided tour, or help tooltips
- WelcomeBanner component exists but is minimal
- No contextual help for domain-specific concepts (FIUAC, GoO, PPA)
- **Impact:** Beta testers will need external documentation

### Empty / Loading / Error States
- Loading: Skeleton components used consistently — good
- Empty: Most pages have EmptyState component — good
- Error: ErrorState with retry button — good
- **Gap:** Filtered results returning zero items often show no "no results" message (accounts, signals)

### Analytics / Event Tracking
- No frontend analytics (no PostHog, Mixpanel, GA)
- Agent performance tracked in DB (AgentRun, AiUsageLog)
- **Impact:** Can't measure feature adoption during beta
- **Recommendation:** Add basic event tracking before beta or use manual observation

### Logging / Debugging
- Server-side: Logger exists, audit logs capture mutations
- Client-side: No error boundary reporting to external service
- **Impact:** If beta tester hits a bug, debugging relies on browser console

### Accessibility (WCAG AA)
- **Critical gaps:**
  - Tap targets below 44px across multiple components
  - No focus traps in modals/drawers/command palette
  - Missing `aria-labelledby` on Drawer
  - Missing `role="dialog"` on CommandPalette
  - No skip-to-content link
  - Focus not returned to trigger element after modal close
  - Form focus indicators are faint (`focus:border-brand/40`)
- **Keyboard navigation:** Forms tab correctly but modals/drawers lack focus containment
- **Screen reader:** Basic semantic HTML used but ARIA landmarks incomplete

### Browser Coverage
- Built with standard React/Next.js — should work in Chrome, Firefox, Safari, Edge
- No browser-specific CSS or polyfills detected
- [UNCERTAIN] Firefox scrollbar styling may differ from Chrome due to `scrollbar-*` classes

### Session Timeout
- JWT session with no explicit `maxAge` set
- No session timeout warning or re-auth flow
- **Impact:** Sessions persist indefinitely until token expires naturally
- **Risk:** Low for beta (short test period)

### Back Button Behavior
- Next.js App Router handles client-side navigation — back button works for page-to-page navigation
- **Gap:** Back button from detail page doesn't preserve list filters/scroll position
- **Gap:** Drawer/modal close via back button not handled — back goes to previous page instead of closing drawer

### Page Titles / Meta Tags
- `<title>` not set per-page — all tabs show same title
- No dynamic `<title>` like "Pipeline | Eco-Insight" or "Acme Corp | Accounts"
- **Impact:** Multiple browser tabs all show the same title — user can't distinguish them

### Favicon
- [UNCERTAIN] No favicon configuration found. Browser tab may show generic icon.

### Initial Load Performance
- First Load JS shared: 102 kB — good
- Largest page (tasks): 134 kB — acceptable
- No lazy loading beyond Next.js page-level code splitting
- No image optimization needed (text-only app)

### Paste Behavior
- Standard HTML inputs — paste works natively
- No special paste handlers for structured data

### Scroll Restoration
- Next.js provides basic scroll restoration
- **Gap:** Filter state not preserved in URL for some pages (leads, signals)

### Focus Management After Actions
- After drawer close: Focus doesn't return to trigger button
- After modal confirm: Focus stays on removed element (dialog)
- After form submit: Focus doesn't move to success indicator

### Multi-Tab Behavior
- React Query with 30s stale time means tabs refresh data on focus — acceptable
- Zustand theme state persisted to localStorage — syncs across tabs
- **Gap:** Drawer open in one tab, navigate in another — no cross-tab state sync. Minor issue.
- **Gap:** Queue approval in Tab A, stale data in Tab B until refocus — acceptable behavior

### Offline / Flaky Connection
- No offline support
- No retry on failed mutations (React Query retry: 1)
- **Impact:** Failed API call shows error toast. User must manually retry.
- **Acceptable for beta** with stable internal network

### Print / Export
- Export endpoint exists for CSV/Excel — works
- No print stylesheet — printing a page would include sidebar, headers, etc.
- **Impact:** Low priority for beta

### Internationalization
- All strings hardcoded in English — no i18n framework
- Date formatting uses custom `fDate()` and `fRelative()` — consistent but not locale-aware
- Currency: No currency symbol shown anywhere (amounts are raw numbers)
- **Impact:** Fine for English-only beta. Will cost effort to add i18n later.

---

## PHASE 9 — Security / Privacy / Permission Findings

### S-01: CRON_SECRET is a single plaintext bearer token
- **Severity:** CRITICAL for production, MEDIUM for internal beta
- Middleware bypasses all auth if `x-cron-secret` header matches env var
- Attacker with secret can trigger all agent runs, data retention cleanup, sync operations
- **Fix:** Use Vercel's cryptographic cron signature validation

### S-02: Auto-provisioning can create unauthorized ADMIN
- **Severity:** CRITICAL for production, LOW for beta (DB pre-seeded)
- First login to empty database becomes ADMIN with zero authorization
- **Fix:** Require bootstrap token or disable auto-provisioning in production

### S-03: No CSP header
- **Severity:** MEDIUM
- XSS attacks not blocked by Content Security Policy
- **Fix:** Add CSP header in `next.config.ts`

### S-04: Agent prompt injection risk
- **Severity:** MEDIUM
- User-controlled text (account names, pain statements, email bodies) interpolated into agent prompts without escaping
- **Mitigation:** Low risk in beta (trusted users). Must address before public release.

### S-05: OAuth tokens stored in DB (encryption available but usage unclear)
- **Severity:** MEDIUM-HIGH for production
- `IntegrationToken` stores access/refresh tokens
- `crypto.ts` provides AES-256-GCM encryption utilities
- [UNCERTAIN] Whether encryption is actually applied at write time — code review of token storage needed

### S-06: Invitation tokens use CUID (sequential, predictable)
- **Severity:** MEDIUM
- CUID tokens are sortable and partially predictable
- **Fix:** Use `crypto.randomBytes(32).toString('hex')` for invitation tokens

### S-07: Session expiry not explicitly configured
- **Severity:** MEDIUM
- JWT sessions don't have explicit `maxAge`
- **Fix:** Add `maxAge: 24 * 60 * 60` (24 hours)

### S-08: Team endpoint lacks authorization check
- **Severity:** MEDIUM
- Any authenticated user can call `GET /api/settings/team` and see all team members with emails
- **Fix:** Add role check (ADMIN/MEMBER only)

---

## PHASE 10 — Performance / Reliability Findings

### P-01: Pipeline aggregation loads all records
- `opportunities/route.ts:46` loads ALL open opportunities for aggregation
- **Fix:** Use `groupBy` aggregation (already done in home/route.ts — inconsistent)

### P-02: Home dashboard at-risk query unbounded
- Loads all opportunities with health < 50, no limit
- **Fix:** Add `take: 100`

### P-03: Import N+1 query pattern
- Per-row individual database queries for 2000-row imports
- **Fix:** Batch with `createMany` and upfront `findMany`

### P-04: In-memory SSE pub/sub won't scale
- Single-server only. Breaks with horizontal scaling.
- **Acceptable for beta.** Need Redis pub/sub for production.

### P-05: No client-side error reporting
- No Sentry, LogRocket, or similar for capturing frontend errors
- **Impact:** Beta bugs may go unreported unless user manually reports

---

## PHASE 11 — Master Backlog

### Beta Blockers

| ID | Title | Area | Severity | Effort | Device | Evidence |
|---|---|---|---|---|---|---|
| AUDIT-001 | Add `take` limit to at-risk opps query on home dashboard | backend | Blocker | XS | Both | `home/route.ts:29-40` — loads all opps with health < 50 |
| AUDIT-002 | Add `take` limit to pipeline aggregation query | backend | Blocker | XS | Both | `opportunities/route.ts:46` — loads all opps for sum |
| AUDIT-003 | Add max-IDs check on bulk operations | backend | Blocker | XS | Both | `leads/route.ts:196-230` — accepts unbounded array |
| AUDIT-004 | Fix digest page mobile layout (sidebar overflow) | frontend | Blocker | S | Mobile | `digest/page.tsx:44` — `w-72` hardcoded, breaks on 375px |

### Must Fix Before Internal Beta

| ID | Title | Area | Severity | Effort | Device | Evidence |
|---|---|---|---|---|---|---|
| AUDIT-005 | Wrap import execution in database transaction | backend | High | S | Both | `import/execute/route.ts:38-65` — partial imports on failure |
| AUDIT-006 | Add field validation to queue edit drawer | frontend | High | S | Both | `queue/page.tsx:128-146` — empty fields accepted |
| AUDIT-007 | Add confirmation dialog for bulk close-lost in pipeline | frontend | High | XS | Both | `pipeline/page.tsx:527-532` — no confirmation |
| AUDIT-008 | Add confirmation dialog for bulk disqualify in leads | frontend | High | XS | Both | `leads/page.tsx:944-947` — no confirmation |
| AUDIT-009 | Fix unscoped signal query in global search | backend | High | XS | Both | `search/route.ts:32` — uses raw `db.signal` |
| AUDIT-010 | Add debounce to pipeline kanban drag handler | frontend | High | XS | Desktop | `pipeline/page.tsx:359-362` — rapid drags conflict |
| AUDIT-011 | Write quick-start guide for beta testers | product | High | S | Both | No onboarding flow exists |
| AUDIT-012 | Set dynamic page titles per route | frontend | High | S | Both | All browser tabs show same title |

### Quick Wins with High Impact

| ID | Title | Area | Severity | Effort | Device | Evidence |
|---|---|---|---|---|---|---|
| AUDIT-013 | Remove duplicate theme toggle from TopBar on desktop | frontend | Medium | XS | Desktop | `TopBar.tsx:32` — duplicates Sidebar toggle |
| AUDIT-014 | Fix meeting navigation buttons tap target size | frontend | Medium | XS | Mobile | `meetings/page.tsx:69-75` — buttons 20px |
| AUDIT-015 | Fix NotificationDropdown max-height on mobile | frontend | Medium | XS | Mobile | `NotificationDropdown.tsx:188` — hardcoded 420px |
| AUDIT-016 | Fix CommandPalette max-height on mobile | frontend | Medium | XS | Mobile | `CommandPalette.tsx:264` — hardcoded 340px |
| AUDIT-017 | Add `take: 50` to task comments query | backend | Medium | XS | Both | `tasks/route.ts:35` — unbounded comments |
| AUDIT-018 | Add `take: 100` to account contacts include | backend | Medium | XS | Both | `opportunities/route.ts:24` — unbounded contacts |
| AUDIT-019 | Fix BulkActionBar overlap with BottomNav on mobile | frontend | Medium | XS | Mobile | `BulkActionBar.tsx:28` — `bottom-4` ignores nav |
| AUDIT-020 | Add "no results" message when filters return empty in accounts | frontend | Medium | XS | Both | `accounts/page.tsx:279` — missing empty state |
| AUDIT-021 | Detect OS for keyboard shortcut label (⌘K vs Ctrl+K) | frontend | Low | XS | Desktop | `Sidebar.tsx:85` — hardcoded ⌘K |
| AUDIT-022 | Show currency context for pipeline amounts | frontend | Low | XS | Both | Raw numbers without EUR/currency |

### Important But Not Urgent

| ID | Title | Area | Severity | Effort | Device | Evidence |
|---|---|---|---|---|---|---|
| AUDIT-023 | Validate date inputs with Zod before `new Date()` | backend | Medium | S | Both | `leads/route.ts:177`, `tasks/route.ts:64`, `tasks/[id]/route.ts:65` |
| AUDIT-024 | Validate assignee/reviewer IDs exist in system | backend | Medium | S | Both | `tasks/route.ts:66`, `tasks/[id]/route.ts:70` |
| AUDIT-025 | Add race condition protection to queue approval | backend | Medium | M | Both | `queue/route.ts:154-177` — check-then-act |
| AUDIT-026 | Fix import N+1 query pattern with batch operations | backend | Medium | M | Both | `import/execute/route.ts:38-65` |
| AUDIT-027 | Add focus trap to Drawer component | frontend | Medium | S | Both | `Drawer.tsx` — no focus containment |
| AUDIT-028 | Add focus trap to CommandPalette | frontend | Medium | S | Both | `CommandPalette.tsx` — Tab escapes palette |
| AUDIT-029 | Return focus to trigger element after drawer/modal close | frontend | Medium | S | Both | Multiple components |
| AUDIT-030 | Fix inbox keyboard shortcuts to check contentEditable | frontend | Medium | XS | Desktop | `inbox/page.tsx:57` — misses contentEditable |
| AUDIT-031 | Add `role="dialog"` and `aria-modal="true"` to CommandPalette | frontend | Medium | XS | Both | `CommandPalette.tsx:238` |
| AUDIT-032 | Add `aria-labelledby` to Drawer | frontend | Medium | XS | Both | `Drawer.tsx` — missing label reference |
| AUDIT-033 | Increase Drawer close button tap target to 44px | frontend | Medium | XS | Mobile | `Drawer.tsx:19` — 28px |
| AUDIT-034 | Increase ConfirmDialog button tap targets to 44px | frontend | Medium | XS | Mobile | `ConfirmDialog.tsx:47,53` — 30px |
| AUDIT-035 | Increase Toast close button tap target | frontend | Medium | XS | Mobile | `Toast.tsx:71` — 12px |
| AUDIT-036 | Increase SearchInput clear button tap target | frontend | Medium | XS | Mobile | `SearchInput.tsx:69` — 14px |
| AUDIT-037 | Add confirmation for email archive action | frontend | Medium | XS | Both | `inbox/page.tsx:72` — no confirmation |
| AUDIT-038 | Add undo for subtask deletion | frontend | Medium | S | Both | `tasks/page.tsx:280` — delete with no recovery |
| AUDIT-039 | Preserve filter state in URL params for leads and signals | frontend | Medium | S | Both | Filter state lost on navigation |
| AUDIT-040 | Add CSP header to security headers | security | Medium | XS | Both | `next.config.ts` — missing CSP |
| AUDIT-041 | Set JWT session maxAge to 24 hours | security | Medium | XS | Both | No explicit expiry |
| AUDIT-042 | Add authorization check to team list endpoint | security | Medium | XS | Both | `settings/team/route.ts:6` — no role check |
| AUDIT-043 | Fix type casting without validation in API routes | backend | Medium | S | Both | Multiple routes use `as Type` without validation |
| AUDIT-044 | Add environment guard to seed script | backend | Medium | XS | Both | `prisma/seed.ts` — no production check |
| AUDIT-045 | Fix import mapping table for mobile (card layout) | frontend | Medium | M | Mobile | `import/page.tsx:232-245` — unusable on mobile |

### Post-Beta Improvements

| ID | Title | Area | Severity | Effort | Device | Evidence |
|---|---|---|---|---|---|---|
| AUDIT-046 | Implement rate limiting on API endpoints | security | High | L | Both | No rate limiting anywhere |
| AUDIT-047 | Replace CRON_SECRET with Vercel cryptographic signatures | security | High | M | Both | `middleware.ts:17-20` — plaintext bearer |
| AUDIT-048 | Disable auto-provisioning in production | security | High | S | Both | `auth-callbacks.ts:49-72` |
| AUDIT-049 | Replace CUID invitation tokens with crypto.randomBytes | security | Medium | S | Both | `schema.prisma:832` — predictable tokens |
| AUDIT-050 | Verify OAuth token encryption at rest | security | Medium | M | Both | Token storage unclear |
| AUDIT-051 | Add agent prompt injection escaping | security | Medium | M | Both | User input in prompts unescaped |
| AUDIT-052 | Add frontend analytics (PostHog/Mixpanel) | product | Medium | M | Both | No usage tracking |
| AUDIT-053 | Add client-side error reporting (Sentry) | ops | Medium | S | Both | No frontend error capture |
| AUDIT-054 | Migrate SSE pub/sub to Redis for horizontal scaling | architecture | Medium | L | Both | In-memory only |
| AUDIT-055 | Add skip-to-content link for accessibility | frontend | Medium | XS | Both | Missing accessibility landmark |
| AUDIT-056 | Implement back-button-closes-drawer behavior | frontend | Medium | S | Both | Back navigates away instead |
| AUDIT-057 | Add print stylesheet for key pages | frontend | Low | M | Desktop | No print styles |
| AUDIT-058 | Fix auth-callbacks test (mock db.user.count) | QA | Low | XS | Both | 1 failing test |
| AUDIT-059 | Fix TypeScript errors in ai-guardrails test | QA | Low | S | Both | 14 mock type errors |
| AUDIT-060 | Add onboarding wizard / guided tour | product | Medium | L | Both | No first-run experience |

### Nice-to-Have Ideas

| ID | Title | Area | Effort | Notes |
|---|---|---|---|---|
| AUDIT-061 | Configurable BottomNav tabs | frontend | M | Let users choose which 5 pages appear in mobile nav |
| AUDIT-062 | Pipeline kanban on mobile (horizontal scroll) | frontend | L | Currently card list only |
| AUDIT-063 | Undo window for queue approvals (30s) | frontend | M | Design doc mentions this, not implemented |
| AUDIT-064 | Copy record ID to clipboard | frontend | XS | Power user feature |
| AUDIT-065 | Keyboard shortcuts reference sheet | frontend | S | Discoverable via Cmd+K or help icon |
| AUDIT-066 | Scroll position restoration on list pages | frontend | M | Lost when navigating back |
| AUDIT-067 | Dynamic "New" button label based on current route | frontend | XS | "New Deal" vs "New Task" vs "New" |
| AUDIT-068 | Multi-user collision detection (optimistic locking) | backend | L | Two users editing same record |
| AUDIT-069 | i18n framework setup | frontend | L | Prepare for localization |
| AUDIT-070 | Smart date validation for pausedUntil (reject past dates) | backend | XS | Past dates accepted silently |

**Total backlog items: 70**

---

## PHASE 12 — Top 10 Actions Before Tomorrow

1. **AUDIT-001 + AUDIT-002:** Add `take` limits to unbounded dashboard/pipeline queries (15 min)
2. **AUDIT-003:** Add `ids.length > 500` check on bulk operations (5 min)
3. **AUDIT-004:** Fix digest page mobile layout — hide sidebar on mobile (20 min)
4. **AUDIT-005:** Wrap import execution in transaction (30 min)
5. **AUDIT-007 + AUDIT-008:** Add ConfirmDialog to bulk close-lost and bulk disqualify (20 min)
6. **AUDIT-009:** Fix unscoped signal query in search (5 min)
7. **AUDIT-006:** Add required field checks to queue edit drawer (30 min)
8. **AUDIT-010:** Add debounce to pipeline drag handler (10 min)
9. **AUDIT-012:** Add dynamic page titles (30 min)
10. **AUDIT-011:** Write 1-page quick-start guide for beta testers (30 min)

**Total estimated time: ~3.5 hours**

---

## PHASE 13 — Ship Recommendation

### Ship Decision: **YES, WITH CONDITIONS**

The app is substantially functional and demonstrates impressive depth for a RevOps platform. The core workflows (queue approval, pipeline management, lead conversion, account management, task tracking) all work end-to-end. The AI agent system with human-in-the-loop approval is well-designed and functional. The notification system, global search, and data model are all production-grade.

### Readiness Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Desktop** | Ready with caveats | Core workflows work. Minor UX issues (duplicate theme toggle, missing validation). Pipeline aggregation needs `take` limit. |
| **Mobile** | Ready with caveats | Most workflows usable but awkward. Digest and Import pages broken. Tap targets too small across the board. |
| **Security** | Ready for internal beta | No public-facing risks for internal use. CRON_SECRET, auto-provisioning, and rate limiting must be fixed before public beta. |
| **Data integrity** | Ready with caveats | Import needs transaction wrapping. Other CRUD operations are sound. |
| **Performance** | Ready with caveats | Two unbounded queries on dashboard/pipeline must be limited. Rest is fine for beta-scale data. |

### Biggest Under-the-Hood Risks
1. Unbounded queries on dashboard (crash risk with large datasets)
2. Import without transaction (data corruption risk)
3. No rate limiting (DoS possible, low risk for internal beta)
4. In-memory SSE pub/sub (single-server limitation)

### Biggest Desktop UX Problems
1. Queue edit drawer accepts empty required fields
2. Bulk destructive actions lack confirmation
3. Duplicate theme toggle
4. No dynamic page titles for browser tabs

### Biggest Mobile UX Problems
1. Digest page layout completely broken
2. Tap targets below 44px across multiple components
3. Import mapping table unusable
4. BulkActionBar overlaps BottomNav
5. Virtual keyboard pushes drawer content off-screen

### Biggest Cross-Device Consistency Problems
1. Pipeline: full kanban on desktop vs flat list on mobile
2. Features buried in "More" menu on mobile
3. Digest page: works on desktop, broken on mobile

### Biggest Trust-Breaking Bugs
1. Dashboard crash on large datasets (first thing users see)
2. Partial import with no undo (data integrity concern)
3. Digest page broken on mobile (feels unfinished)
4. Multiple browser tabs showing same title (feels unprofessional)

### Beta Tester Communication Draft

> **Subject: Eco-Insight Internal Beta — Quick Start Guide**
>
> Team,
>
> We're launching internal beta testing of Eco-Insight Revenue OS today. Here's what you need to know:
>
> **What to test:**
> - Dashboard overview (home page)
> - Approval queue — try approving and rejecting AI suggestions
> - Pipeline — drag deals between stages, create new opportunities
> - Leads — browse the kanban, try converting a lead to an account
> - Accounts — view details, contacts, and activity timelines
> - Inbox — read classified emails, try keyboard shortcuts (j/k to navigate)
> - Tasks — create, assign, and complete tasks
> - Meetings — check calendar, fill in prep notes
>
> **Known limitations:**
> - Mobile: The app works on phones but some features are better on desktop (pipeline kanban, data import)
> - The Digest page has a layout issue on mobile — best viewed on desktop
> - Import: Please keep CSV files under 500 rows for now
> - Keyboard shortcuts (Cmd+K for search, j/k for inbox navigation) are desktop-only
>
> **How to report issues:**
> Reply to this thread with: what you did, what you expected, what happened, and which device/browser you used.
>
> **Login:** Use your Google account. You should already have access.
>
> Thanks for testing!

### Recommended Next-24-Hours Action Plan

| Time | Action | Owner |
|------|--------|-------|
| **Now - Hour 1** | Fix AUDIT-001, 002, 003 (unbounded queries + bulk limits) | Backend |
| **Hour 1-2** | Fix AUDIT-004 (digest mobile layout) + AUDIT-009 (search scope) | Frontend + Backend |
| **Hour 2-3** | Fix AUDIT-005 (import transaction) + AUDIT-007/008 (confirmations) | Backend + Frontend |
| **Hour 3-4** | Fix AUDIT-006 (queue validation) + AUDIT-010 (drag debounce) + AUDIT-012 (page titles) | Frontend |
| **Hour 4** | Write and send beta tester quick-start guide (AUDIT-011) | Product |
| **During beta** | Monitor server logs for 500 errors, watch for slow queries | Backend |
| **During beta** | Collect feedback on mobile usability and feature discoverability | Product |
| **End of day** | Triage feedback into backlog, prioritize for next sprint | All |

### What to Watch During Beta

- **500 errors in server logs** — especially on dashboard and pipeline pages
- **Slow API responses** — any endpoint taking > 2 seconds
- **Queue approval patterns** — are testers confused by the workflow?
- **Mobile usage** — which pages do testers try on mobile? Where do they get stuck?
- **Import attempts** — any partial imports or errors?
- **Feature discoverability** — do testers find Cmd+K search? Do they find features in the "More" menu on mobile?
- **Agent run failures** — check AgentRun table for errors
- **Notification delivery** — are SSE notifications arriving in real-time?

---

## Contradiction Check

Reviewed all phases for contradictions. One noted:
- Phase 2 lists "no significant dead code" but Phase 4 mentions COUNTRIES/REGIONS arrays could be externalized. These are not dead code — they're used as dropdown options — just could be constants. Not a contradiction, clarified.

No other contradictions found across phases.
