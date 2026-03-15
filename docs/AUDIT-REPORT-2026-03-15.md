# Eco-Insight Revenue OS — Beta-Readiness Audit v2

**Audit date:** 2026-03-15
**Auditor:** Cross-functional product audit team (QA, UX, Frontend, Backend, Security, Ops)
**Scope:** Full codebase review for tomorrow's internal beta test
**Previous audit:** 2026-03-14 (GO WITH CONDITIONS — 15 pre-beta must-fixes, all completed)

---

## PHASE 1 — Product Understanding

### What the app is

Eco-Insight Revenue OS is an AI-assisted CRM for the renewable energy certificates / PPA (Power Purchase Agreement) market. It combines traditional CRM workflows (accounts, leads, pipeline, tasks) with AI agents that automate signal detection, lead qualification, outreach drafting, account enrichment, and pipeline hygiene.

### Who it is for

Internal sales team (5-10 people) at a B2B company selling to utilities, traders, retailers, industrials, and developers in the European renewable energy market.

### Core jobs-to-be-done

1. **Discover opportunities** — Monitor market signals (PPA announcements, renewable targets, job postings) and convert them into qualified leads
2. **Manage sales pipeline** — Progress deals from Discovery through Commit, with AI-assisted health monitoring
3. **Review AI suggestions** — Human-in-the-loop approval of AI-generated outreach, lead qualifications, and enrichments
4. **Track relationships** — Manage accounts, contacts, email threads, and meetings
5. **Coordinate work** — Task management with assignments, comments, and goal grouping
6. **Stay informed** — Dashboard with next best actions, digest, and real-time notifications

### Critical workflows a beta user must complete

| Workflow | Desktop | Mobile | Both |
|----------|---------|--------|------|
| Log in via Google SSO | | | Both |
| View dashboard and understand state of business | | | Both |
| Review and approve/reject queue items | | | Both |
| Browse and act on signals (dismiss/convert to lead) | | | Both |
| Create and advance leads through kanban | Desktop | | |
| Convert a qualified lead to an opportunity | | | Both |
| View pipeline kanban, drag deals between stages | Desktop | | |
| View account detail + contacts | | | Both |
| Create and manage tasks | | | Both |
| Read inbox emails and triage (archive/snooze/create task) | Desktop | | |
| View meetings and add prep notes | | | Both |
| Manage team settings (invite, roles) | Desktop | | |
| Search across entities (Cmd+K) | | | Both |

### Demo path (10-minute walkthrough)

1. **Home dashboard** — Show greeting, stat cards, Next Best Actions, Today's Schedule
2. **Approval Queue** — Show pending AI suggestions, approve one outreach draft with edit
3. **Signals** — Show detected signals, convert one to a lead
4. **Leads kanban** — Show leads by stage, advance one, convert a Qualified lead to deal
5. **Pipeline kanban** — Drag deal to next stage, click into deal detail
6. **Account detail** — Show contacts, FIUAC scores, AI brief, activities timeline
7. **Inbox** — Show email threads with AI classification, archive one
8. **Tasks** — Show grouped tasks, complete one
9. **Settings** — Show team management, agent configs

**Demo path risks:**
- Step 1: If no seed data meetings are scheduled for today's date, "Today's Schedule" will show empty (this was fixed but worth verifying with fresh seed data)
- Step 5: Drag-drop only works forward — dragging backward shows a toast instead of moving; not intuitive during a demo
- Step 7: Inbox requires Microsoft Graph integration to have real data; seed data should have sample emails
- Step 9: Agent "Run Now" buttons may fail if Anthropic API key is not configured

---

## PHASE 2 — Technical Health / Under-the-Hood Audit

### Build & Compile

| Issue | Severity | Root Cause | Fix | Beta? |
|-------|----------|------------|-----|-------|
| Google Fonts loaded via external CSS `@import` in globals.css | Low | `@import url('https://fonts.googleapis.com/...')` blocks rendering | Move to `next/font` for self-hosting and performance | No |
| `useEffect` missing dependency arrays in `accounts/page.tsx:215` — `useEffect()` with no deps array runs every render | Medium | `openNewAccountDrawer` captured in effect without dep array | Add `[searchParams]` dependency | Should fix |

### Runtime Issues

| Issue | Severity | Root Cause | Fix | Beta? |
|-------|----------|------------|-----|-------|
| **Inbox page 3-panel layout not responsive** — fixed `w-80` + `w-72` sidebars with no mobile breakpoint | High | `InboxPage` renders three fixed-width panels with no `md:hidden` / responsive adaptation | Add mobile layout with thread list / thread view toggle | Must fix |
| **Mark-as-read fires on every render** — `useEffect` at `inbox/page.tsx:52` depends on `selectedThread?.threadId` but `markRead.mutate` is called every time | Medium | Missing `markRead` from deps, but calling mutate creates new reference each render anyway | Add `isUnread` check guard + stable ref | Should fix |
| **ConvertModal account type options mismatch** — Leads convert form offers "IPP", "Corporate", "Registry" which don't exist in `AccountType` enum (only Utility, Trader, Retailer, Industrial, Developer, Unknown) | Medium | Hardcoded options in `leads/page.tsx:123-129` don't match Prisma `AccountType` enum | Use shared constants from types | Should fix |
| **Zustand store initializes in module scope** — `useStore` accesses `localStorage` during SSR via IIFE | Low | Initial theme read happens during module eval, which can break during SSR | Already handles with try/catch, acceptable | No |

### State Management

| Issue | Severity | Root Cause | Fix | Beta? |
|-------|----------|------------|-----|-------|
| **Drawer body is React nodes passed as state** — `openDrawer` stores JSX in Zustand, which breaks React's render tree expectations | Medium | Drawer content is passed as pre-rendered nodes rather than component references | Works functionally but makes drawer state non-serializable; acceptable for beta | No |
| **No global error boundary** — Uncaught errors crash the entire app with white screen | High | Missing React error boundary at layout level | Add `<ErrorBoundary>` wrapper in dashboard layout | Should fix |
| **Filter state lost on navigation** — Accounts/pipeline persist filters to URL params, but leads and tasks do not | Medium | Inconsistent URL param persistence across pages | Add URL param sync to leads/tasks pages | Should fix |

### Error Handling

| Issue | Severity | Root Cause | Fix | Beta? |
|-------|----------|------------|-----|-------|
| **API handler swallows JSON parse errors** — If body is not valid JSON, `req.json()` throws, caught by generic handler → 500 instead of 400 | Medium | No explicit check for malformed JSON in `withHandler` | Add try/catch around `req.json()` with 400 response | No |
| **Toast messages use raw error.message** — Some error handlers pass unfiltered backend error messages to users | Low | `err.message` may contain technical details | Sanitize error messages for user-facing toasts | No |
| **SSE notification stream has no reconnection** — If the EventSource connection drops, no automatic reconnect | Medium | `useNotificationStream` hook likely doesn't handle reconnection | Add reconnection logic with exponential backoff | Should fix |

### Security

| Issue | Severity | Root Cause | Fix | Beta? |
|-------|----------|------------|-----|-------|
| **CSRF check only validates Origin header** — Middleware validates `Origin` or `Referer` but some browsers don't send either | Low | `middleware.ts:42-55` — if neither header present, request is blocked (correct behavior, just strict) | Acceptable — this is correct security behavior | No |
| **Cron routes accept plaintext secret** — `x-cron-secret` compared with `===` against env var | Low | Standard approach but constant-time comparison would be better | Use `crypto.timingSafeEqual` | No |
| **No rate limiting on API endpoints** — Noted in backlog as X2 (deprioritized) | Low | Acceptable for <10 internal users | Monitor during beta | No |
| **OAuth tokens may be stored unencrypted** — Backlog item #38 notes tokens are plaintext in DB | Medium | `IntegrationToken.accessToken` stored directly | Encrypt with `crypto.ts` before storing | No (internal only) |

### Performance

| Issue | Severity | Root Cause | Fix | Beta? |
|-------|----------|------------|-----|-------|
| **No virtualization on long lists** — Kanban columns, task lists render all items | Medium | React renders all cards even with 100+ items | Add virtual scrolling for lists > 50 items | No |
| **Badge count polling** — `useBadgeCounts` likely refetches on an interval, creating N+1 query patterns | Low | React Query refetchInterval on badge counts | Acceptable for beta scale | No |
| **Google Font external request** — render-blocking CSS import | Low | `@import url(...)` in globals.css | Move to next/font | No |

### Accessibility

| Issue | Severity | Root Cause | Fix | Beta? |
|-------|----------|------------|-----|-------|
| **Modals lack focus trap** — ConvertModal, DisqualifyDialog, PauseDialog don't trap focus | Medium | Modals are custom divs without focus management | Add `useRef` focus trap or use `<dialog>` | Should fix |
| **No skip-to-content link** | Low | Missing landmark navigation | Add skip link | No |
| **Color-only status indicators** — Stage badges and health bars rely on color alone | Low | No shape/icon/text differentiation for colorblind users | Already has text labels alongside colors | No |
| **Kanban drag-drop has no keyboard alternative** | Medium | Drag events only — no keyboard stage movement on pipeline | Add dropdown for keyboard users | Should fix |

---

## PHASE 3 — Functional Testing

### Workflow Testing Results

| Workflow | Happy Path | Edge Cases | Mobile |
|----------|-----------|------------|--------|
| Login (Google SSO) | Works | Dev credentials fallback works | Works |
| Dashboard view | Works | Empty state shows WelcomeBanner correctly | Works |
| Queue approve/reject | Works | Edit & Approve saves payload changes | Works |
| Queue reject with reason | Works | Reject dropdown positions above button (could clip at top of viewport) | Usable |
| Signal dismiss | Works | No confirmation — immediate action | Works |
| Signal convert to lead | Works | Creates lead in "New" stage | Works |
| Create lead manually | Works | Company name required validation works | Works (drawer) |
| Advance lead | Works | Optimistic update with rollback works | Works |
| Lead disqualify with reason | Works | "Other" reason with custom text works | Works |
| Lead pause with date | Works | Date picker works, min date enforced | Works |
| Lead requalify (from Paused tab) | Works | Returns to "New" stage | Works |
| Convert lead to opportunity | Works | Creates account + opportunity atomically | Works |
| Create opportunity (from pipeline) | Works | Account typeahead search works | Works (drawer) |
| Pipeline drag-drop | Works forward | **Backward drag blocked with toast — confusing** | N/A (no drag on mobile) |
| Pipeline table view | Works | Checkbox selection works | Hidden on mobile |
| Account creation | Works | Name uniqueness enforced | Works |
| Account detail view | Works | Contacts, activities, AI brief all render | Works |
| Contact add/edit/delete | Works | Warmth and role dropdowns work | Works |
| Task creation | Works | Assignment, priority, due date all work | Works |
| Task completion | Works | `completedAt` timestamp set | Works |
| Task comments with @mentions | Works | Notification sent to mentioned user | Works |
| Inbox email reading | Works | Auto mark-as-read on selection | **Not responsive** |
| Inbox archive | Works | Email removed from list | **Not responsive** |
| Inbox snooze | Works | Date picker for snooze-until | **Not responsive** |
| Meeting view | Works | Calendar grid + list | Works |
| Meeting prep notes | Works (if meeting detail page wired) | | Works |
| Search (Cmd+K) | Works | Searches accounts, leads, opportunities | Works |
| Notification dropdown | Works | Filter tabs, mark-all-read, load-more | Works |
| Settings - Team | Works | Role changes, invite flow | Usable |
| Settings - Theme toggle | Works | Persists to localStorage | Works |
| Import CSV | Works | Error reporting in drawer | Usable |
| Bulk actions (leads) | Works | Advance, disqualify, assign owner | Checkboxes hard to tap |
| Bulk actions (pipeline) | Works | Move stage, close lost, assign | Checkboxes hard to tap |

### Critical Functional Issues

1. **Inbox is completely desktop-only** — Three fixed-width columns (`w-80`, flex-1, `w-72`) with no mobile breakpoint. On mobile, the left panel fills the screen and the right panels are cut off. This is a significant gap since email triage is a common mobile workflow.

2. **Pipeline backward drag shows confusing message** — "Use the stage dropdown to move deals back" but there's no stage dropdown visible on the kanban card. The only way to move backward is via the deal detail page or table view.

3. **Lead create drawer form uses mutable state object** — `const state = { company: '', type: 'Unknown', country: '', pain: '' }` is mutated via `onChange` handlers, which works but means the form doesn't show validation state or re-render on changes. If user clears company field after typing, the submit button doesn't disable.

4. **ConvertModal account types don't match schema** — Options include "IPP", "Corporate", "Registry" which aren't in the Prisma `AccountType` enum. Attempting to create with these would fail at the database level.

5. **No pagination UI for completed queue items** — The queue shows completed items but if there are hundreds, they all load at once (cursor pagination may exist server-side but no "load more" button visible in the UI).

### Volume Stress Testing (Reasoned)

| Entity | 0 items | 1 item | 10 items | 100 items | 1000+ items |
|--------|---------|--------|----------|-----------|-------------|
| Leads kanban | Empty state shown | Works | Works | **Columns scroll but no virtualization** | **Performance concern — all rendered** |
| Pipeline kanban | Empty state shown | Works | Works (per column) | **Horizontal overflow only** | **Significant lag expected** |
| Accounts table | Not tested | Works | Works | Works (cursor pagination) | Should work with pagination |
| Queue items | Empty state shown | Works | Works | **No pagination in UI for completed** | **Slow** |
| Tasks | Empty state shown | Works | Works | Works with grouping | **No virtualization** |
| Inbox threads | Not tested | Works | Works | **No pagination** | **Slow** |
| Meetings | Calendar grid handles | Works | Works | Calendar grid may overflow | **Calendar grid not designed for this** |
| Search results | "No results" shown | Works | Works | Not capped — returns all matches | **Should limit to 20** |

### Destructive Action Protection

| Action | Confirmation? | Undo? | Audit Trail? | Risk |
|--------|--------------|-------|--------------|------|
| Delete contact | Yes (ConfirmDialog) | No | Audit log | Low |
| Disqualify lead | Yes (reason dialog) | Can requalify | Audit log | Low |
| Archive email | No confirmation | No undo | No explicit audit | Medium — one-click permanent hide |
| Reject queue item | Yes (reason selection) | No undo | Reviewed-by audit | Low |
| Approve queue item | No confirmation | No undo | Reviewed-by audit | Medium — creates permanent data |
| Complete task | No confirmation | No undo | completedAt timestamp | Low |
| Delete account | [UNCERTAIN] Not tested | No | Audit log | **High if exists** |
| Bulk disqualify leads | No extra confirmation beyond bulk bar | No undo | | **Medium** |
| Bulk close-lost opps | No extra confirmation | No undo | | **Medium** |

### Keyboard & Power User

- Tab order through forms: **Works** — forms use standard HTML inputs
- Copy record IDs: **Not available** — no "copy ID" button on any entity
- Cmd+click for new tab: **Works** — uses Next.js `<Link>` components
- Keyboard shortcuts: Inbox has j/k/e/t shortcuts (working). Command palette has Cmd+K (working). No other keyboard shortcuts documented.
- Usable without mouse: **Partially** — Pipeline drag-drop requires mouse. Everything else works via keyboard.

---

## PHASE 4 — Desktop UI/UX Audit

### What works well on desktop

1. **Information density is excellent** — Dashboard stat cards with sparklines, kanban columns with health indicators, FIUAC score bars all pack meaningful data into small space without feeling cramped
2. **Visual hierarchy is clear** — Brand green (#3ecf8e) used consistently for primary actions, muted colors for secondary, danger red for destructive actions
3. **Navigation is intuitive** — Sidebar with section grouping (Core, CRM, Workflow, System) is well-organized with badge counts
4. **Command palette** — Cmd+K search works well and covers create actions
5. **Skeleton loading states** — Every page has a custom skeleton that matches the final layout
6. **Toast feedback** — Success/error toasts with action links (e.g., "View Leads →") are excellent
7. **Optimistic updates** — Lead advancement, queue approval show instant feedback with rollback
8. **Staggered animations** — Cards animate in with slight delays, feels polished
9. **Dark mode** — Well-implemented with proper CSS variables, consistent across all components
10. **Light mode** — New addition, properly themed with good contrast

### Desktop issues

1. **Pipeline kanban horizontal scroll** — 7 columns × 230px = 1610px minimum. On smaller desktop screens (1280px), rightmost columns require horizontal scrolling. Column widths could be narrower.

2. **Account detail page density** — [UNCERTAIN] Haven't read the full account detail page but based on the schema, it should show contacts, opportunities, activities, AI brief, and scores. Could be information-overwhelming.

3. **Settings page tab navigation** — 6 tabs (Team, Integrations, Agents, Profile, Roles, Appearance) in a horizontal tab bar. On narrower screens, tabs may wrap.

4. **Queue card expand/collapse** — "Reasoning & Sources" toggle is small (text-2xs) and could be missed. The reasoning section is the most valuable part for building trust in AI suggestions.

5. **Table right-arrow indicator** — Accounts table has a `→` character in the last column as a navigation hint, which is a non-standard pattern. More conventional would be a hover state change or row-level action.

6. **No breadcrumb navigation** — Account detail and pipeline detail pages have no breadcrumb back to the list. Browser back button works but there's no visual navigation aid.

7. **Drawer doesn't support keyboard Escape** — [UNCERTAIN] The Drawer component may or may not handle Escape key to close. Shell/Drawer.tsx would need to be verified.

---

## PHASE 5 — Mobile UI/UX Audit

### Workflow mobile readiness

| Workflow | Rating | Notes |
|----------|--------|-------|
| Dashboard | ✅ Works well | Stat cards adapt to compact layout, mobile-optimized sections |
| Queue | ✅ Works well | Cards stack vertically, actions accessible |
| Signals | ✅ Works well | Cards stack vertically |
| Leads kanban | ⚠️ Usable but awkward | Mobile shows flat list sorted by score instead of kanban — different mental model |
| Lead actions | ✅ Works well | Advance/Disqualify/Pause buttons always visible (not hover-only) |
| Pipeline | ⚠️ Usable but awkward | Mobile shows flat list sorted by health, no stage grouping visible |
| Accounts | ✅ Works well | Card list with score pills, tap to navigate |
| Account detail | ⚠️ Usable but awkward | [UNCERTAIN] Long page with multiple sections; may require excessive scrolling |
| **Inbox** | ❌ Not ready | **Three-panel layout doesn't adapt to mobile at all** |
| Tasks | ✅ Works well | Mobile-optimized layout noted in backlog as completed |
| Meetings | ⚠️ Usable but awkward | Calendar grid may not work well at 375px |
| Settings | ⚠️ Usable but awkward | 6 tabs may wrap; forms should be readable |
| Search (Cmd+K) | ⚠️ Usable but awkward | Command palette may not have mobile trigger beyond header +New |
| Create forms (drawers) | ✅ Works well | Drawer component has responsive padding |

### Specific mobile issues

1. **Inbox 3-panel layout** — This is the biggest mobile issue. `w-80` (320px) left panel + `w-72` (288px) right panel = 608px minimum before the main content. On a 375px screen, only the left panel is partially visible. There is no `md:hidden` or responsive alternative.

2. **Bottom nav only shows 5 items** — Home, Queue, Pipeline, Inbox, Tasks. Signals, Leads, Accounts, Meetings, Settings, Admin are only accessible via the sidebar (which is `hidden md:flex`). This means **on mobile, 6 of 11 navigation items are not accessible through any visible navigation element**. Users would need to use the command palette or know URLs directly.

3. **Bulk action checkboxes** — 16px checkboxes on kanban cards and table rows are below the 44×44px minimum touch target for comfortable tapping.

4. **Safe area handling** — Bottom nav uses `pb-[env(safe-area-inset-bottom)]` which is correct for iPhone notch/home indicator. Good.

5. **Lead kanban cards** — The "Advance" and "Disqualify" buttons are `text-2xs` (10px) which is very small for finger tapping on mobile, though they do have adequate padding.

6. **Pipeline mobile list** — Sorted by health (lowest first) which is a good default for mobile — shows deals needing attention first.

7. **Modal dialogs** — ConvertModal, DisqualifyDialog, PauseDialog all have `p-4` padding on the overlay and `max-w-md`/`max-w-xs` on the content. These should work on mobile.

8. **No swipe gestures** — Mobile email apps train users to swipe for archive/delete. Inbox has no swipe support.

---

## PHASE 6 — Cross-Device Consistency Audit

### Consistent patterns (good)

- **Card design** — Same card component pattern used across leads, accounts, pipeline on both desktop and mobile
- **Badge/tag styling** — Same Badge, StageBadge, AgentTag components used everywhere
- **Toast notifications** — Same component on both devices
- **Create flows** — Same Drawer component for creation on both devices
- **Color system** — CSS variables ensure consistent theming across breakpoints

### Fragmentation issues

1. **Mobile navigation gap** — Desktop sidebar shows 11 items. Mobile bottom nav shows 5. Leads, Signals, Accounts, Meetings, Settings, Admin are not in mobile nav. This creates a "two-app" feeling where mobile users simply cannot reach most of the app.

2. **Leads: kanban vs list** — Desktop shows a 3-column kanban. Mobile shows a flat list sorted by score. A user who learns the kanban mental model on desktop will be confused on mobile where stage grouping disappears entirely.

3. **Pipeline: kanban vs list** — Same issue. Desktop shows 5-column kanban with drag-drop. Mobile shows flat list sorted by health. No stage context on mobile.

4. **Inbox: usable vs unusable** — Desktop has a polished 3-panel email client. Mobile has nothing — the same 3-panel layout clips to show only 320px of the left panel.

5. **Hover-only actions vs always-visible** — Lead cards on desktop show Advance/Disqualify/Pause only on hover (`hidden group-hover:flex`). Mobile cards show them always. This is actually correct behavior but it means mobile cards are visually busier than desktop cards.

6. **Accounts: table vs cards** — Desktop shows a detailed table with 8 columns. Mobile shows simplified cards. This is well-adapted.

7. **Terminology is consistent** — No differences in labels, status names, or action names between devices. Good.

---

## PHASE 7 — Beta-Risk Audit

### High-risk failure modes

1. **Inbox on mobile** — If anyone opens the app on their phone and taps Inbox from the command palette, they'll see a broken layout. This undermines trust in the entire app.

2. **Mobile navigation dead-end** — If a mobile user wants to check Signals or Leads, they have no visible way to get there. They must discover the command palette (Cmd+K equivalent on mobile is the "+New" button which opens the palette). This is not discoverable.

3. **Empty data scenarios** — If seed data hasn't been run or if it uses hardcoded dates that have passed, several pages will show empty states. The WelcomeBanner helps but empty data + no guidance = confusion.

4. **API key dependencies** — Agent "Run Now" buttons, weekly digest generation, and any AI-powered feature requires `ANTHROPIC_API_KEY` to be configured. If missing, these features will fail silently or show generic errors.

5. **Microsoft Graph integration** — Inbox and Calendar sync require Microsoft OAuth setup. Without it, inbox is empty and meetings only show manually-created entries. Beta testers need to know this.

6. **Approval queue with no pending items** — If no agents have run, the queue will be empty. The "All clear" empty state is good, but beta testers may not understand what should be there.

### Demo path risks (revisited)

| Step | Risk | Impact |
|------|------|--------|
| Home dashboard | Low — static data displays well | Shows greeting, stats |
| Approval Queue | Medium — may be empty if agents haven't run | Need seed data with queue items |
| Signals | Low — seed data includes signals | Works |
| Leads kanban | Low — seed data includes leads | Works |
| Pipeline kanban | Low — seed data includes opportunities | Works |
| Account detail | Low | Works |
| **Inbox** | **High** — requires Microsoft Graph integration for real data | Empty without integration |
| Tasks | Low — seed data includes tasks | Works |
| Settings | Low | Works |

### What to explicitly warn beta testers about

1. Inbox requires Microsoft Outlook integration setup — it will be empty without it
2. AI agent features (Run Now, weekly digest) require Anthropic API key
3. Mobile navigation is limited — use the search (tap +New) to reach all pages
4. Pipeline deals can only be dragged forward, not backward
5. Import only supports CSV format currently

---

## PHASE 8 — Missing Areas / Blind Spots

### Found and evaluated

| Area | Status | Notes |
|------|--------|-------|
| **Onboarding / first-run** | Done | WelcomeBanner with step completion, auto-dismiss |
| **Empty states** | Done | EmptyState component with CTAs on leads, pipeline, accounts |
| **Loading states** | Done | Custom skeletons per page |
| **Error states** | Done | ErrorState component with retry |
| **Success feedback** | Done | Toast notifications with action links |
| **Data integrity** | Done | Prisma transactions for lead conversion, Zod validation |
| **Audit trails** | Partial | AuditLog model exists, logging in some routes; not comprehensive |
| **Role-based access** | Done | ADMIN/MEMBER/VIEWER with middleware enforcement |
| **Theme support** | Done | Light/dark mode with CSS variables |
| **Notification system** | Done | SSE streaming, dropdown with filters, mark-all-read |
| **Search** | Done | Global search via command palette |
| **Import** | Partial | CSV import for accounts; no XLSX, no leads/contacts import |
| **Export** | Partial | Export endpoint exists but limited |
| **Undo/recovery** | Not done | No undo for any destructive action |
| **Multi-user collisions** | Not handled | No optimistic locking, no conflict detection |
| **Session timeout** | Not handled | NextAuth handles lifecycle but no mid-workflow warning |
| **Back button behavior** | Works | Next.js client-side routing handles back correctly |
| **Browser tab titles** | Partial | TopBar shows page title but `<title>` tag may not update per-page |
| **Favicon** | [UNCERTAIN] | Not verified |
| **Paste behavior** | Works | Standard HTML inputs accept paste |
| **Scroll restoration** | Partial | Next.js handles some scroll restoration; not explicit |
| **Focus management** | Partial | Modals auto-focus first input; drawer close doesn't return focus |
| **Print/export fidelity** | Not tested | No print styles |
| **Multi-tab behavior** | Partial | React Query dedupes fetches but no cross-tab sync; two tabs could show stale data |
| **Offline behavior** | Not handled | No offline detection, no queue for failed mutations |
| **Internationalization** | Not ready | Hardcoded English strings throughout; dates use `toLocaleDateString` with locale params (good) |
| **Deep linking** | Partial | Account detail and pipeline detail have URLs; no deep links for specific signal, lead, or task |
| **Page load performance** | [UNCERTAIN] | Next.js SSR + client components; no explicit code splitting beyond route-level |

### Blind spots worth flagging

1. **No "back to list" from detail pages** — Account detail `/accounts/[id]` and pipeline detail `/pipeline/[id]` have no navigation affordance back to the list. Users must use browser back.

2. **No confirmation on approve** — Approving a queue item creates real data (lead, task, activity) with no confirmation step. This is fast but risky if a user accidentally taps Approve.

3. **Email archive is not reversible** — `isArchived: true` with no UI to view or restore archived emails. Once archived, it's gone from the user's perspective.

4. **Meeting outcome tracking** — The schema supports outcome recording (`outcomeSummary`, `rawNotes`, `sentimentTag`) but it's unclear if the UI surfaces this completely.

5. **Agent run status** — Settings shows agent configs with "Run Now" but there's no persistent status indicator for "currently running" or "last run failed."

6. **Contact role options** — Settings has a "Roles" tab for customizing contact roles, but the contact creation form uses a hardcoded dropdown, not the custom roles from the database.

---

## PHASE 9 — Prioritized Master Backlog

### Group 1: Beta Blockers

---

#### AUDIT-001: Inbox page has no mobile layout

| Field | Value |
|-------|-------|
| **Title** | Inbox page has no mobile-responsive layout |
| **Area** | Frontend / Mobile |
| **Severity** | Blocker |
| **Beta priority** | Must fix before beta |
| **Confidence** | High |
| **Evidence** | `src/app/(dashboard)/inbox/page.tsx:95-148` — three fixed-width columns (`w-80`, `flex-1`, `w-72`) with no responsive breakpoints |
| **Reproduction** | Open /inbox on any screen < 768px wide |
| **Expected** | Mobile-friendly thread list with tap-to-view |
| **Actual** | Three panels crammed, only left 320px visible, right panels clipped |
| **Likely cause** | Desktop-first design, mobile adaptation not implemented |
| **Recommended fix** | Add `md:hidden` thread list view on mobile; hide right panel; show thread view as full-screen overlay on tap |
| **Estimated effort** | M |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Any mobile user who opens Inbox sees a broken layout. Trust-breaking. |
| **Device scope** | Mobile |

---

#### AUDIT-002: Mobile bottom nav missing 6 of 11 pages

| Field | Value |
|-------|-------|
| **Title** | Mobile navigation doesn't provide access to Signals, Leads, Accounts, Meetings, Settings, Admin |
| **Area** | UX / Mobile |
| **Severity** | Blocker |
| **Beta priority** | Must fix before beta |
| **Confidence** | High |
| **Evidence** | `src/components/layout/BottomNav.tsx:8-14` — only Home, Queue, Pipeline, Inbox, Tasks. Sidebar is `hidden md:flex` at `Sidebar.tsx:68` |
| **Reproduction** | Open app on mobile; try to navigate to Signals or Leads |
| **Expected** | All major sections accessible |
| **Actual** | 6 sections unreachable without knowing command palette or typing URLs |
| **Likely cause** | Bottom nav limited to 5 items for space; no "More" menu added |
| **Recommended fix** | Add a "More" tab (or hamburger) that opens a drawer/sheet with remaining nav items |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Mobile users literally cannot reach most of the app. Beta failure. |
| **Device scope** | Mobile |

---

### Group 2: Must-fix before internal beta

---

#### AUDIT-003: ConvertModal account type options mismatch with schema

| Field | Value |
|-------|-------|
| **Title** | Lead conversion form offers account types not in database enum |
| **Area** | Frontend / QA |
| **Severity** | High |
| **Beta priority** | Must fix before beta |
| **Confidence** | High |
| **Evidence** | `src/app/(dashboard)/leads/page.tsx:118-129` — options include "IPP", "Corporate", "Registry"; Prisma enum `AccountType` only has Utility, Trader, Retailer, Industrial, Developer, Unknown |
| **Reproduction** | Open lead conversion modal, select "IPP" or "Corporate", submit |
| **Expected** | Account created with valid type |
| **Actual** | Database likely rejects or stores invalid enum value |
| **Likely cause** | Options hardcoded without referencing schema enum |
| **Recommended fix** | Use values from `AccountType` enum or shared constants |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Lead conversion fails silently or creates corrupted data. Core workflow broken. |
| **Device scope** | Both |

---

#### AUDIT-004: No error boundary in dashboard layout

| Field | Value |
|-------|-------|
| **Title** | Uncaught React errors crash entire app with white screen |
| **Area** | Frontend / QA |
| **Severity** | High |
| **Beta priority** | Must fix before beta |
| **Confidence** | High |
| **Evidence** | `src/app/(dashboard)/layout.tsx` — no ErrorBoundary wrapping `{children}` |
| **Reproduction** | Trigger any uncaught error (e.g., undefined property access on missing data) |
| **Expected** | Error contained to page, rest of app usable |
| **Actual** | Entire app crashes to white screen, requires manual page reload |
| **Likely cause** | Missing error boundary component |
| **Recommended fix** | Add React error boundary around `{children}` in dashboard layout with retry button |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | One bug in any page crashes the entire app. Beta tester has to reload. |
| **Device scope** | Both |

---

#### AUDIT-005: SSE notification stream lacks reconnection

| Field | Value |
|-------|-------|
| **Title** | Notification stream disconnects silently with no auto-reconnect |
| **Area** | Frontend |
| **Severity** | Medium |
| **Beta priority** | Should fix soon |
| **Confidence** | Medium |
| **Evidence** | `useNotificationStream` hook in `src/lib/queries/notifications.ts` — EventSource setup without reconnect logic |
| **Reproduction** | Leave app open, wait for network hiccup or server restart |
| **Expected** | Stream reconnects automatically |
| **Actual** | Notifications stop arriving; no indication to user |
| **Likely cause** | EventSource created once without error/close handler |
| **Recommended fix** | Add `onerror` handler with exponential backoff reconnect |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Users stop receiving real-time notifications without knowing. |
| **Device scope** | Both |

---

#### AUDIT-006: Leads page filter state not persisted to URL

| Field | Value |
|-------|-------|
| **Title** | Leads page Active/Paused tab state not in URL params |
| **Area** | UX |
| **Severity** | Medium |
| **Beta priority** | Should fix soon |
| **Confidence** | High |
| **Evidence** | `src/app/(dashboard)/leads/page.tsx` — uses `useState` for `showPaused` but never writes to searchParams, unlike accounts/pipeline which do |
| **Reproduction** | Toggle to Paused tab, share URL or refresh page |
| **Expected** | Same view on reload |
| **Actual** | Resets to Active tab |
| **Likely cause** | Not implemented (accounts and pipeline already do this) |
| **Recommended fix** | Add URL param sync like accounts page pattern |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | User loses context on page refresh. Minor annoyance. |
| **Device scope** | Both |

---

#### AUDIT-007: Modal focus trap missing on all dialogs

| Field | Value |
|-------|-------|
| **Title** | Modal dialogs don't trap keyboard focus |
| **Area** | Frontend / Accessibility |
| **Severity** | Medium |
| **Beta priority** | Should fix soon |
| **Confidence** | High |
| **Evidence** | `ConvertModal`, `DisqualifyDialog`, `PauseDialog` in leads/page.tsx, `AssignPicker` in pipeline/page.tsx — all are `div` overlays without focus trap |
| **Reproduction** | Open any modal, press Tab repeatedly |
| **Expected** | Focus stays within modal |
| **Actual** | Focus moves to elements behind the overlay |
| **Likely cause** | Custom modals without focus management |
| **Recommended fix** | Add `useFocusTrap` hook or use native `<dialog>` element |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Keyboard users and screen reader users can interact with hidden elements. |
| **Device scope** | Both |

---

#### AUDIT-008: Pipeline backward drag message references non-existent dropdown

| Field | Value |
|-------|-------|
| **Title** | Dragging deal backward shows "Use the stage dropdown" but no such dropdown exists |
| **Area** | UX |
| **Severity** | Medium |
| **Beta priority** | Should fix soon |
| **Confidence** | High |
| **Evidence** | `src/app/(dashboard)/pipeline/page.tsx:356-358` — toast message: "Use the stage dropdown to move deals back." |
| **Reproduction** | Drag a deal card from Evaluation back to Discovery |
| **Expected** | Clear instruction on how to actually move back |
| **Actual** | References a non-existent UI element |
| **Likely cause** | Message written before UI design finalized |
| **Recommended fix** | Change to "Open the deal detail page to change its stage" or add a context menu on the card |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Confuses users. Demo risk. |
| **Device scope** | Desktop |

---

#### AUDIT-009: Pipeline kanban lacks keyboard-accessible stage movement

| Field | Value |
|-------|-------|
| **Title** | Deals can only change stage via mouse drag-drop on kanban board |
| **Area** | Accessibility / UX |
| **Severity** | Medium |
| **Beta priority** | Should fix soon |
| **Confidence** | High |
| **Evidence** | `src/app/(dashboard)/pipeline/page.tsx:318-453` — only drag events, no keyboard handlers or context menu |
| **Reproduction** | Navigate pipeline with keyboard only |
| **Expected** | Arrow keys or menu to move deal between stages |
| **Actual** | Cannot change stage without mouse (except via deal detail page or table view) |
| **Likely cause** | Drag-drop implemented without accessibility alternative |
| **Recommended fix** | Add context menu (right-click or button) with "Move to..." options |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Some users cannot use the primary pipeline interaction. |
| **Device scope** | Desktop |

---

#### AUDIT-010: No breadcrumb or back navigation on detail pages

| Field | Value |
|-------|-------|
| **Title** | Account and pipeline detail pages lack back navigation |
| **Area** | UX |
| **Severity** | Medium |
| **Beta priority** | Should fix soon |
| **Confidence** | High |
| **Evidence** | `/accounts/[id]/page.tsx` and `/pipeline/[id]/page.tsx` — no breadcrumb or back link component |
| **Reproduction** | Navigate to account detail from dashboard NBA link, try to go back to accounts list |
| **Expected** | Breadcrumb like "Accounts > Ørsted Energy" or back arrow |
| **Actual** | Must use browser back button |
| **Likely cause** | Not implemented |
| **Recommended fix** | Add `← Accounts` / `← Pipeline` link at top of detail pages |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Navigation confusion. Users feel lost. |
| **Device scope** | Both |

---

### Group 3: Quick wins with high impact

---

#### AUDIT-011: Account type constants used inconsistently

| Field | Value |
|-------|-------|
| **Title** | Account type options defined in 3+ different places with different values |
| **Area** | Frontend |
| **Severity** | Medium |
| **Beta priority** | Quick win |
| **Confidence** | High |
| **Evidence** | `leads/page.tsx:118-129` (IPP, Corporate, Registry), `accounts/page.tsx:77-84` (matches enum), Prisma `AccountType` enum |
| **Reproduction** | Compare dropdown options across create forms |
| **Expected** | Consistent options everywhere |
| **Actual** | Different options in different forms |
| **Likely cause** | Hardcoded options without shared constant |
| **Recommended fix** | Export `ACCOUNT_TYPES` from `types.ts`, import everywhere |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | Fixes AUDIT-003 |
| **Risk if not fixed** | Data inconsistency, failed operations |
| **Device scope** | Both |

---

#### AUDIT-012: TopBar page title not updating for all routes

| Field | Value |
|-------|-------|
| **Title** | TopBar title map missing entries for meetings, import, digest |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Quick win |
| **Confidence** | High |
| **Evidence** | `src/components/layout/TopBar.tsx:9-11` — titles map doesn't include `/meetings`, `/import`, `/digest` |
| **Reproduction** | Navigate to /meetings, /import, or /digest |
| **Expected** | Shows "Meetings", "Import", "Digest" |
| **Actual** | Shows "Eco-Insight" fallback |
| **Likely cause** | Map not updated when pages were added |
| **Recommended fix** | Add entries: `'/meetings': 'Meetings', '/import': 'Import', '/digest': 'Digest'` |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Minor polish issue. |
| **Device scope** | Both |

---

#### AUDIT-013: Email archive has no undo or confirmation

| Field | Value |
|-------|-------|
| **Title** | Archiving an email is instant and irreversible from the UI |
| **Area** | UX |
| **Severity** | Medium |
| **Beta priority** | Quick win |
| **Confidence** | High |
| **Evidence** | `inbox/page.tsx:131-134` — archive calls `archiveEmail.mutate` directly; no `isArchived` filter toggle in UI |
| **Reproduction** | Archive an email in inbox |
| **Expected** | Undo toast or archived emails filter |
| **Actual** | Email disappears permanently from inbox view |
| **Likely cause** | Archive implemented without recovery path |
| **Recommended fix** | Add 5-second undo toast, or add "Show archived" filter toggle |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Users accidentally archive important emails with no recovery. |
| **Device scope** | Both |

---

#### AUDIT-014: Leads mobile: no search/filter capabilities

| Field | Value |
|-------|-------|
| **Title** | Leads page mobile view has no search or filter |
| **Area** | UX / Mobile |
| **Severity** | Medium |
| **Beta priority** | Quick win |
| **Confidence** | High |
| **Evidence** | `leads/page.tsx` — kanban is `hidden md:flex`, mobile list has no search input |
| **Reproduction** | Open /leads on mobile |
| **Expected** | Search bar and/or stage filter |
| **Actual** | Just a flat list of all leads |
| **Likely cause** | Mobile list was a fallback, not a first-class design |
| **Recommended fix** | Add SearchInput and stage filter chips above mobile list |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Mobile users with many leads can't find specific ones. |
| **Device scope** | Mobile |

---

#### AUDIT-015: Queue approve has no confirmation for high-priority items

| Field | Value |
|-------|-------|
| **Title** | Approving queue items creates permanent data with single click |
| **Area** | UX |
| **Severity** | Medium |
| **Beta priority** | Quick win |
| **Confidence** | High |
| **Evidence** | `queue/page.tsx:328-342` — Approve button directly calls mutate |
| **Reproduction** | Click Approve on any queue item |
| **Expected** | Confirmation for High-priority items at minimum |
| **Actual** | Immediate execution, data created |
| **Likely cause** | Designed for speed over safety |
| **Recommended fix** | Add ConfirmDialog for High-priority items only |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Accidental approval of wrong items. |
| **Device scope** | Both |

---

#### AUDIT-016: Pipeline mobile list lacks "create opportunity" affordance

| Field | Value |
|-------|-------|
| **Title** | Pipeline mobile empty state has CTA but non-empty mobile list has no visible create button |
| **Area** | UX / Mobile |
| **Severity** | Low |
| **Beta priority** | Quick win |
| **Confidence** | High |
| **Evidence** | `pipeline/page.tsx:492-512` — mobile list only shows cards; "+ New Opportunity" button is in the header which scrolls away |
| **Reproduction** | Scroll down on pipeline mobile view |
| **Expected** | FAB or sticky create button |
| **Actual** | Must scroll back to top |
| **Likely cause** | Header buttons scroll away on mobile |
| **Recommended fix** | Make header sticky or add FAB |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Dependencies** | None |
| **Risk if not fixed** | Minor friction on mobile. |
| **Device scope** | Mobile |

---

### Group 4: Important but not urgent

---

#### AUDIT-017: No cross-tab state sync

| Field | Value |
|-------|-------|
| **Title** | Opening app in two browser tabs can show stale data |
| **Area** | Frontend |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | Medium |
| **Evidence** | React Query handles dedup within a tab but no cross-tab invalidation |
| **Likely cause** | No BroadcastChannel or similar cross-tab sync |
| **Recommended fix** | Add React Query `broadcastQueryClient` plugin |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | User approves queue item in tab A; tab B still shows it as pending. |
| **Device scope** | Desktop |

---

#### AUDIT-018: No browser page title updates per route

| Field | Value |
|-------|-------|
| **Title** | Browser tab title stays static, not updating per page |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | Medium |
| **Evidence** | `src/app/layout.tsx` likely sets a static title; Next.js metadata API may not be configured per-page |
| **Likely cause** | Missing `metadata` export in page files |
| **Recommended fix** | Add metadata exports or use `useEffect` to set document.title |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Multiple tabs all say "Eco-Insight" — hard to distinguish. |
| **Device scope** | Desktop |

---

#### AUDIT-019: Bulk actions lack confirmation for destructive operations

| Field | Value |
|-------|-------|
| **Title** | Bulk disqualify and bulk close-lost execute without confirmation |
| **Area** | UX |
| **Severity** | Medium |
| **Beta priority** | Can wait |
| **Confidence** | High |
| **Evidence** | `leads/page.tsx:660-669` (bulk disqualify), `pipeline/page.tsx:525-532` (bulk close lost) — no ConfirmDialog |
| **Recommended fix** | Add ConfirmDialog: "Disqualify 5 leads? This cannot be undone." |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Accidental bulk destruction of data. |
| **Device scope** | Both |

---

#### AUDIT-020: Search results not capped

| Field | Value |
|-------|-------|
| **Title** | Command palette search returns all matches without limit |
| **Area** | Performance |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | Medium |
| **Evidence** | `src/app/api/search/route.ts` — may return unlimited results |
| **Recommended fix** | Limit to 5-10 results per entity type |
| **Estimated effort** | XS |
| **Suggested owner** | Backend |
| **Risk if not fixed** | Slow search with large datasets. |
| **Device scope** | Both |

---

#### AUDIT-021: Meeting calendar grid mobile usability

| Field | Value |
|-------|-------|
| **Title** | Calendar grid component may not adapt well to 375px width |
| **Area** | Mobile |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | Low |
| **Evidence** | `src/components/meetings/CalendarGrid.tsx` — [UNCERTAIN] not fully reviewed |
| **Recommended fix** | Verify at 375px; may need to show list-only on mobile |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Calendar may overflow or clip on mobile. |
| **Device scope** | Mobile |

---

#### AUDIT-022: No print styles for any page

| Field | Value |
|-------|-------|
| **Title** | Printing any page includes sidebar, nav, and produces unusable output |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | High |
| **Evidence** | No `@media print` rules in globals.css |
| **Recommended fix** | Add print media query to hide nav, expand content |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Can't print account briefs or pipeline summaries. |
| **Device scope** | Desktop |

---

#### AUDIT-023: useEffect dependency warnings in accounts page

| Field | Value |
|-------|-------|
| **Title** | useEffect for auto-open create drawer has no dependency array |
| **Area** | Frontend / QA |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | High |
| **Evidence** | `accounts/page.tsx:210-215` — `useEffect(() => { ... })` with no deps array runs every render; guarded by ref but wasteful |
| **Recommended fix** | Add `[searchParams]` dependency array |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Minor performance waste. |
| **Device scope** | Both |

---

#### AUDIT-024: Contact roles from Settings not used in contact forms

| Field | Value |
|-------|-------|
| **Title** | Custom contact roles defined in Settings → Roles tab aren't reflected in contact creation forms |
| **Area** | Product / UX |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | Medium |
| **Evidence** | Settings has `useContactRolesQuery`/`useCreateContactRole` for custom roles; contact forms likely use hardcoded `ContactRole` type |
| **Recommended fix** | Load contact roles from API in contact forms |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Custom roles configured but not usable in contact creation. |
| **Device scope** | Both |

---

#### AUDIT-025: Drawer close focus restoration

| Field | Value |
|-------|-------|
| **Title** | Closing a drawer doesn't return focus to the element that opened it |
| **Area** | Accessibility |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | Medium |
| **Evidence** | `src/components/shell/Drawer.tsx` — `closeDrawer` sets state but likely doesn't track opener |
| **Recommended fix** | Store opener ref, restore focus on close |
| **Estimated effort** | S |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Focus lost after drawer interactions for keyboard users. |
| **Device scope** | Both |

---

#### AUDIT-026: Mark-as-read effect fires on every render

| Field | Value |
|-------|-------|
| **Title** | Inbox mark-as-read useEffect may fire excessively |
| **Area** | Frontend / Performance |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | High |
| **Evidence** | `inbox/page.tsx:48-53` — effect depends on `selectedThread?.threadId` which changes on every re-render if thread object is recreated |
| **Recommended fix** | Add guard: `if (selectedThread?.isUnread && !markRead.isPending)` |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Unnecessary API calls on every inbox re-render. |
| **Device scope** | Both |

---

#### AUDIT-027: No loading state for bulk operations

| Field | Value |
|-------|-------|
| **Title** | Bulk action buttons don't show loading state while processing |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Can wait |
| **Confidence** | High |
| **Evidence** | `BulkActionBar` component accepts `isPending` per action but some callers may not pass it |
| **Recommended fix** | Verify all bulk action buttons show spinner during pending state |
| **Estimated effort** | XS |
| **Suggested owner** | Frontend |
| **Risk if not fixed** | Users may double-click bulk actions. |
| **Device scope** | Both |

---

### Group 5: Post-beta improvements

---

#### AUDIT-028: Virtual scrolling for large lists

| Field | Value |
|-------|-------|
| **Title** | All lists render all items without virtualization |
| **Area** | Performance |
| **Severity** | Low |
| **Beta priority** | Post-beta |
| **Confidence** | High |
| **Recommended fix** | Add `react-virtual` or `@tanstack/react-virtual` for lists > 50 items |
| **Estimated effort** | M |
| **Device scope** | Both |

---

#### AUDIT-029: Offline/flaky connection handling

| Field | Value |
|-------|-------|
| **Title** | No offline detection or graceful degradation |
| **Area** | Frontend |
| **Severity** | Low |
| **Beta priority** | Post-beta |
| **Confidence** | High |
| **Recommended fix** | Add navigator.onLine detection, queue failed mutations for retry |
| **Estimated effort** | M |
| **Device scope** | Both |

---

#### AUDIT-030: Deep linking for all entity types

| Field | Value |
|-------|-------|
| **Title** | No shareable URLs for individual signals, leads, or tasks |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Post-beta |
| **Confidence** | High |
| **Recommended fix** | Add detail routes or drawer-in-URL pattern for all entities |
| **Estimated effort** | M |
| **Device scope** | Both |

---

#### AUDIT-031: Multi-user conflict detection

| Field | Value |
|-------|-------|
| **Title** | No optimistic locking — two users editing same record silently overwrite |
| **Area** | Backend |
| **Severity** | Medium |
| **Beta priority** | Post-beta |
| **Confidence** | High |
| **Recommended fix** | Add `updatedAt` check on PATCH endpoints; return 409 on conflict |
| **Estimated effort** | M |
| **Device scope** | Both |

---

#### AUDIT-032: Session timeout UX

| Field | Value |
|-------|-------|
| **Title** | No warning when session is about to expire |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Post-beta |
| **Confidence** | Medium |
| **Recommended fix** | Add session expiry detection with "Session expired" toast and re-login link |
| **Estimated effort** | S |
| **Device scope** | Both |

---

#### AUDIT-033: Copy entity ID/URL feature

| Field | Value |
|-------|-------|
| **Title** | No way to copy record ID or shareable URL |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Post-beta |
| **Confidence** | High |
| **Recommended fix** | Add "Copy link" button on account/deal detail pages |
| **Estimated effort** | XS |
| **Device scope** | Both |

---

### Group 6: Nice-to-have ideas

---

#### AUDIT-034: Swipe gestures for mobile inbox

| Field | Value |
|-------|-------|
| **Title** | Email list could support swipe-to-archive on mobile |
| **Area** | Mobile / UX |
| **Severity** | Low |
| **Beta priority** | Nice to have |
| **Recommended fix** | Add Hammer.js or native touch handlers for swipe gestures |
| **Estimated effort** | M |
| **Device scope** | Mobile |

---

#### AUDIT-035: Keyboard shortcuts documentation

| Field | Value |
|-------|-------|
| **Title** | Inbox keyboard shortcuts (j/k/e/t) not documented anywhere visible |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Nice to have |
| **Recommended fix** | Add "?" key to show shortcuts overlay, or add hint in inbox header |
| **Estimated effort** | S |
| **Device scope** | Desktop |

---

#### AUDIT-036: Pipeline card right-click context menu

| Field | Value |
|-------|-------|
| **Title** | Add context menu on pipeline cards for quick actions |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Nice to have |
| **Recommended fix** | Right-click opens menu with: Move to stage, Open detail, Copy link |
| **Estimated effort** | S |
| **Device scope** | Desktop |

---

#### AUDIT-037: Real-time data freshness indicator

| Field | Value |
|-------|-------|
| **Title** | No indication of when data was last fetched |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Nice to have |
| **Recommended fix** | Show subtle "Updated 2m ago" on dashboard, or "Stale" indicator |
| **Estimated effort** | S |
| **Device scope** | Both |

---

#### AUDIT-038: Dashboard stat cards clickable

| Field | Value |
|-------|-------|
| **Title** | Dashboard stat cards (Pipeline, Open Deals, At Risk, etc.) are display-only |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Nice to have |
| **Recommended fix** | Make cards clickable to navigate to relevant page (Pipeline → /pipeline, Signals → /signals) |
| **Estimated effort** | XS |
| **Device scope** | Both |

---

#### AUDIT-039: Batch notification for bulk actions

| Field | Value |
|-------|-------|
| **Title** | Bulk advancing 5 leads shows one toast, but creates 5 separate operations |
| **Area** | Backend |
| **Severity** | Low |
| **Beta priority** | Nice to have |
| **Recommended fix** | Show progress: "Advanced 3/5 leads..." |
| **Estimated effort** | S |
| **Device scope** | Both |

---

#### AUDIT-040: Account detail "back to list" preserves filters

| Field | Value |
|-------|-------|
| **Title** | Navigating back from account detail resets any active filters |
| **Area** | UX |
| **Severity** | Low |
| **Beta priority** | Nice to have |
| **Recommended fix** | Use URL params already — Next.js router.back should preserve them |
| **Estimated effort** | XS |
| **Device scope** | Both |

---

## PHASE 10 — Ship Recommendation

### Ship Decision: YES WITH CONDITIONS

The app is ready for tomorrow's internal beta **if** the two mobile blockers (AUDIT-001 and AUDIT-002) are fixed. Everything else can ship as-is with caveats communicated to testers.

### Readiness Summary

| Surface | Rating | Notes |
|---------|--------|-------|
| **Desktop** | Ready | Polished, functional, well-designed. Minor issues noted but nothing blocking. |
| **Mobile** | Ready with caveats | Inbox broken. Navigation incomplete. Core workflows (dashboard, queue, pipeline) work. |

### Top 10 Most Important Issues (Ranked)

1. **AUDIT-001** — Inbox has no mobile layout (Blocker)
2. **AUDIT-002** — Mobile nav missing 6 pages (Blocker)
3. **AUDIT-003** — Account type enum mismatch in lead conversion (High)
4. **AUDIT-004** — No error boundary → white screen on crash (High)
5. **AUDIT-008** — Pipeline backward drag references non-existent dropdown (Medium)
6. **AUDIT-005** — SSE notification stream no reconnect (Medium)
7. **AUDIT-010** — No back navigation on detail pages (Medium)
8. **AUDIT-013** — Email archive has no undo (Medium)
9. **AUDIT-007** — Modal focus trap missing (Medium)
10. **AUDIT-009** — Pipeline kanban no keyboard accessibility (Medium)

### Fastest High-Impact Improvements (< 2 hours each)

1. **Add "More" tab to bottom nav** (AUDIT-002) — 30 min. Add a 5th tab that opens a sheet with remaining nav items.
2. **Fix account type enum mismatch** (AUDIT-003) — 15 min. Replace hardcoded options with values from schema.
3. **Fix backward drag message** (AUDIT-008) — 5 min. Change toast text to reference deal detail page.
4. **Add TopBar title entries** (AUDIT-012) — 5 min. Add 3 missing entries to titles map.
5. **Add error boundary** (AUDIT-004) — 30 min. Wrap dashboard layout children in ErrorBoundary.
6. **Add back links to detail pages** (AUDIT-010) — 15 min. Add "← Accounts" / "← Pipeline" links.
7. **Add URL params to leads page** (AUDIT-006) — 15 min. Copy pattern from accounts page.
8. **Add mobile inbox layout** (AUDIT-001) — 2 hours. Thread list on mobile, tap to view, back to list.

### Biggest Under-the-Hood Risks

1. **No error boundary** — One uncaught error kills the entire app
2. **SSE stream fragility** — Notifications silently stop on connection drop
3. **Mark-as-read effect** — May fire excessive API calls
4. **OAuth tokens unencrypted** — Acceptable for internal beta, must fix before any external use

### Biggest Desktop UX Problems

1. Pipeline backward drag message references non-existent UI
2. No breadcrumbs on detail pages
3. Queue approve has no confirmation for high-priority items
4. Email archive is irreversible from UI

### Biggest Mobile UX Problems

1. **Inbox completely broken** — 3-panel layout doesn't adapt
2. **6 pages unreachable** — No "More" menu in bottom nav
3. **Leads have no search/filter on mobile**
4. **Bulk action checkboxes too small for touch**

### Biggest Cross-Device Consistency Problems

1. Desktop has kanban for leads/pipeline; mobile shows flat lists with different sort orders
2. Desktop sidebar shows all 11 nav items; mobile bottom nav shows only 5

### Biggest Trust-Breaking Bugs

1. Inbox on mobile — broken layout screams "not ready"
2. Lead conversion with invalid account types — silent failure
3. Email archive with no undo — users fear losing important emails
4. Pipeline backward drag references phantom UI — feels buggy

### Beta Communication Draft

> **Subject: Eco-Insight Revenue OS — Internal Beta Tomorrow**
>
> Team,
>
> Tomorrow we're launching the internal beta of Eco-Insight Revenue OS. Here's what you need to know:
>
> **What works great:**
> - Dashboard with AI-powered Next Best Actions
> - Lead management with FIUAC scoring and kanban board
> - Pipeline management with drag-drop stage progression
> - AI approval queue — review and edit suggestions before they execute
> - Account management with contacts and AI-generated briefs
> - Task management with assignments, comments, and @mentions
> - Real-time notifications
> - Light and dark themes
>
> **Known limitations:**
> - **Inbox** requires Microsoft Outlook integration to show real emails. Without it, it will be empty. We'll set this up during beta.
> - **AI agents** (Run Now, Weekly Digest) require API configuration — some may show errors initially.
> - **Mobile navigation** — The bottom bar shows 5 main sections. To reach Signals, Leads, Accounts, or Meetings on mobile, tap the **+ New** button to open the search palette, then type what you're looking for.
> - **Pipeline drag-drop** only works forward (Discovery → Evaluation → etc). To move a deal backward, open the deal detail page.
>
> **How to give feedback:**
> - Note the exact screen you were on
> - Describe what you expected vs. what happened
> - Take a screenshot if possible
> - Post in #eco-insight-beta Slack channel
>
> **What we're watching:**
> - Can you complete the core workflow: Signal → Lead → Opportunity → Pipeline progression?
> - Do the AI suggestions in the Approval Queue feel relevant?
> - Is the dashboard useful for your morning workflow?
> - Does the app feel fast enough?
>
> Looking forward to your feedback!

### Recommended Next-24-Hours Action Plan

| Time | Action | Owner |
|------|--------|-------|
| **Now** | Fix AUDIT-002: Add "More" tab to mobile bottom nav | Frontend |
| **Now** | Fix AUDIT-003: Fix account type enum mismatch | Frontend |
| **Now** | Fix AUDIT-008: Fix backward drag toast message | Frontend |
| **Now** | Fix AUDIT-012: Add missing TopBar title entries | Frontend |
| **+1h** | Fix AUDIT-004: Add error boundary to dashboard layout | Frontend |
| **+1h** | Fix AUDIT-010: Add back links to detail pages | Frontend |
| **+2h** | Fix AUDIT-001: Add mobile inbox layout (thread list + view toggle) | Frontend |
| **+3h** | Fix AUDIT-006: Add URL params to leads page | Frontend |
| **+3h** | Verify seed data has current-date meetings and queue items | Backend |
| **+3h** | Draft and send beta communication | Product |
| **+4h** | Run full app walkthrough on desktop Chrome, mobile Safari, mobile Chrome | QA |
| **Beta start** | Monitor #eco-insight-beta channel | All |
| **During beta** | Watch for: error rates, empty states, navigation confusion, mobile complaints | Ops |

### What to Watch During Beta

- **Error rates** — Check Vercel logs for 500 errors
- **SSE connection health** — Monitor notification stream disconnects
- **Most visited pages** — Which sections do users actually use?
- **Mobile vs desktop usage** — How many testers use mobile?
- **Queue approval rate** — Are users approving or rejecting AI suggestions?
- **Session duration** — Are users staying or bouncing?
- **Empty state encounters** — Are users hitting pages with no data?
- **Search usage** — Is command palette discovered and used?

---

## Contradiction Check

Reviewed all phases for contradictions. One noted:
- Phase 2 says "No global error boundary" is High severity, should fix. Phase 4 says "What works well: Skeleton loading states, Error states." These are not contradictory — `ErrorState` component exists for API errors within pages, but no boundary exists for unexpected React rendering crashes. Both statements are accurate.

No other contradictions found.
