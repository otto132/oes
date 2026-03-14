# Eco-Insight Revenue OS — Production Readiness Audit

> Audited: 2026-03-12
> Auditor: Principal Engineering Review
> Scope: Full codebase, docs, schema, runtime behavior

---

## 1. EXECUTIVE SUMMARY

**The 20 most important truths about this repo:**

1. **Split-brain architecture**: The frontend reads 100% from Zustand mock data (`data.ts`). The backend has a complete Prisma/Postgres API layer. They are not connected. The app you see in the browser is a static demo.
2. **No user sees real data**: Every page imports `useStore()` which loads hardcoded arrays from `src/lib/data.ts`. No page makes any API call.
3. **API routes exist and are well-built**: 13 route handlers implement real Prisma queries with side-effects, dedup checks, and reasonable error handling — but nothing calls them.
4. **Three layers of dead code**: `api-client.ts`, `queries.ts`, and `useFetch.ts` were written as the bridge between frontend and backend. None are imported anywhere.
5. **Critical type divergence**: `src/lib/types.ts` uses abbreviated field names (`amt`, `ini`, `ac`, `f/i/u/a/c`) and spaced enums (`'Solution Fit'`). Prisma schema uses full names (`amount`, `initials`, `color`) and PascalCase enums (`SolutionFit`). These are incompatible.
6. **Two orphaned type files**: Root `eco-insight-types.ts` is a third type definition that matches neither `src/lib/types.ts` nor Prisma.
7. **CSS variables are undefined**: `--card-hover` (49 usages) and `--text` (23 usages) are referenced across 13 files but never defined in `globals.css`. They silently resolve to nothing.
8. **Light mode is completely unimplemented**: The toggle exists, the class swaps, but there are zero light-mode CSS variable overrides or Tailwind `dark:` prefixes. The entire app is hardcoded to dark colors.
9. **Zero authentication**: No auth middleware, no session, no JWT. All API routes default `userId` to `'u1'`.
10. **Hardcoded user identity**: `users[0]` and `'u1'` appear throughout pages and API routes. No concept of "who is logged in."
11. **Hardcoded dates**: Home page filters meetings by `'2026-03-11'` — a date that will never match again after that day.
12. **Queue approvals have real server-side side-effects** (lead creation, account update, task creation, activity logging) — but are never triggered because the UI calls `store.approveQueueItem()` which just flips a status string in memory.
13. **Mutations are cosmetic**: Approve/reject/dismiss/complete/archive all update Zustand state but never persist. Refresh the page and everything resets.
14. **The Drawer component works** but every "Save" / "Pause Agent" / "Configure" button inside it is a no-op.
15. **Pipeline view is a flat list**, not a kanban board. Stage movement buttons exist on the detail page but have no click handlers.
16. **Microsoft Graph integration is production-grade**: OAuth flow, token refresh, email sync with domain matching, calendar sync with attendee matching, and dedup — all properly implemented.
17. **The Prisma schema is well-designed**: 20+ models with correct relations, cascade deletes, composite indexes, and JSON payloads for queue items.
18. **Seed data is comprehensive** and matches the schema. One bug fixed (QueuePriority `Medium` → `Normal`).
19. **No tests exist**: Zero unit, integration, or e2e tests.
20. **README is outdated**: States "replace with Prisma when ready" — Prisma is fully implemented.

**Single biggest blocker**: The frontend-backend disconnect. Until pages call API routes instead of reading mock data, nothing is real. This is a P0 architectural fix that touches every page.

---

## 2. CURRENT STATE ARCHITECTURE

### How the app actually works today

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER                                                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Every page: const { ... } = useStore()               │  │
│  │  Source: src/lib/data.ts (hardcoded arrays)            │  │
│  │  Mutations: in-memory only, lost on refresh            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NEVER CALLED:                                        │  │
│  │  - api-client.ts (fetch wrapper)                      │  │
│  │  - useFetch.ts (React hook)                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

             ╳  NO CONNECTION  ╳

┌─────────────────────────────────────────────────────────────┐
│  SERVER (Next.js API Routes)                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  13 route handlers → db (Prisma) → Postgres           │  │
│  │  Real queries, real side-effects, real dedup           │  │
│  │  But nobody calls them                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  NEVER IMPORTED:                                      │  │
│  │  - queries.ts (server-side helpers)                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Sources of truth (current)

| Data | Source | Persistent? |
|------|--------|-------------|
| All UI data | `useStore()` → `data.ts` | No (in-memory) |
| API responses | Prisma → Postgres | Yes (but unused) |
| Theme preference | Zustand `theme` field | No (resets to `'dark'`) |
| Drawer state | Zustand | No |
| Microsoft tokens | `IntegrationToken` table | Yes |

### What the user actually experiences

- A beautiful dark-mode dashboard with realistic-looking data
- Badges, scores, health bars, and avatars render correctly
- Approve/reject/dismiss/complete appear to work (state updates in memory)
- Refresh → everything resets to initial state
- Light mode toggle → nothing visible happens
- "New" button → nothing happens
- Settings "Save" / "Configure" → drawer opens but doesn't persist
- Search bar → not wired up
- Stage movement buttons on pipeline detail → no click handlers

---

## 3. GAP ANALYSIS

| Area | Current State | Risk | Sev | What Must Change | Files Involved |
|------|--------------|------|-----|-----------------|----------------|
| **Data flow** | Frontend reads mock data; API routes exist but unused | App is a static demo | **P0** | Wire pages to API routes via api-client + useFetch | All pages, api-client.ts, useFetch.ts |
| **Type system** | 3 divergent type definitions (types.ts, Prisma, eco-insight-types.ts) | Runtime crashes when connecting FE↔BE | **P0** | Consolidate to Prisma-generated types + thin UI adapters | types.ts, data.ts, all pages |
| **CSS vars undefined** | `--card-hover` (49 uses), `--text` (23 uses) never defined | Invisible hover states, missing text colors | **P0** | Define in globals.css | globals.css |
| **Auth** | Zero authentication on any route | Anyone can read/write all data | **P0** | Add session-based auth (NextAuth or similar) | New middleware, all API routes |
| **User identity** | Hardcoded `'u1'` / `users[0]` everywhere | No multi-user support | **P1** | Derive userId from session | All API routes, task/queue pages |
| **Light mode** | Toggle exists, no styles | Feature appears broken | **P1** | Add CSS var overrides for light theme | globals.css, tailwind.config.ts |
| **Enum mapping** | FE uses `'Solution Fit'`, DB uses `SolutionFit` | Queries return wrong values to UI | **P0** | Add display adapter or align enums | types.ts, all pages using stages |
| **Dead code** | queries.ts, api-client.ts, useFetch.ts, seed.ts unused | Confusion, maintenance debt | **P2** | Either wire them up or delete | Listed files |
| **Hardcoded dates** | Home filters meetings by `'2026-03-11'` | Home never shows meetings | **P1** | Use `new Date()` for today | page.tsx:19 |
| **Pipeline not kanban** | Flat vertical list, no drag-and-drop | Missing core CRM UX | **P1** | Implement stage columns | pipeline/page.tsx |
| **Stage movement** | Buttons exist, no click handlers | Dead UI | **P1** | Wire to API `move` endpoint | pipeline/[id]/page.tsx |
| **Mutations not persisted** | Zustand updates lost on refresh | Users lose all work | **P0** | Call API routes for all mutations | queue, signals, inbox, tasks pages |
| **No loading/error states for API** | Pages don't fetch, so no loading UX | Blank screens when wired to API | **P1** | Add loading skeletons, error boundaries | All pages |
| **No pagination** | API routes return all records | Performance degrades with real data | **P2** | Add cursor-based pagination per contract | All API routes, list pages |
| **No validation** | API routes do minimal input checking | Bad data enters DB | **P2** | Add Zod schemas for request bodies | All POST routes |
| **Settings page static** | Agent configs hardcoded in page component | Config changes impossible | **P1** | Store agent configs in DB or config file | settings/page.tsx, new API route |
| **README outdated** | Says "replace with Prisma when ready" | Misleads developers | **P2** | Update to reflect current state | README.md |
| **No tests** | Zero test files | No regression safety | **P2** | Add critical-path tests | New test files |
| **Cron secret** | Only protection on /api/sync | Other routes wide open | **P1** | Auth middleware for all routes | middleware.ts |
| **Token storage** | OAuth tokens in plain DB columns | Acceptable for internal tool, not for SaaS | **P2** | Encrypt at rest if going multi-tenant | integrations, schema |
| **Email dedup** | subject + from + receivedAt composite | Could miss duplicates with identical timestamps | **P2** | Add Graph message ID to dedup | email-sync.ts, schema |

---

## 4. CONTRACT VS IMPLEMENTATION

### Implemented

| Endpoint | Contract | Implementation | Match? |
|----------|----------|---------------|--------|
| `GET /home/summary` | `/api/v1/home/summary` | `/api/home` | Partial — no `/v1` prefix, response shape differs |
| `GET /queue` | `/api/v1/queue` | `/api/queue` | Yes (no versioning) |
| `POST /queue/:id/approve` | Individual endpoint | `POST /api/queue` with `action: 'approve'` | Different routing pattern |
| `POST /queue/:id/reject` | Individual endpoint | `POST /api/queue` with `action: 'reject'` | Different routing pattern |
| `GET /signals` | `/api/v1/signals` | `/api/signals` | Yes |
| `POST /signals/:id/dismiss` | Individual endpoint | `POST /api/signals` with `action: 'dismiss'` | Different routing pattern |
| `POST /signals/:id/convert` | Individual endpoint | `POST /api/signals` with `action: 'convert'` | Different routing pattern |
| `GET /leads` | `/api/v1/leads` | `/api/leads` | Yes |
| `POST /leads` | `/api/v1/leads` | `POST /api/leads` with `action: 'create'` | Different routing pattern |
| `POST /leads/:id/advance` | Individual endpoint | `POST /api/leads` with `action: 'advance'` | Different routing |
| `POST /leads/:id/convert` | Individual endpoint | `POST /api/leads` with `action: 'convert'` | Different routing |
| `GET /accounts` | `/api/v1/accounts` | `/api/accounts` | Yes |
| `GET /accounts/:id` | `/api/v1/accounts/:id` | `/api/accounts?id=...` | Query param instead of path |
| `POST /accounts` | `/api/v1/accounts` | `POST /api/accounts` | Yes |
| `GET /opportunities` | `/api/v1/opportunities` | `/api/opportunities` | Yes |
| `GET /opportunities/:id` | `/api/v1/opportunities/:id` | `/api/opportunities?id=...` | Query param instead of path |
| `POST /opportunities/:id/move` | Individual endpoint | `POST /api/opportunities` with `action: 'move'` | Different routing |
| `GET /inbox` | `/api/v1/inbox` | `/api/inbox` | Yes |
| `GET /tasks` | `/api/v1/tasks` | `/api/tasks` | Yes |
| `GET /activities` | `/api/v1/activities` | `/api/activities` | Yes |
| `GET /search` | `/api/v1/search` | `/api/search` | Yes |

### Missing (not implemented at all)

| Endpoint | Notes |
|----------|-------|
| `GET /signals/:id` | Signal detail |
| `GET /leads/:id` | Lead detail |
| `PATCH /accounts/:id` | Account update |
| `POST /accounts/:id/contacts` | Add contact |
| `GET /tasks/:id` | Task detail |
| `PATCH /tasks/:id/reassign` | Task reassignment |
| `GET /meetings` | Meeting list |
| `GET /meetings/:id/prep` | Meeting prep (AI) |
| `POST /meetings/:id/mark-ready` | Mark meeting ready |
| `POST /meetings/:id/log-outcome` | Log meeting outcome |
| `POST /queue/:id/undo` | Undo approval/rejection |
| `GET /settings/agents` | Agent config list |
| `PATCH /settings/agents/:name` | Update agent config |
| `GET /settings/team` | Team list |
| `GET /settings/integrations` | Integration status |
| `POST /outreach/draft` | AI outreach generation |
| `POST /outreach/send-to-queue` | Send draft to queue |
| `GET /inbox/:id` | Email detail |
| All webhook events | Future feature |
| Rate limiting | Not implemented |
| Cursor-based pagination | Not implemented |
| `/api/v1` versioning | Not implemented |

### Implemented differently than spec

- **Routing pattern**: Contract uses RESTful sub-resources (`/queue/:id/approve`). Implementation uses a single route with `action` field in POST body. This is simpler but deviates from contract.
- **Response envelope**: Contract specifies `{ "data": ..., "meta": { "cursor": ..., "hasMore": ... } }`. Implementation uses `{ "data": ..., "meta": { ... } }` without cursor pagination.
- **Error format**: Contract specifies `{ "error": { "code": "NOT_FOUND", "message": "..." } }`. Implementation uses `{ "error": "Not found" }`.
- **Monetary values**: Contract specifies euro cents (integers). Implementation uses raw numbers (likely euros, not cents).

---

## 5. PRODUCTION READINESS CHECKLIST

### Must have before first serious internal use

- [ ] Wire frontend pages to API routes (replace `useStore()` data reads with `useFetch` / `api-client`)
- [ ] Resolve type divergence between types.ts and Prisma (pick one source of truth)
- [ ] Define missing CSS variables (`--card-hover`, `--text`)
- [ ] Add basic auth (even a simple shared session for internal team)
- [ ] Make mutations persistent (approve, reject, dismiss, complete, archive → API calls)
- [ ] Fix hardcoded meeting date filter on Home page
- [ ] Require `DATABASE_URL` in `.env` with clear setup instructions
- [ ] Ensure `npm install && npm run dev` works on a fresh machine (nvm sourcing issue)
- [ ] Add loading states to all pages for API fetch latency

### Must have before broader production

- [ ] Full light/dark theme implementation
- [ ] Input validation (Zod) on all POST routes
- [ ] Error boundaries and toast notifications
- [ ] Pagination on list endpoints
- [ ] Pipeline kanban view with drag-and-drop
- [ ] Stage movement wired on opportunity detail
- [ ] Create/edit forms via Drawer for leads, accounts, tasks, opportunities
- [ ] Settings page wired to real agent/integration state
- [ ] Search/command palette (`Cmd+K`) functional
- [ ] User assignment from session instead of hardcoded `'u1'`
- [ ] E2e tests for critical flows (signal→lead, lead→account, queue approval)

### Nice to have later

- [ ] API versioning (`/api/v1/`)
- [ ] Cursor-based pagination matching contract
- [ ] Webhook events
- [ ] Rate limiting
- [ ] Outreach drafting endpoint
- [ ] Meeting prep AI endpoint
- [ ] Queue undo (within 30s)
- [ ] Token encryption at rest
- [ ] Audit log table
- [ ] Real-time updates (SSE or polling)

---

## 6. RECOMMENDED TARGET ARCHITECTURE

### Server state (Prisma/Postgres — source of truth)

All domain data: signals, leads, accounts, opportunities, contacts, tasks, goals, activities, queue items, emails, meetings, users, integration tokens, agent configs.

### Client UI state (Zustand — ephemeral)

- `theme: 'dark' | 'light'` (persisted to localStorage)
- `drawerOpen` + `drawerContent`
- Filter/sort selections per page
- Command palette open state
- Optimistic mutation cache (pending approvals, etc.)
- Currently selected tab/view per page

### Data fetching pattern

```
Page component
  → useFetch('/api/signals') or React Query / SWR
    → api-client.ts (type-safe fetch wrapper, already written)
      → /api/signals/route.ts
        → db.signal.findMany()
          → Postgres
```

Mutations follow the same path in reverse, with optimistic updates in Zustand for instant UI feedback, rolled back on server error.

### Auth

For internal team use: **NextAuth.js with Microsoft Entra ID provider** (team already has Microsoft 365). This gives:
- SSO with existing Outlook accounts
- Session-based auth with `getServerSession()` in API routes
- `userId` derived from session, not hardcoded

### Integrations

Current Microsoft Graph integration is solid. Keep as-is with:
- Per-user token storage (currently single-user)
- Cron-triggered sync via Vercel cron (already configured)
- Add `lastSyncAt` visibility to Settings page

### Jobs/Sync

Keep current Vercel cron approach for email/calendar sync. Add:
- Sync status visible in Settings
- Manual "Sync Now" button
- Error reporting to activity log

### Agents

Agents should be **deterministic rule engines** (not LLM-based) for v1:
- Signal Hunter: RSS/API scraping → queue items
- Lead Qualifier: FIUAC scoring rules → queue items
- Inbox Classifier: Rule-based (already implemented in email-sync.ts)
- Pipeline Hygiene: Cron-based staleness checks → queue items

All agent output routes through the Approval Queue for human review. No autonomous actions.

---

## 7. PHASED ROADMAP

### Phase 0: Repo Cleanup & Reproducibility (1-2 days)

**Objective**: Anyone can clone, install, and run the app.

**Outcomes**:
- Define missing CSS variables (`--card-hover`, `--text`, `--border-strong`)
- Fix hardcoded date in Home page
- Update README with accurate setup instructions
- Add `.nvmrc` for Node version pinning
- Ensure `npm install && npm run dev` works cleanly
- Delete or mark dead code: `src/lib/seed.ts`, root `eco-insight-types.ts`
- Update README to reflect true architecture state

**Dependencies**: None
**Effort**: 1-2 days
**Risk**: Low

### Phase 1: Unify Data Flow (3-5 days)

**Objective**: Frontend reads from database via API routes. Mutations persist.

**Outcomes**:
- Wire `useFetch.ts` hook to all list pages (or adopt SWR/React Query)
- Wire `api-client.ts` to all mutation flows
- Add adapter layer to map Prisma enum values (`SolutionFit` → `Solution Fit`) for UI display
- Add loading skeletons to all pages
- Add error toasts for failed mutations
- Remove `data.ts` imports from `store.ts` (keep store for UI-only state)
- Verify all 10 pages render with DB data via seed

**Dependencies**: Phase 0, working DATABASE_URL
**Effort**: 3-5 days
**Risk**: Medium — type mismatches will surface; plan for adapter bugs

### Phase 2: Auth & User Ownership (2-3 days)

**Objective**: Users log in; all actions attributed to real user.

**Outcomes**:
- Add NextAuth with Microsoft provider (reuse existing Entra app registration)
- Add auth middleware to all API routes
- Replace hardcoded `'u1'` with session user ID
- Add login page / redirect
- Session-aware sidebar (show logged-in user)

**Dependencies**: Phase 1
**Effort**: 2-3 days
**Risk**: Low — NextAuth is well-documented for Next.js 15

### Phase 3: Complete Core CRUD & Workflows (5-7 days)

**Objective**: All critical user workflows are end-to-end functional.

**Outcomes**:
- Create/edit forms via Drawer: leads, accounts, tasks, opportunities, contacts
- Pipeline kanban with stage columns
- Stage movement on opportunity detail (wire to API)
- Task lifecycle: create → assign → review → complete
- Lead lifecycle: create → research → qualify → convert
- Signal → Lead conversion flow
- Queue approval with visible side-effects
- Functional search / command palette (Cmd+K)
- Implement missing API endpoints: account update, contact create, task detail, meetings list

**Dependencies**: Phase 2
**Effort**: 5-7 days
**Risk**: Medium — many screens to update

### Phase 4: Integrations & Jobs (3-4 days)

**Objective**: Outlook sync works end-to-end; sync status visible.

**Outcomes**:
- Per-user Microsoft token storage
- Settings page shows real integration status + last sync time
- "Sync Now" manual trigger button
- Agent config stored in DB (not hardcoded in page)
- Cron job health monitoring
- Error surfacing for failed syncs

**Dependencies**: Phase 2 (auth needed for per-user tokens)
**Effort**: 3-4 days
**Risk**: Medium — OAuth debugging can be unpredictable

### Phase 5: Quality, Security & Observability (3-5 days)

**Objective**: App is reliable for daily internal use.

**Outcomes**:
- Light/dark theme fully implemented
- Zod validation on all POST routes
- Error boundaries on all pages
- E2e tests for 5 critical flows
- Console error cleanup
- API response envelope standardized
- Pagination on list endpoints
- Performance: React.memo on heavy lists, virtualization if needed
- Logging: structured server logs for API errors
- Monitoring: Vercel analytics or simple health endpoint

**Dependencies**: Phases 1-4
**Effort**: 3-5 days
**Risk**: Low

---

## 8. BACKLOG

| ID | Title | Why It Matters | Pri | Deps | Acceptance Criteria | Files |
|----|-------|---------------|-----|------|-------------------|-------|
| B-01 | Define missing CSS variables | 72 style references resolve to nothing | P0 | — | `--card-hover`, `--text` defined; hover states visible | `globals.css` |
| B-02 | Wire Home page to API | Home shows stale mock data | P0 | DB | Home calls `/api/home`, shows live stats | `page.tsx`, `api-client.ts` |
| B-03 | Wire Queue page to API | Approvals don't persist | P0 | DB | Approve/reject persists, refresh retains state | `queue/page.tsx` |
| B-04 | Wire all list pages to API | All data is mock | P0 | DB | Signals, leads, accounts, pipeline, inbox, tasks fetch from API | All page files |
| B-05 | Resolve type divergence | FE↔BE incompatible | P0 | — | Single type source; adapter maps Prisma→UI | `types.ts`, pages |
| B-06 | Add loading skeletons | Pages blank during fetch | P1 | B-04 | Shimmer placeholders on all list pages | All pages |
| B-07 | Fix hardcoded Home meeting date | Meetings never show | P1 | — | Use today's date dynamically | `page.tsx:19` |
| B-08 | Add basic auth | No access control | P0 | — | Login required; session-based userId | New middleware, auth files |
| B-09 | Implement light theme | Toggle broken | P1 | B-01 | Both themes render correctly | `globals.css`, `tailwind.config.ts` |
| B-10 | Pipeline kanban view | Core CRM UX missing | P1 | B-04 | Stage columns with deal cards | `pipeline/page.tsx` |
| B-11 | Wire stage movement buttons | Dead UI on opp detail | P1 | B-04 | Stage advance calls API, updates UI | `pipeline/[id]/page.tsx` |
| B-12 | Create/edit Drawer forms | Can't create new records | P1 | B-04 | Drawer forms for leads, tasks, accounts | Pages + new form components |
| B-13 | Command palette (Cmd+K) | Search not functional | P1 | B-04 | Opens palette, searches API, navigates | New component, `/api/search` |
| B-14 | Settings → real state | All config is hardcoded | P1 | B-08 | Agent/integration status from DB | `settings/page.tsx`, new API |
| B-15 | Error toasts | No feedback on failures | P1 | B-04 | Toast on mutation error | New toast component |
| B-16 | Input validation (Zod) | Bad data can enter DB | P2 | — | All POST routes validated | All API routes |
| B-17 | Pagination | Lists don't scale | P2 | B-04 | Cursor-based pagination on accounts, signals, tasks | API routes, pages |
| B-18 | E2e tests | No regression safety | P2 | B-04 | 5 critical path tests pass | New test files |
| B-19 | Update README | Misleads new devs | P2 | — | Reflects true architecture | `README.md` |
| B-20 | Delete dead code | Confusion/maintenance | P2 | B-04 | Remove unused files or wire them up | `seed.ts`, `eco-insight-types.ts` |

---

## 9. FIRST IMPLEMENTATION SLICE

### Recommended: Phase 0 + wire the Queue page end-to-end

**Why this slice:**

The Approval Queue is the single most architecturally interesting flow in the app. It has:
- Read (list pending items)
- Mutation (approve/reject)
- Side-effects (lead creation, account update, task creation)
- State transitions (pending → approved/rejected)
- Already-complete API implementation

Wiring Queue proves the full data path works: `Page → api-client → API route → Prisma → Postgres → response → UI update`. Once this works, every other page follows the same pattern.

**Exact steps:**

1. Define `--card-hover` and `--text` in `globals.css` (unblocks all pages)
2. Fix the hardcoded date on Home (`'2026-03-11'` → dynamic)
3. Create an adapter module (`src/lib/adapters.ts`) that maps Prisma enum values to display strings
4. Update `useFetch.ts` to handle loading/error states properly
5. Update `queue/page.tsx`:
   - Replace `useStore()` data reads with `useFetch('/api/queue')`
   - Replace `approveQueueItem()` / `rejectQueueItem()` with `api.queue.approve()` / `api.queue.reject()`
   - Add loading skeleton while fetching
   - Add error toast on mutation failure
   - Verify approve side-effects persist (check DB)
6. Seed the database with `npx prisma db seed`
7. Verify: approve a queue item, refresh, confirm it stays approved

**Effort**: 1-2 days
**Risk**: Low — API route already works; this is wiring + adapters

---

## 10. REPO CLEANUP RECOMMENDATIONS

### Should not be committed

- No secrets found (good)
- `.env` is properly gitignored
- `node_modules/` is properly gitignored

### Environment-specific issues

- **No `.nvmrc`**: Node version not pinned. Fresh machines may use wrong version.
- **`postinstall` runs `prisma generate`**: Requires Prisma schema to be valid. Will fail if Prisma CLI version mismatches.
- **nvm not auto-sourced**: `npm` command not found without `source ~/.nvm/nvm.sh` first. This affects CI and fresh terminals.

### Build reproducibility

- **`npm install` works** (after nvm is sourced)
- **`npm run build` passes** (after our 4 type fixes)
- **`npm run dev` works** but all API routes 500 without `DATABASE_URL`
- **Pages render** because they use mock data, not the DB

### Files to clean up

| File | Action | Reason |
|------|--------|--------|
| `eco-insight-types.ts` (root) | Delete or archive | Third orphaned type file, matches nothing |
| `src/lib/seed.ts` | Delete | Unused re-export wrapper; `data.ts` is used directly |
| `src/lib/queries.ts` | Decide: wire up or delete | 17 functions, zero imports |
| `README.md` | Update | "Replace with Prisma when ready" is wrong |

### Recommended additions

| File | Purpose |
|------|---------|
| `.nvmrc` | Pin Node version (e.g., `22`) |
| `.env.example` | Already exists (good) |
| `src/lib/adapters.ts` | Map Prisma enums ↔ display strings |
| `src/app/api/middleware.ts` | Auth check for all routes |

---

## CLOSING: HIGH-LEVERAGE FIXES & SCARIEST RISKS

### 5 Highest-Leverage Fixes

1. **Wire Queue page to API** — proves the architecture end-to-end and establishes the pattern for all other pages
2. **Define missing CSS variables** — fixes 72 broken style references across 13 files with 2 lines of CSS
3. **Create type adapter layer** — one module that bridges Prisma enums and UI display strings, unblocking all pages
4. **Add `useFetch` to one list page** — establishes the data fetching pattern that every page will follow
5. **Fix hardcoded Home date** — makes the home page show meetings correctly for any date

### 5 Scariest Risks If Ignored

1. **Split-brain data flow** — the longer mock data stays, the more UI code gets written that assumes in-memory structures, making migration harder
2. **Type divergence** — connecting FE to BE without resolving enum mismatches will produce silent bugs (wrong stage names, broken filters, corrupted data)
3. **Zero auth** — any API call from any source can read/write all data. One curl command can delete records.
4. **Undefined CSS variables** — `--card-hover` and `--text` failing silently means interactive states and text are invisible/broken in ways that are hard to debug
5. **No tests + tight coupling to mock data** — refactoring the data flow without tests means any change could break any page with no safety net

### The Exact First Thing I Would Do

Open `src/app/globals.css` and add the two missing CSS variable definitions. This is a 30-second fix that resolves 72 broken style references and makes the visual foundation solid before touching anything else.
