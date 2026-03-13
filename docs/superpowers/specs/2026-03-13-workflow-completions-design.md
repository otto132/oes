# Workflow Completions Design Spec

> W-08, W-10, W-12, W-13 — Drawer-based CRUD forms for task completion, contact creation, and inbox actions

## Context

All data-fetching pages are wired to APIs. Core CRUD drawers (account create, opp create, activity log, close won/lost) are shipped. Four workflow gaps remain where UI buttons exist but aren't wired to drawer forms.

## W-08: Task Complete with Follow-ups

**Trigger:** Click task checkbox on Tasks page.

**Drawer content:**
- Title: "Complete Task" / Subtitle: task title
- Outcome dropdown: Completed (default), Deferred, Cancelled
- Notes textarea (optional)
- Follow-up tasks section:
  - Title input + "Add" button
  - List of added follow-ups with remove button
- Footer: Cancel + "Complete Task" primary button

**Mutation:** `completeTask.mutate({ id, data: { outcome, notes, followUpTasks } })`

**Existing API support:** `POST /api/tasks` with `action: 'complete'` already accepts `outcome`, `notes`, `followUpTasks` array. Creates activity log, bumps engagement health +10, auto-creates follow-up tasks.

**Cache invalidation:** `taskKeys.all` (already in hook).

**Toast:** "Task completed" with `{ label: 'View Tasks →', href: '/tasks' }`.

## W-10: Contact Create within Account

**Trigger:** "Add Contact" button in Contacts tab on account detail page.

**Drawer content:**
- Title: "Add Contact" / Subtitle: account name
- Name input (required)
- Title input (job title)
- Role dropdown: Champion, Economic Buyer, Technical Buyer, Influencer, Blocker
- Warmth dropdown: Strong, Warm, Cold
- Email input
- Phone input
- Footer: Cancel + "Add Contact" primary button

**New API route needed:** `POST /api/accounts/[id]/contacts/route.ts`
- Validates: name required
- Creates Contact record linked to accountId
- Returns 201 with created contact

**New mutation hook:** `useCreateContact()` in `src/lib/queries/accounts.ts`
- `mutationFn: ({ accountId, data }) => api.post(`/api/accounts/${accountId}/contacts`, data)`
- `onSuccess`: invalidate `accountKeys.detail(accountId)`

**Toast:** "Contact added" (no navigation link needed — already on account page).

## W-12: Inbox Create Task from Email

**Trigger:** Wire existing "Create Task" button in email detail drawer.

**Drawer content:**
- Title: "Create Task from Email" / Subtitle: email subject
- Title input: pre-filled with email subject (editable)
- Account dropdown: pre-selected if email is linked to account, otherwise selectable
- Due date input: pre-filled with +2 days from today
- Priority dropdown: Medium (default), High, Low
- Notes textarea: pre-filled with "From email: [sender name]"
- Footer: Cancel + "Create Task" primary button

**API:** Uses existing inbox API `action: 'create_task'` which creates task with email subject, 2-day due, inbox source. However, the current API is simple (no editable fields). Two options:

**Approach:** Call the existing tasks API (`POST /api/tasks` with `action: 'create'`) directly with the edited form data, plus mark the email as actioned. This gives full control over task fields.

**Mutation:** `createTask.mutate(formData)` from `useCreateTask()` (already exists in queries/tasks.ts).

**Cache invalidation:** `taskKeys.all` + `inboxKeys.all`.

**Toast:** "Task created" with `{ label: 'View Tasks →', href: '/tasks' }`.

## W-13: Inbox Create Account from New Domain Email

**Trigger:** "Create Account" button added to `new_domain` AI suggestion box in email drawer.

**Drawer content:**
- Title: "Create Account from Email" / Subtitle: sender domain
- Company name input: pre-filled with domain-derived name (capitalize first letter of domain without TLD)
- Type dropdown: Unknown (default), PPA Buyer, Certificate Trader, Corporate Offtaker
- Country dropdown: Finland, Denmark, Germany, Sweden, Norway, Other
- Notes textarea (optional)
- Footer: Cancel + "Create Account" primary button

**API:** Uses existing `POST /api/inbox` with `action: 'create_account'` which creates account + contact from email sender + links email.

**Mutation:** `useCreateAccountFromEmail()` (already exists in queries/inbox.ts).

**Cache invalidation:** `inboxKeys.all` + `accountKeys.all`.

**Toast:** "Account created" with `{ label: 'View Account →', href: '/accounts' }`.

## Shared Patterns

All drawers follow the established pattern:
1. `openDrawer({ title, subtitle, body: <FormJSX />, footer: <Buttons /> })`
2. Local state object for form fields
3. Mutation hook with `isPending` for button disable
4. `addToast()` on success with optional action link
5. `closeDrawer()` on cancel or success
6. Cmd/Ctrl+Enter keyboard shortcut for submit

## Files Changed

| File | Change |
|------|--------|
| `src/app/(dashboard)/tasks/page.tsx` | Add `openCompleteDrawer()`, wire checkbox click |
| `src/app/(dashboard)/accounts/[id]/page.tsx` | Add `openAddContactDrawer()`, add "Add Contact" button |
| `src/app/api/accounts/[id]/contacts/route.ts` | New: POST handler for contact creation |
| `src/lib/queries/accounts.ts` | Add `useCreateContact()` hook |
| `src/app/(dashboard)/inbox/page.tsx` | Wire "Create Task" button, add "Create Account" button to new_domain box |

## Out of Scope

- Contact editing/deletion (future W-10 extension)
- Drag-and-drop task reordering
- Bulk task completion
- Email threading/conversation view
