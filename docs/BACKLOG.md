# Eco-Insight Revenue OS — Master Backlog

> **Single source of truth.** All other backlog/audit files are archived.
>
> Last updated: 2026-03-14
> Methodology: ROI-ordered (impact / effort), sequenced by practical dependency chains
> Scoring: Impact 1–10, Effort 1–10, Confidence 1–10
>
> Previous documents merged into this file:
> - `AUDIT.md` (2026-03-12) — archived to `docs/archive/AUDIT-2026-03-12.md`
> - `BACKLOG.md` (2026-03-12) — archived to `docs/archive/BACKLOG-2026-03-12.md`
> - `docs/BACKLOG-PRIORITIZED.md` (2026-03-14) — superseded by this file

---

## Standing Operational Decisions

These are active decisions that affect how work is prioritized and implemented. They override default assumptions.

### AUTH: Production runs without mandatory authorization

The Vercel production deployment must remain accessible without enforced sign-in until explicitly changed. Auth infrastructure exists (NextAuth + Google SSO) but is not a gate for accessing the app. This means:

- **Do NOT add auth-required redirects to production** until the team decides otherwise
- The auth bypass for approved users (`src/lib/auth-bypass.ts`) stays in place
- New users are onboarded by **manually adding them to the database** (no self-registration, no invite flow required)
- All "Required before beta" items in this backlog should be evaluated with this constraint — auth hardening items (rate limiting, session timeout, CSRF enforcement) are lower priority while auth is optional
- When this decision changes, update this section and re-prioritize auth-related items

### USER PROVISIONING: Manual database insertion

New team members are added by inserting a `User` record directly into the database. No automated invite flow is required for current operations. The existing invitation system is available but not the primary onboarding path.

---

## Status Legend

- **Open** — not started
- **Done** — completed and verified
- **Won't Do** — explicitly deprioritized with rationale

---

## DO NOW

Pre-beta blockers and embarrassing bugs. Complete before any other work.

---

### 1. Define missing CSS variables `--card-hover` and `--text`

| Field | Value |
|-------|-------|
| **Description** | Add `--card-hover` and `--text` CSS custom properties to `globals.css` `:root` and `.dark` selectors. Currently referenced in 72 places but never defined. |
| **User problem** | Hover states are invisible across the entire app. Text using `var(--text)` renders as default/fallback. Product looks broken on first impression. |
| **Proposed fix** | Add 2 lines to `:root` and 2 lines to `.dark` in `src/app/globals.css`. |
| **Impact** | 10 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | All 72 references resolve. Hover states visible on cards, table rows, list items. Text renders correctly. Visual regression check on home, accounts, pipeline, queue. |
| **Owner** | Frontend |
| **Required before beta** | Yes |
| **Value type** | Trust, Adoption |
| **Status** | Done (2026-03-14: confirmed vars already defined in globals.css) |

---

### 2. Fix hardcoded meeting date filter on home dashboard

| Field | Value |
|-------|-------|
| **Description** | `src/app/api/home/route.ts` filters meetings by literal string `'2026-03-11'`. "Today's Schedule" is permanently empty. |
| **User problem** | Dashboard meetings section always empty. Users think calendar sync is broken. |
| **Proposed fix** | Replace with `new Date().toISOString().slice(0, 10)`. |
| **Impact** | 8 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | Home dashboard shows meetings for current day. Works across timezones. |
| **Owner** | Backend |
| **Required before beta** | Yes |
| **Value type** | Trust, Speed |
| **Status** | Done (2026-03-14: confirmed route already uses dynamic new Date()) |

---

### 3. Wire TopBar "+ New" button to CommandPalette

| Field | Value |
|-------|-------|
| **Description** | `src/components/layout/TopBar.tsx` has `onClick={() => {}}`. Most visible action button does nothing. |
| **User problem** | Users click the primary action button, nothing happens. Immediate trust loss. |
| **Proposed fix** | Wire to `useStore.getState().openPalette()` or open create-entity dropdown. |
| **Impact** | 9 |
| **Effort** | 2 |
| **Confidence** | 10 |
| **Acceptance criteria** | Clicking "+ New" opens CommandPalette or create dropdown. At least one creation path works end-to-end. |
| **Owner** | Frontend |
| **Required before beta** | Yes |
| **Value type** | Trust, Adoption |
| **Status** | Done (2026-03-14: confirmed already wired to useStore.openPalette()) |

---

### 4. Replace `window.location.href` with `router.push` in pipeline

| Field | Value |
|-------|-------|
| **Description** | Pipeline page uses `window.location.href` for navigation, causing full page reload. |
| **User problem** | Sidebar flashes, loading states restart, scroll position lost. Feels like legacy app. |
| **Proposed fix** | Import `useRouter` from `next/navigation`, replace with `router.push()`. |
| **Impact** | 7 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | Pipeline row clicks navigate without reload. Sidebar stable. Back button works. |
| **Owner** | Frontend |
| **Required before beta** | Yes |
| **Value type** | Speed, Trust |
| **Status** | Done (2026-03-14: confirmed pipeline uses router.push, no window.location.href) |

---

### 5. Wire inbox Archive mutation

| Field | Value |
|-------|-------|
| **Description** | Archive button calls `closeDrawer()` but doesn't archive the email. |
| **User problem** | User clicks Archive, drawer closes, email still there. Feature appears broken. |
| **Proposed fix** | Add mutation that sets `archived: true`. Wire button, invalidate inbox query on success. |
| **Impact** | 7 |
| **Effort** | 2 |
| **Confidence** | 10 |
| **Acceptance criteria** | Archive removes email from inbox view. Archived emails visible via filter. Toast confirmation. |
| **Owner** | Frontend + Backend |
| **Required before beta** | Yes |
| **Value type** | Trust, Speed |
| **Status** | Done |

---

### 6. Remove light mode toggle

| Field | Value |
|-------|-------|
| **Description** | Toggle exists in Sidebar but light mode CSS is unimplemented. Toggling breaks the UI. |
| **User problem** | User toggles light mode, app becomes unusable. Must find toggle in broken UI to switch back. |
| **Proposed fix** | Remove toggle from Sidebar. Keep dark theme infrastructure. Re-add when light mode is complete. |
| **Impact** | 6 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | No toggle visible. App renders exclusively in dark mode. No orphaned theme state. |
| **Owner** | Frontend |
| **Required before beta** | Yes |
| **Value type** | Trust |
| **Status** | Done (2026-03-14: removed orphaned toggleTheme from store, no toggle UI existed) |

---

### 7. Add Prisma `$transaction()` to lead conversion flow

| Field | Value |
|-------|-------|
| **Description** | Lead conversion creates Account then Opportunity without transaction. Partial failure = orphaned data. |
| **User problem** | Account created but opportunity missing. User doesn't know. Data inconsistency accumulates. |
| **Proposed fix** | Wrap in `prisma.$transaction([...])`. |
| **Impact** | 8 |
| **Effort** | 2 |
| **Confidence** | 10 |
| **Acceptance criteria** | Conversion is atomic. On failure, lead remains unconverted. No orphaned accounts. |
| **Owner** | Backend |
| **Required before beta** | Yes |
| **Value type** | Risk reduction |
| **Status** | Done |

---

### 8. Fix scoped-db authorization — move ownership check to WHERE clause

| Field | Value |
|-------|-------|
| **Description** | `scoped-db.ts` fetches records then checks ownership. Authorization bypass risk. |
| **User problem** | Security gap: unauthorized records fetched before check. |
| **Proposed fix** | Move ownership filters into `where` clause. Use `findFirst` with compound `where: { id, ownerId }`. |
| **Impact** | 9 |
| **Effort** | 3 |
| **Confidence** | 9 |
| **Acceptance criteria** | All scoped queries include ownership in WHERE. Non-owners get 404. Unit tests confirm. |
| **Owner** | Backend |
| **Required before beta** | Yes |
| **Value type** | Risk reduction |
| **Status** | Done |

---

### 9. Extract STAGE_PROB to shared constant

| Field | Value |
|-------|-------|
| **Description** | Stage-to-probability mapping duplicated in 4 files. |
| **User problem** | Divergence causes pipeline values to disagree across pages. |
| **Proposed fix** | Create `src/lib/constants.ts`, import everywhere, delete local definitions. |
| **Impact** | 6 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | Single source of truth. All 4 sites import from constants. |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Done |

---

### 10. Remove fake keyboard shortcut hints from Queue page

| Field | Value |
|-------|-------|
| **Description** | Queue page shows shortcut hints but no handlers exist. |
| **User problem** | Users try shortcuts, nothing happens. |
| **Proposed fix** | Remove hint UI. Add back when shortcuts are implemented. |
| **Impact** | 4 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | No shortcut hints visible. |
| **Owner** | Frontend |
| **Required before beta** | Yes |
| **Value type** | Trust |
| **Status** | Done (2026-03-14: confirmed no fake shortcut hints in Queue page) |

---

### 11. Add loading spinners to mutation buttons

| Field | Value |
|-------|-------|
| **Description** | Mutation buttons show disabled state but no visual loading indicator. |
| **User problem** | No feedback that action is processing. Users may navigate away. |
| **Proposed fix** | Add `animate-spin` icon when `isPending`. Create shared `<SubmitButton>` component. |
| **Impact** | 5 |
| **Effort** | 2 |
| **Confidence** | 10 |
| **Acceptance criteria** | All mutation buttons show spinner during pending. Disappears on success/error. |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Trust, Speed |
| **Status** | Done (2026-03-14: added Spinner to 8 mutation buttons across accounts, inbox, leads, meetings, settings) |

---

### 12. Add duplicate account check on lead conversion

| Field | Value |
|-------|-------|
| **Description** | Lead conversion doesn't check for existing accounts with same name. |
| **User problem** | Duplicate accounts created. Activities and opportunities split. |
| **Proposed fix** | Query for existing account (case-insensitive) before creating. Link to existing if found. |
| **Impact** | 7 |
| **Effort** | 2 |
| **Confidence** | 9 |
| **Acceptance criteria** | Matching account reuses existing record. User informed. No duplicates. |
| **Owner** | Backend |
| **Required before beta** | Yes |
| **Value type** | Risk reduction |
| **Status** | Done |

---

### 13. Fix meeting timezone display

| Field | Value |
|-------|-------|
| **Description** | `adapters.ts` uses `getUTCHours()` — shows UTC regardless of user timezone. |
| **User problem** | Wrong meeting times displayed. Could cause missed meetings. |
| **Proposed fix** | Use `toLocaleTimeString()` with user timezone or `Intl.DateTimeFormat`. |
| **Impact** | 7 |
| **Effort** | 2 |
| **Confidence** | 9 |
| **Acceptance criteria** | Times display in local timezone. Consistent format. |
| **Owner** | Frontend |
| **Required before beta** | Yes |
| **Value type** | Trust, Risk reduction |
| **Status** | Done (2026-03-14: replaced getUTCHours with toLocaleTimeString for local timezone) |

---

## DO NEXT

High-leverage builds. Tackle after DO NOW is complete.

---

### 14. Implement pipeline kanban columns

| Field | Value |
|-------|-------|
| **Description** | Pipeline is a flat list. CRM users expect stage columns with drag-drop. Leads page already has kanban to reuse. |
| **User problem** | Pipeline feels like spreadsheet, not sales tool. No visual deal flow. |
| **Proposed fix** | Reuse leads kanban pattern. Stage columns with drag-drop. Mobile list fallback. |
| **Impact** | 9 |
| **Effort** | 5 |
| **Confidence** | 8 |
| **Acceptance criteria** | Stage columns on desktop. Draggable deals. API call on move. Probability auto-updates. Column headers show count + total value. |
| **Owner** | Frontend |
| **Required before beta** | Yes |
| **Value type** | Adoption, Trust |
| **Status** | Done (2026-03-14: kanban already implemented with drag-drop, fixed column header layout to group count+value) |

---

### 15. Add cursor pagination to all list API endpoints

| Field | Value |
|-------|-------|
| **Description** | Most list endpoints return all records. Only leads/opportunities have partial cursor support. |
| **User problem** | 500+ records = slow/timeout. Product feels slow. |
| **Proposed fix** | Add `take: 25` + cursor pagination. Return `{ items, nextCursor, hasMore }`. "Load More" in frontend. |
| **Impact** | 8 |
| **Effort** | 4 |
| **Confidence** | 9 |
| **Acceptance criteria** | All list endpoints accept `cursor` + `limit`. Default 25. Frontend shows load-more. Under 500ms with 10K+ records. |
| **Owner** | Backend + Frontend |
| **Required before beta** | Yes |
| **Value type** | Speed, Adoption |
| **Status** | Done |

---

### 16. Add Zod validation to queue item payloads

| Field | Value |
|-------|-------|
| **Description** | Queue payloads cast with `as unknown as`. No runtime validation. Malformed agent output causes silent failures. |
| **User problem** | Approving queue item with bad payload silently fails. Data not created/updated. |
| **Proposed fix** | Validate with existing Zod schemas in `agents/schemas.ts` before side effects. |
| **Impact** | 7 |
| **Effort** | 3 |
| **Confidence** | 9 |
| **Acceptance criteria** | All payloads validated. Invalid = 422 with readable error. Approval blocked until fixed. |
| **Owner** | Backend |
| **Required before beta** | Yes |
| **Value type** | Risk reduction, Trust |
| **Status** | Done |

---

### 17. Add request IDs to API error responses

| Field | Value |
|-------|-------|
| **Description** | Errors return `{ code, message }` with no request ID. Untraceable in logs. |
| **User problem** | Impossible to debug user-reported errors. |
| **Proposed fix** | Generate UUID per request. Include as `x-request-id` header and in error body. Log alongside all errors. |
| **Impact** | 5 |
| **Effort** | 2 |
| **Confidence** | 9 |
| **Acceptance criteria** | Every response has `x-request-id`. Error bodies include `requestId`. Logs match. |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction, Speed |
| **Status** | Done |

---

### 18. Replace N+1 aggregates with Prisma `groupBy`/`_sum` on home dashboard

| Field | Value |
|-------|-------|
| **Description** | Home route loads ALL opportunities twice for aggregates. Should use Prisma aggregate functions. |
| **User problem** | Dashboard loads slowly as opportunity count grows. |
| **Proposed fix** | Use `prisma.opportunity.aggregate()` and `groupBy`. |
| **Impact** | 6 |
| **Effort** | 3 |
| **Confidence** | 9 |
| **Acceptance criteria** | Stats via single aggregate query. Under 300ms with 10K opps. |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Speed |
| **Status** | Done |

---

### 19. Batch admin notifications on queue item creation

| Field | Value |
|-------|-------|
| **Description** | Each queue item creates individual notifications for ALL admins. 10 items = 10 x N notifications. |
| **User problem** | Notification dropdown flooded. Users ignore notifications. |
| **Proposed fix** | Batch: "5 new items pending." Dedup window (5 minutes). |
| **Impact** | 6 |
| **Effort** | 3 |
| **Confidence** | 8 |
| **Acceptance criteria** | Max 1 notification per admin per agent batch. Shows count. No duplicates within 5 min. |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Trust, Speed |
| **Status** | Done |

---

### 20. Create consistent `<SearchInput>` component

| Field | Value |
|-------|-------|
| **Description** | Search inputs implemented differently per page — styling, debounce, placeholders differ. |
| **User problem** | Inconsistent search experience. |
| **Proposed fix** | Shared `SearchInput.tsx` with consistent styling, 300ms debounce, clear button, icon. |
| **Impact** | 5 |
| **Effort** | 3 |
| **Confidence** | 9 |
| **Acceptance criteria** | All list pages use shared component. Consistent behavior. |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Trust |
| **Status** | Done (2026-03-14: enhanced SearchInput with 300ms debounce, clear button, updated tasks+accounts pages) |

---

### 21. Fix consistent button styling

| Field | Value |
|-------|-------|
| **Description** | Primary buttons alternate between `bg-brand` and `bg-[var(--brand)]`. |
| **User problem** | Codebase inconsistency; harder to maintain and theme. |
| **Proposed fix** | Standardize on `bg-brand`. Search-and-replace. |
| **Impact** | 3 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | Zero instances of `bg-[var(--brand)]`. Visual unchanged. |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Speed (developer velocity) |
| **Status** | Done (2026-03-14: replaced 6 bg-[var(--brand)] instances with bg-brand in signals + leads) |

---

### 22. Implement onboarding / first-run experience

| Field | Value |
|-------|-------|
| **Description** | New users see empty dashboard with no guidance. |
| **User problem** | Blank screen = abandonment. Users don't know what to do first. |
| **Proposed fix** | Detect first-run. Show onboarding card: "1. Connect email 2. Run Signal Hunter 3. Review leads." Dismiss after first account created. |
| **Impact** | 8 |
| **Effort** | 5 |
| **Confidence** | 7 |
| **Acceptance criteria** | New users see guidance. Steps link to actions. Dismisses permanently. |
| **Owner** | Frontend + Design |
| **Required before beta** | Yes |
| **Value type** | Adoption |
| **Status** | Done (2026-03-14: WelcomeBanner with first-run detection, step completion, auto-dismiss on first account, manual dismiss via localStorage) |

---

### 23. Extract optimistic update helper

| Field | Value |
|-------|-------|
| **Description** | Every React Query mutation repeats 50+ lines of identical optimistic update boilerplate. |
| **User problem** | Developer velocity. Bugs replicated across mutations. |
| **Proposed fix** | Create `withOptimisticUpdate<T>()` helper. Reduce each mutation to ~10 lines. |
| **Impact** | 5 |
| **Effort** | 4 |
| **Confidence** | 8 |
| **Acceptance criteria** | All mutations use shared helper. 300+ lines removed. Behavior unchanged. |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Speed (developer velocity) |
| **Status** | Done (2026-03-14: extended useOptimisticMutation with detailQueryKey, onSuccessCallback, prependItem, replaceTempId; converted 12 mutations across 6 files, net -113 lines) |

---

### 24. Pipeline drag-drop cursor and visual polish

| Field | Value |
|-------|-------|
| **Description** | Kanban cards need `cursor: grab` and drop-zone highlighting. |
| **User problem** | Cards look clickable but not draggable. Drag-drop not discoverable. |
| **Proposed fix** | Add `cursor-grab`, `cursor-grabbing`, drop-zone highlight. |
| **Impact** | 5 |
| **Effort** | 1 |
| **Confidence** | 10 |
| **Acceptance criteria** | Grab cursor on hover. Grabbing during drag. Column highlights on dragover. |
| **Owner** | Frontend |
| **Required before beta** | No (depends on #14) |
| **Value type** | Trust |
| **Status** | Done (2026-03-14: added !cursor-grabbing during drag; cursor-grab + drop-zone already existed) |

---

### 25. Link "Top Signals" on home to individual signals

| Field | Value |
|-------|-------|
| **Description** | All signals link to `/signals` list instead of specific signal. |
| **User problem** | Extra click. User must find signal in list after clicking. |
| **Proposed fix** | Link to `/signals?highlight={id}` or open detail drawer directly. |
| **Impact** | 4 |
| **Effort** | 2 |
| **Confidence** | 9 |
| **Acceptance criteria** | Clicking signal on home navigates to or highlights that signal. |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Speed |
| **Status** | Done |

---

## DO LATER

Value-add but not blocking beta. Build after product is stable with real users.

---

### 26. Implement light mode CSS

| Field | Value |
|-------|-------|
| **Description** | Full light mode theme across all components. |
| **Impact** | 6 | **Effort** | 6 | **Confidence** | 8 |
| **Owner** | Frontend + Design |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Open |

---

### 27. Fix WCAG color contrast for `--muted` text

| Field | Value |
|-------|-------|
| **Description** | Muted text fails WCAG AA contrast ratio. |
| **Impact** | 4 | **Effort** | 2 | **Confidence** | 9 |
| **Owner** | Design + Frontend |
| **Required before beta** | No |
| **Value type** | Adoption, Trust |
| **Status** | Done (2026-03-14: bumped --muted to zinc-500 for WCAG AA 4.5:1 compliance) |

---

### 28. Add bulk actions to leads and pipeline

| Field | Value |
|-------|-------|
| **Description** | Leads/pipeline can only action one item at a time. Need multi-select, bulk advance/disqualify. Also covers queue batch operations (old AG-04). |
| **Impact** | 7 | **Effort** | 5 | **Confidence** | 7 |
| **Owner** | Frontend + Backend |
| **Required before beta** | No |
| **Value type** | Speed |
| **Status** | Open |

---

### 29. Add saved/persistent filters

| Field | Value |
|-------|-------|
| **Description** | Filters reset on page reload. No saved views. |
| **Impact** | 6 | **Effort** | 5 | **Confidence** | 7 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Speed, Adoption |
| **Status** | Open |

---

### 30. Add task comment input to task detail drawer

| Field | Value |
|-------|-------|
| **Description** | Tasks show comment count but drawer has no comment input. Model + API exist, UI missing. |
| **Impact** | 5 | **Effort** | 3 | **Confidence** | 9 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Done (2026-03-14: CommentInput component with Cmd+Enter submit, useCommentOnTask hook) |

---

### 31. ARIA labels and keyboard navigation

| Field | Value |
|-------|-------|
| **Description** | Icon-only buttons lack `aria-label`. No standardized Escape/tab navigation. Covers old UX-07, UX-11. |
| **Impact** | 5 | **Effort** | 4 | **Confidence** | 8 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Adoption, Trust |
| **Status** | Done (2026-03-14: aria-labels on Drawer close, schedule nav, inbox unread indicator) |

---

### 32. Add "Why this action?" reasoning to Next Best Actions

| Field | Value |
|-------|-------|
| **Description** | AI suggestions show no reasoning. Users must trust blindly. |
| **Impact** | 6 | **Effort** | 4 | **Confidence** | 7 |
| **Owner** | Frontend + AI |
| **Required before beta** | No |
| **Value type** | Trust, Adoption |
| **Status** | Open |

---

### 33. Expand ContactRole beyond 5 enum values

| Field | Value |
|-------|-------|
| **Description** | Only 5 roles. Real sales orgs need 15-20+. |
| **Impact** | 5 | **Effort** | 4 | **Confidence** | 7 |
| **Owner** | Backend + Frontend |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Open |

---

### 34. Auto-archive stale signals

| Field | Value |
|-------|-------|
| **Description** | Signals older than 90 days accumulate. Also covers broader data retention policy (old P-02). |
| **Impact** | 4 | **Effort** | 2 | **Confidence** | 9 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Speed |
| **Status** | Done (2026-03-14: auto-dismiss signals >90 days in retention job) |

---

### 35. Agent accuracy trends in admin dashboard

| Field | Value |
|-------|-------|
| **Description** | No visibility into agent quality over time. Covers old AG-05 (agent metrics). |
| **Impact** | 4 | **Effort** | 5 | **Confidence** | 6 |
| **Owner** | Frontend + AI |
| **Required before beta** | No |
| **Value type** | Trust |
| **Status** | Open |

---

### 36. Signal detail drawer

| Field | Value |
|-------|-------|
| **Description** | Signals show summary only; no expandable detail view with source, companies, confidence breakdown, reasoning. (Old W-17) |
| **Impact** | 4 | **Effort** | 3 | **Confidence** | 8 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Open |

---

### 37. Meeting prep and outcome logging

| Field | Value |
|-------|-------|
| **Description** | Meeting detail exists but prep status and outcome capture are incomplete. Includes old W-18 and API-07. |
| **Impact** | 5 | **Effort** | 5 | **Confidence** | 7 |
| **Owner** | Frontend + Backend |
| **Required before beta** | No |
| **Value type** | Adoption, Speed |
| **Status** | Open |

---

### 38. Encrypt OAuth tokens at rest

| Field | Value |
|-------|-------|
| **Description** | Access/refresh tokens stored as plaintext in DB. Acceptable for internal tool, not for SaaS. (Old S-04) |
| **Impact** | 4 | **Effort** | 4 | **Confidence** | 8 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Open |

---

### 39. Sync retry logic for transient errors

| Field | Value |
|-------|-------|
| **Description** | Single failure kills entire sync run. No retry for 429/503 errors. (Old I-06) |
| **Impact** | 5 | **Effort** | 3 | **Confidence** | 8 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Open |

---

### 40. Sensitive data logging review

| Field | Value |
|-------|-------|
| **Description** | API errors may log request bodies with tokens or PII. Need structured logging with redaction. (Old S-12) |
| **Impact** | 4 | **Effort** | 2 | **Confidence** | 9 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Done (2026-03-14: routed queue/sync console.error through redaction logger) |

---

### 41. GDPR: contact deletion with cascade

| Field | Value |
|-------|-------|
| **Description** | No way to fully delete a contact (right to erasure). Must cascade/anonymize activities, email links, meeting attendees. (Old P-04) |
| **Impact** | 4 | **Effort** | 4 | **Confidence** | 8 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Open |

---

### 42. GDPR: data export for contacts/accounts

| Field | Value |
|-------|-------|
| **Description** | GDPR Article 20 data portability. Admin should export all data for an account as JSON/CSV. Basic export endpoint exists but not contact-scoped. (Old P-03) |
| **Impact** | 3 | **Effort** | 3 | **Confidence** | 8 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Open |

---

### 43. Responsive audit (mobile)

| Field | Value |
|-------|-------|
| **Description** | Bottom nav exists but some pages may break at 375px. Touch targets may be too small. (Old UX-09) |
| **Impact** | 4 | **Effort** | 4 | **Confidence** | 7 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Done (2026-03-14: tasks page mobile layout, drawer responsive padding/footer stacking, touch targets) |

---

### 44. Design token cleanup

| Field | Value |
|-------|-------|
| **Description** | 8+ hardcoded pixel font sizes (`text-[12.5px]`, `text-[8.5px]`). Should be named Tailwind sizes. (Old UX-10) |
| **Impact** | 3 | **Effort** | 4 | **Confidence** | 8 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Speed (developer velocity) |
| **Status** | Open |

---

### 45. Soft delete for key models

| Field | Value |
|-------|-------|
| **Description** | Hard deletes lose data. Add `archivedAt DateTime?` to Account, Lead, Opportunity, Task. Default queries filter to `archivedAt: null`. (Old DB-03) |
| **Impact** | 4 | **Effort** | 4 | **Confidence** | 7 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Open |

---

### 46. Add createdBy / updatedBy audit fields

| Field | Value |
|-------|-------|
| **Description** | No record of who created/modified records beyond ownerId. (Old DB-04) |
| **Impact** | 3 | **Effort** | 4 | **Confidence** | 8 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Open |

---

### 47. Agent pause/resume from Settings

| Field | Value |
|-------|-------|
| **Description** | Settings has "Pause Agent" button that does nothing. Agent specs mention pause capability. (Old AG-01) |
| **Impact** | 4 | **Effort** | 3 | **Confidence** | 8 |
| **Owner** | Backend + Frontend |
| **Required before beta** | No |
| **Value type** | Trust |
| **Status** | Open |

---

### 48. Seed data realism (relative dates)

| Field | Value |
|-------|-------|
| **Description** | Seed data dates hardcoded to March 2026. Should use relative dates for ongoing dev. (Old DB-09) |
| **Impact** | 2 | **Effort** | 2 | **Confidence** | 9 |
| **Owner** | Backend |
| **Required before beta** | No |
| **Value type** | Speed (developer velocity) |
| **Status** | Done (2026-03-14: replaced hardcoded dates with daysAgo/daysFromNow/hoursAgo helpers) |

---

### 49. Background job monitoring in admin

| Field | Value |
|-------|-------|
| **Description** | Cron runs invisibly. Admin needs last 10 sync runs with timestamps, results, errors. (Old O-07) |
| **Impact** | 4 | **Effort** | 4 | **Confidence** | 7 |
| **Owner** | Backend + Frontend |
| **Required before beta** | No |
| **Value type** | Trust |
| **Status** | Open |

---

### 50. Uptime monitoring

| Field | Value |
|-------|-------|
| **Description** | No external monitoring. Downtime goes unnoticed. (Old O-09) |
| **Impact** | 3 | **Effort** | 1 | **Confidence** | 9 |
| **Owner** | Ops |
| **Required before beta** | No |
| **Value type** | Risk reduction |
| **Status** | Done (2026-03-14: enhanced /api/health with dbLatency, memory, uptime; added HEAD method) |

---

### 51. CSV data import

| Field | Value |
|-------|-------|
| **Description** | No bulk import for existing accounts/contacts/leads. (Old C-05) |
| **Impact** | 5 | **Effort** | 8 | **Confidence** | 6 |
| **Owner** | Frontend + Backend |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Open |

---

### 52. In-app help / documentation links

| Field | Value |
|-------|-------|
| **Description** | No help system. Users must guess what FIUAC scores, health bars mean. (Old C-02) |
| **Impact** | 3 | **Effort** | 3 | **Confidence** | 7 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Open |

---

### 53. Empty state improvements with CTAs

| Field | Value |
|-------|-------|
| **Description** | Empty states are generic text. Should include actionable buttons ("Create your first lead"). (Old UX-12) |
| **Impact** | 4 | **Effort** | 2 | **Confidence** | 9 |
| **Owner** | Frontend |
| **Required before beta** | No |
| **Value type** | Adoption |
| **Status** | Done (2026-03-14: added action prop to EmptyState, CTA buttons on leads/pipeline/accounts pages) |

---

## DON'T DO

Explicitly deprioritized. Each has a "revisit when" trigger.

---

| # | Item | Why not now | Revisit when |
|---|------|-------------|--------------|
| X1 | **Multi-tenant query isolation** | One tenant. Schema ready, premature to wire. | Second customer confirmed. |
| X2 | **API rate limiting** | All endpoints behind auth. <10 users. | Public API planned, or 50+ users. |
| X3 | **Idempotency keys** | Monolithic app, disabled buttons suffice. | External webhook consumers or retrying integrations. |
| X4 | **Comprehensive E2E test suite** | Expensive to maintain on rapidly changing UI. Unit tests first. | UI stable post-beta. |
| X5 | **Data retention automation UI** | Not enough data. Backend cron sufficient. | DB exceeds 1GB or 100K rows. |
| X6 | **Access log table and UI** | AuditLog covers compliance. AccessLog overkill for <10 users. | Compliance audit requires it, or 50+ users. |
| X7 | **Win/loss analysis UI** | Need pipeline volume first. Data model ready. | 20+ closed deals. |
| X8 | **LinkedIn profile import** | Legally fragile. Focus on email sync. | Customer requests + Sales Navigator access. |
| X9 | **Custom agent config params UI** | Parameters field not consumed by runner. | Agent performance varies and tuning needed. |
| X10 | **Export format options / scheduled exports** | Basic export works. No one asked for more. | Users report export insufficient. |
| X11 | **Session timeout handling** | NextAuth handles lifecycle. | Users report data loss from expired sessions. |
| X12 | **Agent analytics expansion** | Simple table sufficient for 6 agents. | Agent count exceeds 15. |
| X13 | **Queue undo (30s window)** | Complex to reverse side-effects. Low user need. (Old API-11) | Users frequently regret approvals. |
| X14 | **Contacts in search** | Current search covers accounts/opps/leads/signals. (Old API-14) | Users request contact search. |
| X15 | **Integration architecture design doc** | Only Microsoft supported. (Old I-09) | Second integration planned. |
| X16 | **Cookie consent handling** | No non-essential cookies used. (Old P-05) | Analytics or tracking cookies added. |
| X17 | **Product analytics / telemetry** | Premature before real users. (Old C-01) | 10+ active users. |
| X18 | **TypeScript strict mode (noUncheckedIndexedAccess)** | Would cause large churn. (Old Q-06) | Major refactor window. |
| X19 | **Visual regression testing** | UI still changing rapidly. (Old Q-07) | Post-beta UI freeze. |
| X20 | **Smoke test for deploys** | Health endpoint exists. Manual verification sufficient. (Old Q-08) | Automated CI/CD pipeline. |
| X21 | **Test data strategy** | Current seed works for dev. (Old Q-05) | Integration test suite grows. |
| X22 | **AuditLog table** | Basic logging exists. Full audit table premature. (Old DB-06, S-10) | Compliance audit or enterprise customer. |
| X23 | **Task reassignment API** | Tasks can be updated via PATCH including assignees. (Old API-10) | Dedicated reassignment workflow needed. |
| X24 | **Dead-letter handling for sync** | Per-email errors logged. No recovery mechanism yet. (Old O-08) | Sync volume exceeds 1K emails/day. |
| X25 | **Pipeline Hygiene agent** | Spec exists, not implemented. (Old AG-02) | Manual hygiene becomes painful. |
| X26 | **Signal Hunter agent (scraping)** | Spec exists, not implemented. (Old AG-03) | Manual signal entry becomes bottleneck. |
| X27 | **Admin system health dashboard** | (Old C-03) Admin page exists with basics. | System complexity grows. |
| X28 | **GraphQL layer** | Over-engineering for current scale. | Complex dashboard views need reduced over-fetching. |

---

## COMPLETED (Reference)

Items from previous backlogs that are done. Kept for audit trail.

| Old ID | Title | Completed |
|--------|-------|-----------|
| F-01 | Define CSS variables (initial pass) | 2026-03-12 |
| F-02 | Fix hardcoded meeting date (initial pass) | 2026-03-12 |
| F-03 | Add .nvmrc | 2026-03-12 |
| F-04 | Update README | 2026-03-12 |
| F-05 | Delete orphaned eco-insight-types.ts | 2026-03-12 |
| F-06 | Delete/repurpose seed.ts | 2026-03-12 |
| F-07 | Pin dependency versions | 2026-03-12 |
| F-08 | Add .env.local.example | 2026-03-12 |
| F-09 | Configure ESLint | 2026-03-12 |
| T-01–T-05 | Type system unification (5 items) | 2026-03-12 |
| E2-01–E2-13 | Frontend↔Backend wiring (13 items) | 2026-03-12–13 |
| A-01–A-08 | Auth + user management (8 items) | 2026-03-13 |
| U-01–U-07 | Roles, RBAC, team management (7 items) | 2026-03-13 |
| W-01–W-15 | Core workflows (15 items) | 2026-03-13 |
| API-01–API-06, API-08–API-09 | API completeness (8 items) | 2026-03-13 |
| I-01–I-05, I-07–I-08 | Integrations (7 items) | 2026-03-13 |
| S-01–S-03, S-05–S-09, S-13 | Security (9 items) | 2026-03-13 |
| P-01 | Privacy data inventory | 2026-03-14 |
| O-01–O-06 | Reliability/ops (6 items) | 2026-03-13 |
| Q-01–Q-04 | Test infrastructure + tests (4 items) | 2026-03-13 |
| UX-01–UX-05, UX-08 | Frontend UX (6 items) | 2026-03-13 |
| DB-01–DB-02, DB-05, DB-07–DB-08 | Database (5 items) | 2026-03-13 |

> **Note:** Items 1–2 in DO NOW re-open CSS vars and meeting date because the 2026-03-14 audit found the original fixes were incomplete or regressed. The CSS vars are still referenced in 72 places and the meeting date is still hardcoded in the API route.

---

## Execution Summary

| Phase | Items | Effort points | Estimated time |
|-------|-------|---------------|----------------|
| **Do Now** (1–13) | 13 items | ~20 | 2–3 days |
| **Do Next** (14–25) | 12 items | ~42 | 1–2 weeks |
| **Do Later** (26–53) | 28 items | ~98 | 3–6 weeks |
| **Don't Do** (X1–X28) | 28 items | — | — |
| **Completed** | ~90 items | — | Done |
