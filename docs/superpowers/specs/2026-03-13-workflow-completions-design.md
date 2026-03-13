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
  - Title input (required if adding) + "Add" button
  - List of added follow-ups with remove button
- Footer: Cancel + "Complete Task" primary button

**Mutation:** `completeTask.mutate({ id, data: { outcome, notes, followUpTasks } })` — note: the hook spreads `data` flat into the POST body alongside `action: 'complete'` and `id`.

**Outcome semantics:** All outcomes (Completed/Deferred/Cancelled) set task status to Done. The outcome value is informational, stored in the activity log entry. This matches the existing API behavior.

**Existing API support:** `POST /api/tasks` with `action: 'complete'` already accepts `outcome`, `notes`, `followUpTasks` array. Creates activity log, bumps engagement health +10, auto-creates follow-up tasks.

**Cache invalidation:** `taskKeys.all` (already in hook).

**Toast:** "Task completed" with `{ label: 'View Tasks →', href: '/tasks' }`.

**Error handling:** `onError` → toast "Failed to complete task".

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
- Uses `api.post()` directly: `api.post('/api/accounts/${accountId}/contacts', data)`
- `onSuccess`: invalidate `accountKeys.detail(accountId)`

**Toast:** "Contact added" (no navigation link needed — already on account page).

**Error handling:** `onError` → toast "Failed to add contact".

## W-12: Inbox Create Task from Email

**Trigger:** Wire existing "Create Task" button in email detail drawer.

**Drawer content:**
- Title: "Create Task from Email" / Subtitle: email subject
- Title input: pre-filled with email subject (editable)
- Account dropdown: pre-selected if email is linked to account, otherwise selectable
- Due date input: pre-filled with +2 days from today
- Priority dropdown: Medium (default), High, Low
- Footer: Cancel + "Create Task" primary button

**Approach:** Use the existing `useCreateTask()` hook which calls `POST /api/tasks` with `action: 'create'`. This gives full control over task fields. The `notes` field is removed from the drawer since the API and hook type don't support it on creation.

**After task creation:** Call `markRead.mutate(emailId)` to mark the email as read (visual indicator that it's been actioned). No separate "actioned" state exists — read status serves this purpose.

**Mutation:** `createTask.mutate(formData)` from `useCreateTask()`.

**Cache invalidation:** `taskKeys.all` (from hook) + manually invalidate `inboxKeys.all` in the `onSuccess` callback at the call site.

**Toast:** "Task created" with `{ label: 'View Tasks →', href: '/tasks' }`.

**Error handling:** `onError` → toast "Failed to create task".

## W-13: Inbox Create Account from New Domain Email

**Trigger:** "Create Account" button added to `new_domain` AI suggestion box in email drawer.

**Simplified approach:** The existing `useCreateAccountFromEmail()` hook only accepts an email ID. Rather than extending the API to accept overrides, keep it simple: the button triggers the mutation directly (no drawer). The API derives company name from domain and creates the account + contact automatically.

**UX flow:**
1. User clicks "Create Account" on new_domain email
2. Mutation fires immediately (no drawer form)
3. Success toast: "Account created" with `{ label: 'View Account →', href: '/accounts' }`
4. If account already exists (API dedup): email is linked to existing account, toast says "Email linked to existing account"

**Mutation:** `useCreateAccountFromEmail()` (already exists in queries/inbox.ts).

**Cache invalidation:** `inboxKeys.all` (from hook) + add `accountKeys.all` invalidation to the hook's `onSuccess`.

**Error handling:** `onError` → toast "Failed to create account".

## Shared Patterns

All drawers follow the established pattern:
1. `openDrawer({ title, subtitle, body: <FormJSX />, footer: <Buttons /> })`
2. Local state object for form fields
3. Mutation hook with `isPending` for button disable
4. `addToast()` on success with optional action link
5. `closeDrawer()` on cancel or success
6. Cmd/Ctrl+Enter keyboard shortcut for submit
7. `onError` → error toast with generic message

## Files Changed

| File | Change |
|------|--------|
| `src/app/(dashboard)/tasks/page.tsx` | Add `openCompleteDrawer()`, wire checkbox click |
| `src/app/(dashboard)/accounts/[id]/page.tsx` | Add `openAddContactDrawer()`, add "Add Contact" button |
| `src/app/api/accounts/[id]/contacts/route.ts` | New: POST handler for contact creation |
| `src/lib/queries/accounts.ts` | Add `useCreateContact()` hook |
| `src/lib/queries/inbox.ts` | Add `accountKeys.all` invalidation to `useCreateAccountFromEmail` |
| `src/app/(dashboard)/inbox/page.tsx` | Wire "Create Task" button, add "Create Account" button to new_domain box |

## Out of Scope

- Contact editing/deletion (future W-10 extension)
- Drag-and-drop task reordering
- Bulk task completion
- Email threading/conversation view
- Editable fields on account-from-email (keep simple: auto-derive from domain)
