# Eco-Insight Revenue OS — Production Backlog

> Generated: 2026-03-12
> Basis: Full codebase audit (AUDIT.md)
> Scope: Everything required for credible internal production use, then external release

---

## Epic 1: Foundation / Repo Health

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| F-01 | Define missing CSS variables (`--card-hover`, `--text`, `--border-strong`) | frontend | 72 style references across 13 files resolve to nothing; hover states invisible, text colors missing | P0 | Done | — | `src/app/globals.css` | All three vars defined for dark mode; hover states visible on all interactive elements; no browser console warnings | Low | 0.5h | `frontend` |
| F-02 | Fix hardcoded meeting date on Home | frontend | Home filters meetings by `'2026-03-11'` — meetings never show after that date | P0 | Done | — | `src/app/page.tsx:19` | Meetings filter uses dynamic `new Date()` comparison; today's meetings always appear | Low | 0.5h | `frontend` |
| F-03 | Add `.nvmrc` and document Node setup | ops | `npm` not found on fresh shells without manual nvm sourcing; CI will fail | P1 | Done | — | `.nvmrc` (new), `README.md` | `.nvmrc` contains `24`; README documents `nvm use` step; CI config (if any) sources nvm | Low | 0.5h | `ops` |
| F-04 | Update README to reflect true architecture | ops | README says "replace with Prisma when ready" — Prisma is fully implemented; misleads contributors | P1 | Done | — | `README.md` | README accurately describes: tech stack, data flow, setup steps, current limitations, architecture diagram | Low | 1h | `ops` |
| F-05 | Delete orphaned root `eco-insight-types.ts` | frontend | Third type file that matches neither `src/lib/types.ts` nor Prisma; causes confusion | P1 | Done | — | `eco-insight-types.ts` | File deleted; no imports reference it; no build errors | Low | 0.25h | `frontend` |
| F-06 | Delete or repurpose `src/lib/seed.ts` | backend | Unused re-export wrapper of `data.ts`; dead code | P2 | Done | — | `src/lib/seed.ts` | File deleted or clearly marked as dev utility; no production imports | Low | 0.25h | `backend` |
| F-07 | Audit and pin dependency versions | ops | `^` ranges in package.json could introduce breaking changes on install | P2 | Done | — | `package.json`, `package-lock.json` | All deps use exact or tilde ranges; `npm ci` reproducible | Low | 1h | `ops` |
| F-08 | Add `.env.local.example` with required vars | ops | Developers need to know which env vars are mandatory vs optional | P2 | Done | — | `.env.local.example` (new) | File lists DATABASE_URL (required), MICROSOFT_* (optional), CRON_SECRET (optional) with comments | Low | 0.5h | `ops` |
| F-09 | Configure ESLint rules for unused imports | qa | Dead imports accumulate without lint enforcement | P2 | Done | — | `eslint.config.js` or `.eslintrc` | `no-unused-vars` and `no-unused-imports` rules active; CI fails on violations | Low | 1h | `qa` |

---

## Epic 2: Type System Unification

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| T-01 | Create Prisma-to-UI adapter module | backend | Prisma enums use `SolutionFit`, UI expects `Solution Fit`; 6+ enum mismatches block FE↔BE connection | P0 | Done | — | `src/lib/adapters.ts` (new) | Module exports `displayStage()`, `displaySignalStatus()`, `displayContactRole()`, etc.; all Prisma enum values map to display strings; round-trip functions for UI→Prisma | Med | 3h | `frontend`, `backend` |
| T-02 | Consolidate FIUACScores type | frontend | `types.ts` uses `{f,i,u,a,c}`, Prisma uses individual `scoreFit/scoreIntent/...` columns; UI components expect abbreviated keys | P0 | Done | T-01 | `src/lib/types.ts`, `src/lib/adapters.ts`, `src/components/ui/index.tsx` | Single canonical `FIUACScores` type; adapter converts Prisma row → `{f,i,u,a,c}` for UI; `ScorePill` and `FIUACBars` work with adapted data | Med | 2h | `frontend`, `backend` |
| T-03 | Consolidate DealHealth type | frontend | `types.ts` uses `{eng,stake,comp,time}`, Prisma uses `healthEngagement/healthStakeholders/...`; same divergence pattern | P0 | Done | T-01 | `src/lib/types.ts`, `src/lib/adapters.ts` | Single canonical `DealHealth` type; adapter converts Prisma row; `HealthBar` works with adapted data | Med | 1h | `frontend`, `backend` |
| T-04 | Align field name conventions (amt→amount, ini→initials, ac→color) | frontend | `data.ts` uses abbreviated names that don't match Prisma column names; connecting FE to BE will break without mapping | P0 | Done | T-01 | `src/lib/types.ts`, `src/lib/adapters.ts`, all pages | All pages consume Prisma-shaped data via adapters; no raw abbreviated field access on server-sourced data | Med | 4h | `frontend` |
| T-05 | Remove `data.ts` as primary data source | frontend | `store.ts` initializes all state from hardcoded `data.ts`; must be replaced by API-fetched data | P0 | Done | E2-01 | `src/lib/store.ts`, `src/lib/data.ts` | `store.ts` no longer imports `data.ts` for domain data; store contains only UI state; `data.ts` moved to `prisma/` as seed reference only | Med | 2h | `frontend` |

---

## Epic 3: Data Flow / Frontend↔Backend Wiring

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| E2-01 | Wire Queue page to API (reads + mutations) | frontend | Queue is the most architecturally complete flow; proves the data path pattern for all pages | P0 | Done | T-01, F-01 | `src/app/queue/page.tsx`, `src/lib/api-client.ts`, `src/hooks/useFetch.ts` | Queue fetches from `/api/queue`; approve/reject call API; refresh retains state; loading skeleton shows during fetch; error toast on failure | Med | 4h | `frontend`, `api` |
| E2-02 | Wire Home page to API | frontend | Home shows stale mock data; most-visited screen | P0 | Done | T-01, F-01, F-02 | `src/app/page.tsx`, `src/lib/queries/home.ts` | Home calls `/api/home`; stats, NBA, signals, meetings, activity all from DB; loading skeleton; no hardcoded dates | Med | 4h | `frontend`, `api` |
| E2-03 | Wire Signals page to API (reads + dismiss + convert) | frontend | Signals are read-only mock; dismiss/convert don't persist | P0 | Done | T-01 | `src/app/signals/page.tsx`, `src/lib/queries/signals.ts` | Signals fetch from `/api/signals`; dismiss and convert call API; state persists across refresh | Med | 3h | `frontend`, `api` |
| E2-04 | Wire Leads page to API | frontend | Leads kanban shows mock data | P0 | Done | T-01 | `src/app/leads/page.tsx`, `src/lib/queries/leads.ts` | Leads fetch from `/api/leads`; kanban renders DB data; stage filtering works | Med | 3h | `frontend`, `api` |
| E2-05 | Wire Accounts page + detail to API | frontend | Account list and detail show mock data | P0 | Done | T-01 | `src/app/accounts/page.tsx`, `src/app/accounts/[id]/page.tsx`, `src/lib/queries/accounts.ts` | Account list fetches from `/api/accounts`; detail fetches by ID; search filtering works server-side | Med | 4h | `frontend`, `api` |
| E2-06 | Wire Pipeline page + detail to API | frontend | Pipeline shows mock opps; stage buttons are dead | P0 | Done | T-01 | `src/app/pipeline/page.tsx`, `src/app/pipeline/[id]/page.tsx`, `src/lib/queries/opportunities.ts` | Pipeline fetches from `/api/opportunities`; detail page shows DB data; total/weighted pipeline calculated server-side | Med | 4h | `frontend`, `api` |
| E2-07 | Wire Inbox page to API | frontend | Emails are mock; read/archive don't persist | P0 | Done | T-01 | `src/app/inbox/page.tsx`, `src/lib/queries/inbox.ts` | Inbox fetches from `/api/inbox`; mark-read and archive call API; unread count accurate | Med | 3h | `frontend`, `api` |
| E2-08 | Wire Tasks page to API | frontend | Tasks are mock; complete doesn't persist | P0 | Done | T-01 | `src/app/tasks/page.tsx`, `src/lib/queries/tasks.ts` | Tasks fetch from `/api/tasks`; complete calls API; goal grouping works with DB data | Med | 3h | `frontend`, `api` |
| E2-09 | Wire Settings page to real state | frontend | All agent configs, integration statuses, and team list are hardcoded in the component | P1 | Not started | T-01, A-01 | `src/app/settings/page.tsx`, new API routes | Team list from `/api/settings/team`; integration status from DB; agent configs from DB or config | Med | 4h | `frontend`, `api` |
| E2-10 | Refactor `store.ts` to UI-only state | frontend | Store currently holds all domain data; must hold only ephemeral UI state after wiring | P1 | Done | E2-01 through E2-08 | `src/lib/store.ts` | Store exports: `theme`, `drawerOpen`, `drawerContent`, filter/sort state per page; no domain data arrays | Low | 2h | `frontend` |
| E2-11 | Wire or delete `api-client.ts` | frontend | Complete typed fetch wrapper exists but has zero imports — either use it or remove it | P0 | Done | — | `src/lib/api-client.ts` | All pages use `api-client.ts` for mutations; OR file is deleted if alternative (React Query) chosen | Low | 1h | `frontend`, `api` |
| E2-12 | Wire or delete `useFetch.ts` | frontend | Custom hook exists but has zero imports | P0 | Done | — | `src/hooks/useFetch.ts` | All list pages use `useFetch` for data loading; OR replaced by SWR/React Query | Low | 1h | `frontend` |
| E2-13 | Wire or delete `queries.ts` | backend | 17 server-side query helpers exist but no API route imports them; routes inline all queries | P1 | Done | — | `src/lib/queries.ts`, all API routes | API routes import from `queries.ts` to reduce duplication; OR file is deleted and routes keep inline queries | Low | 3h | `backend`, `api` |

---

## Epic 4: Authentication / Identity / Registration

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| A-01 | Implement NextAuth with Microsoft Entra provider | auth | Zero auth today; all routes open; userId hardcoded to `'u1'` | P0 | Done | — | `src/app/api/auth/[...nextauth]/route.ts` (new), `src/lib/auth.ts` (new), `package.json` | Users sign in via Microsoft SSO; session cookie set; `getServerSession()` available in API routes; redirect to login if unauthenticated | Med | 4h | `auth`, `backend` |
| A-02 | Add auth middleware to all API routes | auth | API routes are unprotected; any HTTP client can read/write all data | P0 | Done | A-01 | `src/middleware.ts` (new) or per-route `getServerSession()` checks | All `/api/*` routes (except auth callback) return 401 without valid session; cron routes check `CRON_SECRET` header | Med | 3h | `auth`, `api`, `security` |
| A-03 | Replace hardcoded `'u1'` with session userId | auth | All mutations attribute actions to phantom user `'u1'` | P0 | Done | A-01 | All API route files (13 files) | Every `ownerId`, `reviewedById`, `authorId`, `assignees` derived from `session.user.id`; no `'u1'` literals remain in API routes | Med | 3h | `auth`, `api` |
| A-04 | Add login page / redirect flow | auth | No login screen exists | P0 | Done | A-01 | `src/app/login/page.tsx` (new), `src/middleware.ts` | Branded login page with "Sign in with Microsoft" button; unauthenticated users redirected here; post-login redirect to `/` | Low | 2h | `auth`, `frontend` |
| A-05 | Add sign-out flow | auth | No way to sign out | P1 | Done | A-01 | `src/components/layout/Sidebar.tsx`, `src/lib/auth.ts` | Sign-out button in sidebar; clears session; redirects to login | Low | 1h | `auth`, `frontend` |
| A-06 | Session-aware layout (current user display) | frontend | Sidebar shows hardcoded `users[0]`; TopBar shows hardcoded `JK` initials | P1 | Done | A-01 | `src/components/layout/Sidebar.tsx`, `src/components/layout/TopBar.tsx` | Sidebar and TopBar show logged-in user's name, initials, role from session | Low | 1h | `auth`, `frontend` |
| A-07 | Design invite/registration flow | auth | Currently no way to add users; `User` table has seed data only | P1 | Done | A-01 | Design doc (new), `src/app/settings/page.tsx` | Decision documented: invite-only via admin, or self-registration with domain restriction; flow designed for Phase implementation | Low | 2h | `auth`, `user-management`, `onboarding` |
| A-08 | Implement team invitation flow | user-management | Admin needs to add team members | P1 | Done | A-07, A-01 | `src/app/settings/page.tsx`, `src/app/api/settings/team/route.ts` (new) | Admin can invite users by email; invited user receives link; first login provisions their `User` record; shows in team list | Med | 6h | `auth`, `user-management`, `registration` |
| A-09 | Design tenant/workspace model decision | auth | Single-tenant (one Eco-Insight team) vs multi-tenant (multiple orgs)? Affects schema, auth, data isolation | P1 | Not started | — | Design doc (new) | Decision documented with rationale; if multi-tenant: schema changes identified; if single-tenant: documented as intentional | Low | 2h | `auth`, `db` |
| A-10 | Implement onboarding flow for new users | onboarding | First-time users need guidance on what the tool does | P2 | Not started | A-01, A-08 | `src/app/onboarding/page.tsx` (new) | New users see a brief walkthrough (3-5 steps) on first login; can skip; completion tracked | Low | 4h | `onboarding`, `frontend` |
| A-11 | Session timeout and refresh handling | auth | Long-lived sessions without timeout are a security risk | P2 | Not started | A-01 | `src/lib/auth.ts`, NextAuth config | Sessions expire after configurable period (e.g., 8h); refresh token extends session on activity; expired session redirects to login | Low | 2h | `auth`, `security` |

---

## Epic 5: User Management / Roles / Permissions

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| U-01 | Define role model (Admin, Member, Viewer) | user-management | No roles exist; everyone has identical access | P1 | Done | A-01 | `prisma/schema.prisma` (add `role` to User), design doc | Roles defined: Admin (full access + settings), Member (CRUD + approve), Viewer (read-only); schema updated | Low | 2h | `user-management`, `db`, `auth` |
| U-02 | Implement RBAC middleware | auth | Without authorization, any authenticated user can do anything | P1 | Done | U-01, A-02 | `src/lib/auth.ts`, API routes | API routes check user role before mutations; Viewers cannot approve/reject/create; Admin-only routes protected | Med | 4h | `auth`, `security`, `api` |
| U-03 | Admin: manage team members page | user-management | No way to view, edit roles, or deactivate team members | P1 | Done | U-01, A-08 | `src/app/settings/page.tsx` | Admin sees team list with role dropdowns; can change roles; can deactivate users; deactivated users cannot sign in | Med | 4h | `user-management`, `frontend` |
| U-04 | Approval authority rules | user-management | Currently anyone can approve any queue item; may need seniority/ownership rules | P2 | Done | U-01 | Design doc, `src/app/api/queue/route.ts` | Decision: any Member/Admin can approve; documented in queue route | Low | 3h | `user-management`, `api` |
| U-05 | Profile settings page | user-management | Users cannot update their own display name, initials, or notification preferences | P2 | Done | A-01 | `src/app/api/settings/profile/route.ts`, Settings Profile tab | User can edit name, initials, notification preferences; changes persist | Low | 3h | `user-management`, `frontend` |
| U-06 | Integration ownership by user | user-management | Microsoft tokens stored globally; should be per-user for multi-user teams | P1 | Done | A-01 | `prisma/schema.prisma`, `src/lib/integrations/email-sync.ts`, `calendar-sync.ts` | Each user connects their own Outlook; tokens stored per-user; sync runs for all connected users | Med | 4h | `user-management`, `integrations`, `db` |
| U-07 | Account ownership and assignment | user-management | Accounts have `ownerId` in schema but ownership isn't enforced or editable | P2 | Done | A-01 | `src/app/accounts/[id]/page.tsx`, API routes | Accounts show owner; owner can be reassigned; list views can filter "my accounts" | Low | 3h | `user-management`, `frontend` |

---

## Epic 6: Core Product Workflows

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| W-01 | Queue approval with visible side-effects | frontend | Approvals in mock data just flip status; real side-effects (lead creation, account update) invisible to user | P0 | Done | E2-01 | `src/app/queue/page.tsx`, `src/app/api/queue/route.ts` | After approving a lead_qualification item, user can navigate to Leads and see the new lead; toast confirms side-effect; activity logged | Med | 3h | `frontend`, `api` |
| W-02 | Signal → Lead conversion flow | frontend | "→ Lead" button on signals exists but conversion isn't wired end-to-end | P0 | Done | E2-03 | `src/app/signals/page.tsx`, `src/app/api/signals/route.ts` | Click "→ Lead" on signal; drawer opens with pre-filled company; confirm creates lead via API; signal status changes to converted; new lead visible in Leads page | Med | 4h | `frontend`, `api` |
| W-03 | Lead → Account/Opportunity conversion | frontend | Leads page is read-only; no advance/convert/disqualify actions | P1 | Done | E2-04 | `src/app/leads/page.tsx`, Drawer forms | Lead card has "Advance", "Convert", "Disqualify" actions; Convert opens drawer with account + optional opp fields; API creates records; lead moves to Converted stage | Med | 6h | `frontend`, `api` |
| W-04 | Pipeline stage movement | frontend | Stage buttons on opp detail have no click handlers | P1 | Done | E2-06 | `src/app/pipeline/[id]/page.tsx` | "Move to Next Stage" button calls `/api/opportunities` move action; stage visually updates; activity logged; probability auto-updates | Med | 3h | `frontend`, `api` |
| W-05 | Pipeline kanban view with columns | frontend | Pipeline is a flat vertical list; CRM users expect stage columns | P1 | Done | E2-06 | `src/app/pipeline/page.tsx` | Desktop shows columns per stage; deals as cards within columns; totals per column; drag-and-drop stage movement (stretch) | Med | 6h | `frontend` |
| W-06 | Close Won / Close Lost flows | frontend | Buttons exist on opp detail but are non-functional | P1 | Done | W-04 | `src/app/pipeline/[id]/page.tsx`, Drawer | Close Won: drawer asks for win notes + competitor beaten; API updates opp + account status; Close Lost: drawer asks for loss reason; both log activity | Med | 4h | `frontend`, `api` |
| W-07 | Task create form | frontend | No way to create tasks; "New" button in TopBar is decorative | P1 | Done | E2-08 | New Drawer form component, `src/app/api/tasks/route.ts` | "New" button or "Add Task" opens drawer; fields: title, due, priority, account, assignees, goal; submit creates via API | Med | 4h | `frontend`, `api` |
| W-08 | Task complete with follow-ups | frontend | Complete button flips Zustand status; no outcome capture or follow-up creation | P1 | Done | E2-08 | `src/app/tasks/page.tsx`, Drawer | Complete opens drawer; fields: outcome, notes, suggested follow-ups; API creates task + activity + follow-ups; engagement health bumped | Med | 4h | `frontend`, `api` |
| W-09 | Account create form | frontend | No way to create accounts manually | P1 | Done | E2-05 | New Drawer form, `src/app/api/accounts/route.ts` | Drawer with: name, type, country, pain fields; dedup check on submit; 409 if duplicate; success navigates to new account | Med | 3h | `frontend`, `api` |
| W-10 | Contact create/edit within account | frontend | Contacts visible on account detail but cannot be added or edited | P1 | Done | E2-05 | `src/app/accounts/[id]/page.tsx`, new API route | "Add Contact" button on account detail; drawer with name, title, role, warmth, email, phone; saved to DB | Med | 4h | `frontend`, `api` |
| W-11 | Opportunity create form | frontend | No way to create opportunities manually | P1 | Done | E2-06 | New Drawer form, opportunity API | Drawer: name, account (dropdown), stage, amount, close date; API creates with auto-probability; visible in pipeline | Med | 4h | `frontend`, `api` |
| W-12 | Inbox: Create Task from email | frontend | "Create Task" button in inbox is non-functional | P1 | Done | E2-07 | `src/app/inbox/page.tsx`, `/api/inbox` | Click "Create Task" on email; task auto-populated with email subject; linked to account; visible in Tasks page | Med | 3h | `frontend`, `api` |
| W-13 | Inbox: Create Account from new domain email | frontend | "New" domain badge shows but no action to create account | P1 | Done | E2-07 | `src/app/inbox/page.tsx`, `/api/inbox` | "Create Account" action on new-domain emails; domain → account name; contact created from sender; email linked | Med | 3h | `frontend`, `api` |
| W-14 | Activity log / timeline on account detail | frontend | Account detail shows mock activities; no way to log new ones | P1 | Done | E2-05 | `src/app/accounts/[id]/page.tsx`, `/api/activities` | Activity tab shows real activities; "Log Note" button opens drawer; note saved via API; timeline refreshes | Med | 3h | `frontend`, `api` |
| W-15 | Command palette (Cmd+K) | frontend | Search bar in sidebar is decorative; Cmd+K not wired | P1 | Done | E2-11 | New component, `/api/search` route | Cmd+K opens modal; typing searches accounts, opps, leads, signals via API; selecting navigates; actions (create task, log note) available | Med | 6h | `frontend`, `api` |
| W-16 | Lead create form | frontend | No way to create leads manually | P2 | Not started | E2-04 | New Drawer form, `/api/leads` | Drawer: company, type, country, pain, source; dedup check; new lead appears in kanban | Med | 3h | `frontend`, `api` |
| W-17 | Signal detail drawer | frontend | Signals show summary only; no detailed view | P2 | Not started | E2-03 | `src/app/signals/page.tsx`, Drawer | Click signal opens drawer with full details: source, companies, confidence breakdown, reasoning, actions | Low | 3h | `frontend` |
| W-18 | Meeting prep and outcome logging | frontend | Meetings show on Home but no prep or outcome capture | P2 | Not started | E2-02 | New meeting routes and UI | Meeting detail shows account context; "Mark Ready" button; after meeting: log outcome, next steps, health update | Med | 6h | `frontend`, `api` |

---

## Epic 7: API Completeness

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| API-01 | Add input validation (Zod) to all POST routes | api | Minimal validation today; bad data can enter DB | P1 | Done | — | All 13 route files, `package.json` (add zod) | Every POST/PATCH body validated with Zod schema; 400 returned with field-level errors on invalid input; no untyped `as any` casts on request body | Med | 6h | `api`, `security` |
| API-02 | Standardize error response envelope | api | Some routes return `{ error: 'string' }`, others throw unhandled; contract specifies `{ error: { code, message } }` | P1 | Done | — | All route files, new `src/lib/api-errors.ts` | All routes return `{ error: { code: 'NOT_FOUND', message: '...' } }` for errors; helper function for consistent error creation | Low | 3h | `api` |
| API-03 | Add cursor-based pagination to list endpoints | api | All list endpoints return all records; will degrade with real data volume | P1 | Done | — | `/api/signals`, `/api/leads`, `/api/accounts`, `/api/opportunities`, `/api/tasks`, `/api/activities`, `/api/inbox` | All list endpoints accept `?cursor=&limit=`; response includes `meta.cursor` and `meta.hasMore`; default limit 50 | Med | 6h | `api` |
| API-04 | Implement `PATCH /accounts/:id` (account update) | api | No way to update account fields (pain, whyNow, status, notes) | P1 | Done | — | `src/app/api/accounts/[id]/route.ts` | PATCH accepts partial account fields; validates with Zod; updates Prisma record; returns updated account | Low | 2h | `api` |
| API-05 | Implement `POST /accounts/:id/contacts` | api | No API to add contacts to accounts | P1 | Done | — | New `src/app/api/accounts/[id]/contacts/route.ts` | POST creates contact linked to account; validates required fields; returns 201 | Low | 2h | `api` |
| API-06 | Implement `GET /meetings` and `GET /meetings/:id` | api | No meetings API; Home endpoint inlines meeting data | P1 | Not started | — | New `src/app/api/meetings/route.ts` | GET returns meetings for date range; detail includes account context | Low | 3h | `api` |
| API-07 | Implement `POST /meetings/:id/log-outcome` | api | No way to log meeting outcomes | P2 | Not started | API-06 | `src/app/api/meetings/[id]/route.ts` (new) | POST accepts outcome, notes, nextStep; creates activity; optionally creates follow-up task; updates account lastActivityAt | Med | 3h | `api` |
| API-08 | Implement `GET /settings/agents` and `PATCH /settings/agents/:name` | api | Agent configs hardcoded in Settings page component | P1 | Not started | — | New settings API routes, schema change or config table | GET returns agent configs from DB/config; PATCH updates parameters and status; Settings page reads from API | Med | 4h | `api`, `backend` |
| API-09 | Implement `GET /settings/integrations` | api | Integration status hardcoded in Settings page | P1 | Not started | — | New settings API route | Returns integration status from DB (token existence, last sync time, error state) | Low | 2h | `api` |
| API-10 | Implement `PATCH /tasks/:id/reassign` | api | No way to reassign tasks | P2 | Not started | — | `src/app/api/tasks/route.ts` | PATCH accepts `assigneeIds`, `reviewerId`; updates relations; activity logged | Low | 2h | `api` |
| API-11 | Implement `POST /queue/:id/undo` | api | Contract specifies 30-second undo window; not implemented | P2 | Not started | — | `src/app/api/queue/route.ts` | Undo reverts approved/rejected → pending if within 30s of action; reverses side-effects (deletes created lead/task) | High | 4h | `api` |
| API-12 | Add rate limiting | api | No rate limiting; contract specifies limits per endpoint | P2 | Not started | — | `src/middleware.ts` or new rate-limit utility | Rate limits enforced per contract (60/min writes, 300/min reads); 429 response when exceeded | Med | 4h | `api`, `security` |
| API-13 | Add idempotency keys for mutations | api | Duplicate POST requests can create duplicate records | P2 | Not started | — | API route helpers | POST requests accept `Idempotency-Key` header; duplicate key within window returns cached response | Med | 4h | `api` |
| API-14 | Implement contacts search in `/api/search` | api | Search doesn't include contacts; contract mentions it | P2 | Not started | — | `src/app/api/search/route.ts` | Search results include contacts by name/email in addition to accounts, opps, leads, signals | Low | 1h | `api` |

---

## Epic 8: Integrations

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| I-01 | Verify Microsoft OAuth flow end-to-end | integrations | OAuth code exists but may not have been tested with real credentials | P1 | Not started | A-01 | `src/lib/integrations/microsoft-graph.ts`, `/api/auth/connect`, `/api/auth/callback` | "Connect Outlook" in Settings → Microsoft login → callback saves token → redirect to Settings with success message; token stored in DB | Med | 3h | `integrations` |
| I-02 | Add per-user token storage | integrations | Single global token; team has multiple Outlook accounts | P1 | Not started | A-01, U-06 | `prisma/schema.prisma`, `email-sync.ts`, `calendar-sync.ts` | Each user connects their own Outlook; `IntegrationToken` keyed by userId + provider; sync iterates all users | Med | 4h | `integrations`, `db` |
| I-03 | Email sync dedup by Graph message ID | integrations | Current dedup uses subject+from+receivedAt; Graph ID is more reliable | P1 | Not started | — | `prisma/schema.prisma` (add `externalId`), `email-sync.ts` | `InboxEmail` has `externalId` column (unique per provider); sync checks externalId before insert; no duplicates even with identical timestamps | Med | 2h | `integrations`, `db` |
| I-04 | Add sync status visibility to Settings | integrations | Settings shows hardcoded "Connected" with no last-sync time | P1 | Not started | I-01, API-09 | `src/app/settings/page.tsx`, Settings API | Settings shows: connection status, last sync time, email count synced, last error (if any) | Low | 3h | `integrations`, `frontend` |
| I-05 | Add manual "Sync Now" button | integrations | Users can only wait for cron; no manual trigger | P1 | Not started | I-01 | `src/app/settings/page.tsx`, `/api/sync/route.ts` | "Sync Now" button triggers email + calendar sync; shows progress; reports results | Low | 2h | `integrations`, `frontend` |
| I-06 | Add sync retry logic | integrations | Single failure kills entire sync run; no retry for transient errors | P2 | Not started | — | `email-sync.ts`, `calendar-sync.ts` | Transient Graph API errors (429, 503) retried up to 3 times with exponential backoff; per-email errors don't kill batch | Med | 3h | `integrations` |
| I-07 | Handle token revocation gracefully | integrations | If user revokes app access in Microsoft, sync fails silently | P2 | Not started | I-01 | `email-sync.ts`, `calendar-sync.ts`, Settings | On token refresh failure: mark integration as disconnected; show "Reconnect" prompt in Settings; stop sync for that user | Med | 2h | `integrations` |
| I-08 | Calendar sync: handle timezone correctly | integrations | `formatTime()` in calendar-sync uses `toLocaleTimeString` which depends on server timezone | P2 | Not started | — | `src/lib/integrations/calendar-sync.ts` | Store meeting times in UTC; display in user's timezone; `startTime` stored as ISO datetime, not formatted string | Med | 3h | `integrations`, `db` |
| I-09 | Design future integration architecture | integrations | Only Microsoft supported; need extensibility for HubSpot, Salesforce, LinkedIn, etc. | P2 | Not started | — | Design doc | Document: integration adapter pattern; common sync interface; credential storage pattern; enable future integrations without architectural changes | Low | 3h | `integrations` |

---

## Epic 9: Security / InfoSec

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| S-01 | Add security headers (CSP, HSTS, X-Frame-Options) | security | No security headers configured; XSS/clickjacking risk | P1 | Done | — | `next.config.ts` or `src/middleware.ts` | Response includes: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy | Low | 2h | `security`, `infosec` |
| S-02 | Audit all `as any` type casts in API routes | security | Queue route casts `item.payload as any`; potential for injection if payload contains unexpected structure | P1 | Not started | API-01 | All API routes | All `as any` casts replaced with Zod-validated types or Prisma's `JsonValue` with safe access patterns; no unvalidated type assertions | Med | 3h | `security`, `api` |
| S-03 | Protect cron endpoint with secret on all methods | security | `/api/sync` only checks cron secret on POST; GET is unprotected info endpoint | P1 | Done | A-02 | `src/app/api/sync/route.ts` | Both GET and POST require either cron secret header or authenticated admin session | Low | 1h | `security`, `api` |
| S-04 | Encrypt OAuth tokens at rest | security | Access/refresh tokens stored as plaintext in DB | P2 | Not started | — | `prisma/schema.prisma`, `microsoft-graph.ts`, `email-sync.ts`, `calendar-sync.ts` | Tokens encrypted before DB write; decrypted on read; encryption key in env var; key rotation plan documented | Med | 4h | `security`, `infosec`, `db` |
| S-05 | Input sanitization for XSS vectors | security | User-provided text (task titles, notes, comments) rendered without sanitization | P1 | Done | — | All components rendering user content | React's default escaping verified; dangerouslySetInnerHTML never used; Markdown rendering (if added) uses sanitizer | Low | 2h | `security`, `frontend` |
| S-06 | SQL injection review (Prisma parameterization) | security | Prisma parameterizes by default, but raw queries or string interpolation could bypass | P1 | Done | — | All API routes | Audit confirms: no `$queryRaw` with string interpolation; all user input goes through Prisma's parameterized queries; `contains` searches use Prisma mode | Low | 1h | `security`, `infosec` |
| S-07 | CSRF protection | security | API routes accept POST without CSRF tokens; SameSite cookies may not be set | P1 | Done | A-01 | NextAuth config, `next.config.ts` | Session cookies set with `SameSite=Lax`; state parameter validated in OAuth flow; mutation endpoints reject requests without valid session origin | Low | 2h | `security`, `infosec` |
| S-08 | Dependency vulnerability audit | security | 395 packages installed; no audit run | P1 | Done | — | `package.json` | `npm audit` returns 0 critical/high vulnerabilities; automated audit in CI pipeline; Dependabot or similar configured | Low | 2h | `security`, `infosec`, `ops` |
| S-09 | Secure session cookie configuration | security | NextAuth defaults may not enforce HttpOnly, Secure, SameSite | P1 | Done | A-01 | NextAuth config | Session cookie: HttpOnly, Secure (in production), SameSite=Lax, path=/; session ID not guessable | Low | 1h | `security`, `auth` |
| S-10 | Admin action audit logging | security | No record of who changed what; queue approvals log activity but no general audit trail | P2 | Not started | A-01 | New `AuditLog` model or extend Activity | All admin actions (role change, user invite, config change) logged with: who, what, when, before/after values | Med | 4h | `security`, `infosec`, `db` |
| S-11 | Data access boundary enforcement | security | No row-level security; any authenticated user can access any record | P2 | Not started | U-01 | API routes, query helpers | Users see only records they own or are assigned to (or Admins see all); account/opp/task queries filtered by ownership | Med | 6h | `security`, `api` |
| S-12 | Sensitive data logging review | security | API errors may log request bodies containing tokens or PII | P2 | Not started | — | All API routes, sync code | Error logs never contain: access tokens, refresh tokens, email bodies, full contact details; structured logging with redaction | Low | 2h | `security`, `infosec`, `ops` |
| S-13 | Environment variable validation at startup | security | Missing env vars cause runtime errors (e.g., DATABASE_URL) instead of clear startup failures | P1 | Done | — | New `src/lib/env.ts` | App validates required env vars at startup; clear error message naming missing var; optional vars have documented defaults | Low | 2h | `security`, `ops` |

---

## Epic 10: Privacy / Compliance

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| P-01 | Document personal data inventory | privacy | App stores names, emails, job titles, LinkedIn URLs; GDPR requires knowing what you hold | P1 | Not started | — | New `PRIVACY.md` or internal doc | Document lists: every PII field, which table, purpose, retention period, legal basis (legitimate interest for B2B CRM) | Low | 3h | `infosec` |
| P-02 | Add data retention policy and cleanup job | privacy | No retention limits; data grows indefinitely; GDPR requires defined retention | P2 | Not started | — | Design doc, new cron job | Policy defined (e.g., archived emails deleted after 90 days; dismissed signals after 180 days); automated cleanup job runs weekly | Med | 4h | `infosec`, `ops` |
| P-03 | Implement data export for contacts/accounts | privacy | GDPR Article 20: data portability | P2 | Not started | A-02 | New `/api/export` route | Admin can export all data for an account (contacts, activities, emails) as JSON or CSV; rate-limited | Med | 4h | `infosec`, `api` |
| P-04 | Implement contact deletion with cascade | privacy | GDPR Article 17: right to erasure; contacts can request deletion | P2 | Not started | — | New delete API, schema review | Contact can be deleted; cascades to or anonymizes: activities, email links, meeting attendees; audit log entry created | Med | 4h | `infosec`, `api`, `db` |
| P-05 | Cookie consent handling | privacy | If analytics or non-essential cookies added, consent required under ePrivacy/GDPR | P2 | Not started | — | Layout component, new consent UI | If non-essential cookies used: consent banner shown; consent stored; analytics only fires after consent | Low | 3h | `infosec`, `frontend` |
| P-06 | Access logging for sensitive data views | privacy | No record of who viewed which contact/account details | P2 | Not started | A-01, S-10 | API middleware or routes | Accesses to account detail, contact info logged with userId and timestamp; queryable for audit purposes | Med | 3h | `infosec`, `security` |

---

## Epic 11: Reliability / Operations

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| O-01 | Add health check endpoint | ops | No way to verify app is running and DB is connected | P1 | Done | — | New `/api/health/route.ts` | GET returns `{ status: 'ok', db: 'connected', version: '0.2.0' }`; returns 503 if DB unreachable; Vercel or uptime monitor pings it | Low | 1h | `ops`, `api` |
| O-02 | Add structured logging for API routes | ops | No logging; errors vanish; impossible to debug production issues | P1 | Done | — | New `src/lib/logger.ts`, all API routes | All API requests logged with: method, path, status, duration, userId; errors include stack trace; structured JSON format | Med | 4h | `ops` |
| O-03 | Add error boundary components | frontend | Unhandled React errors crash the entire page | P1 | Done | — | New `src/components/ErrorBoundary.tsx`, `layout.tsx` | Error boundary wraps each page; shows "Something went wrong" with retry button; error reported to logger | Low | 2h | `frontend`, `ops` |
| O-04 | Sync job failure alerting | ops | Sync failures are silent; no one knows if email sync breaks | P1 | Not started | I-01 | `/api/sync/route.ts`, new alerting mechanism | Failed sync creates activity/notification visible in app; optionally sends alert email to admin | Med | 3h | `ops`, `integrations` |
| O-05 | Database backup strategy | ops | No backup plan; data loss = total loss | P1 | Not started | — | Ops documentation | Documented: Supabase/Neon automatic backups enabled; backup frequency; point-in-time recovery tested; restore procedure documented | Low | 2h | `ops`, `db` |
| O-06 | Deploy pipeline and rollback plan | ops | No CI/CD documented; no rollback procedure | P1 | Not started | — | Ops documentation, `vercel.json` | Documented: deploy via Vercel Git integration; preview deploys for PRs; production deploy process; rollback = redeploy previous commit | Low | 2h | `ops` |
| O-07 | Background job monitoring dashboard | ops | Cron runs invisibly; no visibility into sync history | P2 | Not started | O-02 | New settings or admin page | Admin can see: last 10 sync runs with timestamps, results, error counts; sync health indicator in Settings | Med | 4h | `ops`, `frontend` |
| O-08 | Dead-letter handling for failed sync items | ops | Sync errors logged per-email but no recovery mechanism | P2 | Not started | I-06 | `email-sync.ts`, `calendar-sync.ts` | Failed items stored with error details; admin can view and retry failed items; items not retried forever (max 3 attempts) | Med | 4h | `ops`, `integrations` |
| O-09 | Uptime monitoring | ops | No external monitoring; downtime goes unnoticed | P2 | Not started | O-01 | External service (Vercel Analytics, Better Uptime, etc.) | Health endpoint monitored; alert sent if down for >5 minutes; 99.5% uptime target documented | Low | 1h | `ops` |

---

## Epic 12: Quality / QA / Testing

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| Q-01 | Set up test infrastructure (Vitest + Testing Library) | qa | Zero test files exist; no test runner configured | P1 | Done | — | `package.json`, `vitest.config.ts` (new), `tsconfig.json` | `npm test` runs Vitest; React Testing Library available; first passing test exists | Low | 2h | `qa` |
| Q-02 | Unit tests for adapter/utility functions | qa | Type adapters and utility functions are critical path; breakage = silent data corruption | P1 | Done | Q-01, T-01 | New `src/lib/__tests__/` | Tests for: `adapters.ts` (all enum mappings), `utils.ts` (fmt, isOverdue, weightedValue), `types.ts` (compositeScore, healthAvg); >90% coverage on these files | Low | 3h | `qa` |
| Q-03 | Integration tests for API routes | qa | API routes have complex side-effects (queue approval creates leads); must verify correctness | P1 | Done | Q-01 | New `src/app/api/__tests__/` | Tests for: queue approve (verify lead created), signal convert (verify lead + signal updated), task complete (verify activity + health); uses test DB | Med | 6h | `qa`, `api` |
| Q-04 | E2e tests for 5 critical flows | qa | No regression safety for user-facing workflows | P1 | Done | Q-01, E2-01 | New `e2e/` directory with Playwright | Tests: (1) login → home loads, (2) approve queue item → lead visible, (3) signal → lead conversion, (4) create task → complete task, (5) pipeline stage move; all pass in CI | Med | 8h | `qa` |
| Q-05 | Test data strategy and test seed | qa | Production seed data used for tests; need isolated test data | P2 | Not started | Q-01 | `prisma/test-seed.ts` (new) | Separate minimal test seed; tests run against clean test DB; `beforeEach` resets to known state | Med | 3h | `qa`, `db` |
| Q-06 | Add TypeScript strict checks and fix violations | qa | `strict: true` enabled but potential runtime issues from `any` casts and missing null checks | P2 | Not started | — | `tsconfig.json`, API routes | `noUncheckedIndexedAccess` enabled; all `as any` casts in API routes replaced with proper types; build passes | Med | 4h | `qa` |
| Q-07 | Visual regression testing setup | qa | UI changes could break layouts without anyone noticing | P2 | Not started | Q-04 | Playwright config, snapshots | Playwright captures screenshots of key pages; compared on PR; failures block merge | Med | 4h | `qa`, `frontend` |
| Q-08 | Smoke test suite for deploy verification | qa | After deploy, no way to verify app is functional | P2 | Not started | O-01, Q-04 | New smoke test script | Post-deploy script hits: health endpoint, home page, one list page; reports pass/fail; integrated into deploy pipeline | Low | 2h | `qa`, `ops` |

---

## Epic 13: Frontend / UX Completeness

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| UX-01 | Add loading skeletons to all list pages | frontend | Pages will be blank during API fetch; no visual feedback | P0 | Done | E2-01 | All page files, new `src/components/ui/Skeleton.tsx` | Every list page shows shimmer skeleton matching the layout while data loads; skeleton disappears when data arrives | Low | 4h | `frontend` |
| UX-02 | Add error states to all pages | frontend | API failures show nothing or crash; no retry mechanism | P1 | Done | E2-01 | All page files | API error → "Failed to load" message with "Retry" button; non-blocking (rest of page still usable if possible) | Low | 3h | `frontend` |
| UX-03 | Add toast notification system | frontend | No feedback on mutations (approve, dismiss, complete, etc.) | P1 | Done | — | New `src/components/ui/Toast.tsx`, store | Toasts appear for: success ("Lead created"), error ("Failed to approve"), info ("Syncing..."); auto-dismiss after 5s; stack up to 3 | Low | 3h | `frontend` |
| UX-04 | Implement light theme | frontend | Toggle exists, nothing happens; users expect light mode | P1 | Done | F-01 | `src/app/globals.css`, `tailwind.config.ts` | CSS variables overridden for light theme (`:root` = light, `.dark` = dark); all pages readable in both modes; toggle persists to localStorage | Med | 6h | `frontend` |
| UX-05 | Persist theme preference to localStorage | frontend | Theme resets to dark on every page load | P1 | Done | UX-04 | `src/lib/store.ts`, `src/app/theme-init.tsx` | Theme saved to localStorage on toggle; restored on load; no flash of wrong theme (script in `<head>`) | Low | 1h | `frontend` |
| UX-06 | Optimistic updates for mutations | frontend | Without optimistic UI, every mutation has visible latency | P1 | Not started | E2-01 | Store or React Query cache, page components | Approve/reject/dismiss/complete update UI instantly; rolled back on server error with toast | Med | 4h | `frontend` |
| UX-07 | Accessibility audit (a11y basics) | frontend | No ARIA labels, no keyboard navigation, no focus management | P2 | Not started | — | All components | Interactive elements have ARIA labels; tab navigation works through sidebar, forms, buttons; focus trapped in Drawer when open; color contrast meets WCAG AA | Med | 6h | `frontend` |
| UX-08 | Remove all hardcoded demo values from UI | frontend | Greeting shows "Juuso" hardcoded; meeting date hardcoded; "Last run: 2 hours ago" in Settings | P1 | Done | E2-02, E2-09 | `src/app/page.tsx`, `src/app/settings/page.tsx` | All user names from session/DB; all dates dynamic; all statuses from real state; grep for hardcoded strings returns zero false positives | Low | 2h | `frontend` |
| UX-09 | Responsive audit: all pages on mobile viewport | frontend | Bottom nav exists but some pages may not render well on small screens | P2 | Not started | — | All page files | All pages functional at 375px width; no horizontal scroll; touch targets ≥44px; bottom nav doesn't overlap content | Med | 4h | `frontend` |
| UX-10 | Design token cleanup (reduce arbitrary font sizes) | frontend | 8+ hardcoded pixel font sizes (`text-[12.5px]`, `text-[8.5px]`) across pages | P2 | Not started | — | `tailwind.config.ts`, all page files | Consolidated to ≤5 custom font sizes in Tailwind config; pages use named sizes instead of arbitrary values | Low | 4h | `frontend` |
| UX-11 | Keyboard shortcuts implementation | frontend | Sidebar shows shortcuts (1-7 for navigation) but none are wired | P2 | Not started | — | New keyboard handler, layout component | Number keys 1-7 navigate between pages; Cmd+K opens palette; Esc closes drawer/modals; shortcuts shown in Settings | Low | 3h | `frontend` |
| UX-12 | Empty state improvements | frontend | Empty states exist but are generic text; could show CTAs | P2 | Not started | — | `src/components/ui/index.tsx`, page files | Empty states include actionable CTA button ("Create your first lead", "Connect Outlook"); context-appropriate messaging | Low | 2h | `frontend` |

---

## Epic 14: Database / Schema

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| DB-01 | Add missing index on Task.due | db | "Overdue tasks" query filters by `due < now()` on every Home load; no index | P1 | Done | — | `prisma/schema.prisma` | `@@index([due])` added to Task model; migration run; explain plan confirms index used | Low | 0.5h | `db` |
| DB-02 | Add `externalId` to InboxEmail for Graph dedup | db | Current dedup uses subject+from+date; Graph message ID is authoritative | P1 | Not started | I-03 | `prisma/schema.prisma`, `email-sync.ts` | `externalId String? @unique` added; sync stores Graph message ID; dedup checks externalId first | Low | 1h | `db`, `integrations` |
| DB-03 | Add soft delete (`archivedAt`) to key models | db | Hard deletes lose data; no undo for accidental deletions | P2 | Not started | — | `prisma/schema.prisma` | Account, Lead, Opportunity, Task have `archivedAt DateTime?`; queries default to `archivedAt: null`; "Archive" action sets timestamp instead of deleting | Med | 4h | `db` |
| DB-04 | Add `createdBy` / `updatedBy` audit fields | db | No record of who created or last modified records (beyond `ownerId`) | P2 | Not started | A-01 | `prisma/schema.prisma` | All major models have `createdById`, `updatedById` fields; populated from session; available for audit queries | Med | 4h | `db`, `security` |
| DB-05 | Add AgentConfig table | db | Agent configs hardcoded in Settings component; not adjustable or persistent | P1 | Done | — | `prisma/schema.prisma`, seed | `AgentConfig` model: name, status, parameters (JSON), lastRunAt, createdAt, updatedAt; seeded with 6 agents | Low | 2h | `db` |
| DB-06 | Add AuditLog table | db | No audit trail for admin actions, config changes, or data modifications | P2 | Not started | S-10 | `prisma/schema.prisma` | `AuditLog` model: action, entityType, entityId, userId, before (JSON), after (JSON), createdAt; indexed by entityType+entityId | Med | 2h | `db`, `security` |
| DB-07 | Review cascade delete safety | db | Contact and TaskComment cascade on parent delete; verify this is intentional for all relations | P2 | Done | — | `prisma/schema.prisma` | All `onDelete` behaviors reviewed and documented; cascade only where appropriate; orphan prevention verified | Low | 1h | `db` |
| DB-08 | Add database migration strategy documentation | db | No migration files exist (only `db push` used); production needs proper migrations | P1 | Done | — | `prisma/migrations/` directory, docs | Switch from `db push` to `prisma migrate dev` for schema changes; initial migration created; documented workflow for schema changes | Med | 2h | `db`, `ops` |
| DB-09 | Seed data realism review | db | Seed data dates are hardcoded to March 2026; need to be relative for ongoing development | P2 | Not started | — | `prisma/seed.ts` | Seed dates are relative (e.g., `new Date(Date.now() - 2 * 864e5)` for "2 days ago"); seed always produces realistic-looking current data | Low | 2h | `db` |

---

## Epic 15: Agents / Queue System

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| AG-01 | Agent pause/resume from Settings | backend | Agent specs mention pause capability; Settings has "Pause Agent" button that does nothing | P1 | Not started | DB-05, API-08 | Settings page, agent config API | Admin can pause/resume each agent from Settings; paused agents skip their cron execution; visual status indicator | Low | 3h | `backend`, `frontend` |
| AG-02 | Pipeline Hygiene agent (cron-based) | backend | Agent spec exists but not implemented; stale deals need automated flagging | P2 | Not started | DB-05 | New `src/lib/agents/pipeline-hygiene.ts`, cron route | Cron job checks opportunities with no activity for 7+ days; creates queue items for stale deals; respects agent pause state | Med | 6h | `backend` |
| AG-03 | Signal Hunter agent (scraping/API) | backend | Agent spec exists but not implemented; manual signal entry only | P2 | Not started | DB-05 | New `src/lib/agents/signal-hunter.ts`, cron route | Agent fetches from configured sources (RSS, APIs); creates signals with relevance scores; dedup against existing signals | High | 8h | `backend`, `integrations` |
| AG-04 | Queue item batch operations | frontend | No way to approve/reject multiple items at once | P2 | Not started | E2-01 | `src/app/queue/page.tsx`, API route | Checkboxes on queue items; "Approve Selected" and "Reject Selected" buttons; single API call for batch | Low | 3h | `frontend`, `api` |
| AG-05 | Agent run history and metrics | backend | No visibility into what agents have done | P2 | Not started | AG-01 | New table or extend activity log | Each agent run logged: start time, end time, items created, errors; visible in Settings; last N runs shown per agent | Med | 4h | `backend`, `db` |

---

## Epic 16: Commercial / End-Product Readiness

| ID | Title | Category | Why It Matters | Pri | Status | Deps | Files | Acceptance Criteria | Risk | Est | Tags |
|----|-------|----------|---------------|-----|--------|------|-------|-------------------|------|-----|------|
| C-01 | Product analytics / telemetry | ops | No usage data; can't measure adoption or identify issues | P2 | Not started | A-01, P-05 | Layout component, analytics provider | Page views, key actions (approve, convert, complete) tracked; dashboard accessible; PII excluded; consent-gated if cookie-based | Low | 4h | `ops`, `frontend` |
| C-02 | In-app help / documentation links | frontend | No help system; users must guess how features work | P2 | Not started | — | Settings or new help page | Help links in Settings for key concepts; tooltip explanations on complex UI (FIUAC scores, health bars); link to external docs | Low | 3h | `frontend` |
| C-03 | Admin dashboard for system health | ops | No admin view of overall system state (user count, sync health, queue backlog, DB size) | P2 | Not started | A-01, U-01 | New admin page or Settings section | Admin sees: active users, pending queue items, last sync status, total records per entity, recent errors | Med | 4h | `ops`, `frontend` |
| C-04 | Notification system (in-app) | frontend | No way to notify users of events (new queue items, assigned tasks, completed deals) | P2 | Not started | A-01 | New notification model, TopBar bell icon, API | Bell icon shows notification count; clicking shows list; notifications created by: queue item creation, task assignment, mention in comment | Med | 8h | `frontend`, `backend`, `db` |
| C-05 | Data import capability (CSV) | frontend | No way to bulk-import existing accounts, contacts, or leads | P2 | Not started | A-01 | New import UI and API | CSV upload for accounts/contacts/leads; preview before import; dedup check; import summary report | Med | 8h | `frontend`, `api` |
| C-06 | Data export capability (CSV/JSON) | frontend | No way to export data for reporting or backup | P2 | Not started | A-01, P-03 | New export API | Export accounts, pipeline, tasks as CSV or JSON; filtered by date range; admin-only | Med | 4h | `api` |

---

## Must-Have Before Internal Production Use

These items must be complete before the team uses this tool for real daily work:

| ID | Title | Why Critical |
|----|-------|-------------|
| **F-01** | Define missing CSS variables | 72 broken style references |
| **F-02** | Fix hardcoded meeting date | Home page broken |
| **T-01** | Create Prisma-to-UI adapter | FE↔BE connection prerequisite |
| **T-02** | Consolidate FIUACScores type | Score display breaks without it |
| **T-03** | Consolidate DealHealth type | Health bar display breaks without it |
| **T-04** | Align field name conventions | Pages can't render DB data without mapping |
| **T-05** | Remove data.ts as primary data source | Stop reading mock data |
| **E2-01** | Wire Queue page to API | Most critical workflow |
| **E2-02** | Wire Home page to API | Most-visited page |
| **E2-03** | Wire Signals page to API | Signal pipeline critical |
| **E2-04** | Wire Leads page to API | Lead management critical |
| **E2-05** | Wire Accounts page to API | Account data must be real |
| **E2-06** | Wire Pipeline page to API | Deal tracking is core function |
| **E2-07** | Wire Inbox page to API | Email triage critical |
| **E2-08** | Wire Tasks page to API | Task management critical |
| **E2-11** | Wire or delete api-client.ts | Resolve dead code |
| **E2-12** | Wire or delete useFetch.ts | Resolve dead code |
| **A-01** | Implement NextAuth with Microsoft | Can't use without login |
| **A-02** | Auth middleware on all API routes | Open API is unacceptable |
| **A-03** | Replace hardcoded userId | Actions must be attributed correctly |
| **A-04** | Login page | Entry point for authenticated app |
| **A-05** | Sign-out flow | Must be able to switch users |
| **W-01** | Queue approval with visible side-effects | Core workflow must be verifiable |
| **UX-01** | Loading skeletons | Pages blank without them |
| **UX-03** | Toast notifications | No feedback on actions without them |
| **UX-08** | Remove hardcoded demo values | Demo artifacts unacceptable in production |
| **O-01** | Health check endpoint | Basic operational visibility |
| **DB-08** | Database migration strategy | Can't evolve schema safely without it |
| **S-13** | Environment variable validation | Prevent cryptic runtime errors |
| **F-04** | Update README | Developers need accurate docs |

**Count: 31 items**

---

## Must-Have Before External/Customer-Facing Release

Everything above, plus:

| ID | Title | Why Critical |
|----|-------|-------------|
| **U-01** | Define role model | Multi-user access control |
| **U-02** | RBAC middleware | Authorization enforcement |
| **U-03** | Admin team management | User lifecycle management |
| **U-06** | Per-user integration ownership | Each user's Outlook |
| **A-07** | Design invite flow | User provisioning |
| **A-08** | Implement invitation flow | Add team members |
| **A-09** | Tenant model decision | Multi-org readiness |
| **A-11** | Session timeout | Security baseline |
| **W-02** through **W-14** | All core workflow items | Feature completeness |
| **W-15** | Command palette | Power user UX |
| **API-01** | Input validation (Zod) | Prevent bad data |
| **API-02** | Error response standardization | API reliability |
| **API-03** | Pagination | Scalability |
| **I-01** | Verify OAuth end-to-end | Integration reliability |
| **I-02** | Per-user tokens | Multi-user integrations |
| **I-03** | Email dedup by Graph ID | Data integrity |
| **I-04** | Sync status visibility | Operational transparency |
| **I-06** | Sync retry logic | Integration reliability |
| **I-07** | Token revocation handling | Graceful degradation |
| **S-01** | Security headers | Web security baseline |
| **S-02** | Audit `as any` casts | Type safety |
| **S-04** | Encrypt tokens at rest | Data protection |
| **S-05** | XSS review | Security baseline |
| **S-07** | CSRF protection | Security baseline |
| **S-08** | Dependency audit | Supply chain security |
| **S-09** | Secure cookies | Session security |
| **P-01** | Personal data inventory | GDPR compliance |
| **P-02** | Data retention policy | GDPR compliance |
| **P-04** | Contact deletion | Right to erasure |
| **UX-04** | Light theme | User expectation |
| **UX-06** | Optimistic updates | UX quality |
| **UX-07** | Accessibility basics | Legal/ethical requirement |
| **O-02** | Structured logging | Debuggability |
| **O-03** | Error boundaries | Crash resilience |
| **O-05** | Backup strategy | Data safety |
| **O-06** | Deploy/rollback plan | Operational safety |
| **Q-01** | Test infrastructure | Quality baseline |
| **Q-02** | Unit tests for adapters | Regression safety |
| **Q-03** | API integration tests | Side-effect correctness |
| **Q-04** | E2e tests for critical flows | User-facing regression safety |
| **DB-01** | Index on Task.due | Performance |
| **DB-02** | ExternalId on InboxEmail | Dedup reliability |
| **DB-05** | AgentConfig table | Agent management |
| **AG-01** | Agent pause/resume | Operational control |
| **C-04** | Notification system | User engagement |

**Additional count: ~45 items (total ~76 for external release)**

---

## Top 15 Highest-Leverage Tasks Overall

These are ordered by impact-to-effort ratio and architectural unblocking power:

| Rank | ID | Title | Why Highest Leverage |
|------|-----|-------|---------------------|
| 1 | **F-01** | Define missing CSS variables | 30 seconds of CSS fixes 72 broken references across 13 files |
| 2 | **T-01** | Create Prisma-to-UI adapter | Single module unblocks connecting every page to the database |
| 3 | **E2-01** | Wire Queue page to API | Proves the full data architecture; pattern for all 10 other pages |
| 4 | **A-01** | Implement NextAuth | Unblocks all auth, user identity, and security work |
| 5 | **F-02** | Fix hardcoded meeting date | 1-line fix; Home meetings show correctly forever |
| 6 | **T-05** | Remove data.ts as primary source | Eliminates the split-brain root cause |
| 7 | **A-02** | Auth middleware on all routes | Single middleware file secures 13 API routes |
| 8 | **UX-01** | Loading skeletons | One reusable component improves perceived quality of every page |
| 9 | **UX-03** | Toast notifications | One component provides feedback for every mutation |
| 10 | **API-01** | Input validation (Zod) | Prevents entire class of data corruption bugs across all routes |
| 11 | **S-13** | Env var validation at startup | Prevents hours of debugging cryptic runtime errors |
| 12 | **DB-05** | AgentConfig table | Unblocks real Settings page, agent pause/resume, future agent work |
| 13 | **O-01** | Health check endpoint | 1 hour of work; enables all monitoring and deploy verification |
| 14 | **Q-01** | Test infrastructure setup | Unblocks all future testing; 2 hours enables the entire QA epic |
| 15 | **E2-02** | Wire Home page to API | Highest-traffic page showing real data validates the entire system |

---

## Idea List: API Enhancements

> Future API ideas to consider — not prioritized, not committed.

| Idea | Description | Notes |
|------|-------------|-------|
| Full-text search API | `/api/search?q=` endpoint searching across accounts, opps, leads, signals, tasks | Would power CommandPalette server-side search; use Prisma full-text or pg_trgm |
| Bulk operations API | Batch approve/reject/archive endpoints for queue, inbox, leads | Speeds up power-user workflows; single transaction for consistency |
| Dashboard analytics API | `/api/analytics` with aggregated pipeline metrics, conversion rates, velocity | Powers Home page charts with real computed data |
| Webhook system | Outgoing webhooks on key events (deal closed, lead created, signal detected) | Enables integration with Slack, Teams, external CRMs |
| CSV/Excel export | `/api/export?entity=accounts&format=csv` | Common CRM need; use streaming response for large datasets |
| Activity feed API | Unified `/api/feed` across all entity types with cursor pagination | Powers a global activity timeline / notification center |
| AI summary endpoints | `/api/ai/account-summary`, `/api/ai/deal-risk` | Leverage LLM for account briefs, deal risk analysis, meeting prep |
| Rate limiting | Per-user rate limits on mutation endpoints | Security + fair usage before multi-tenant |
| API versioning | `/api/v1/` prefix with version negotiation | Future-proofing before external release |
| GraphQL layer | Optional GraphQL gateway over REST | Reduces over-fetching for complex dashboard views |
