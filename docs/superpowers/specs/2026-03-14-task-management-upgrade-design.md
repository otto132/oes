# Task Management Upgrade — Design Spec

**Date:** 2026-03-14
**Scope:** Approach C — Essentials + Subtasks

## Overview

Upgrade the existing task management system from a basic flat task list to a grouped, collaborative, mobile-accessible system with subtasks. The existing schema already supports multi-assignee, reviewers, goals, and comment mentions — this work focuses on surfacing those capabilities in the UI and adding subtasks.

## 1. Mobile Bottom Nav

### Change
Replace the **More** (Settings) slot in `BottomNav.tsx` with **Tasks**.

### Details
- Bottom nav becomes: **Home | Queue | Pipeline | Inbox | Tasks**
- Tasks icon: `CheckSquare` (matches sidebar)
- Badge: count of tasks due today or overdue, assigned to or owned by current user
- Settings access moves to the sidebar/hamburger menu (already accessible there)
- Safe area inset handling preserved

### Files affected
- `src/components/layout/BottomNav.tsx` — replace More with Tasks
- `src/app/api/badge-counts/route.ts` — the endpoint already returns a `tasks` count, but the current query counts all overdue tasks globally. **Fix:** scope the query to tasks where the current user is an assignee or owner, status != Done, due <= today. The BottomNav component needs to consume the existing `tasks` badge key (currently only maps `queue` and `inbox`).
- Sidebar already has Settings link — no change needed

## 2. Goal Grouping

### Change
The task list already groups tasks under their parent goal (see existing `goalTasks`/`ungrouped` logic in `page.tsx`). This section adds a grouped/flat toggle, goal status badges, and refined sorting.

### Details
- **Existing:** Goal grouping with collapsible sections and progress bars already implemented
- **New: Grouped/Flat toggle** at the top of the task list to switch between grouped view (default) and flat view (sorted by due date regardless of goal)
- **New: Goal status badge** on each section header (active, completed, archived)
- **New: Priority-based sort within groups** — tasks sort by priority (High > Medium > Low), then due date (soonest first). Current sort is overdue-first then due date only.
- **New: Collapse state** — goal sections default to expanded; collapse state is ephemeral (resets on page reload)
- Search and completed-tasks toggle continue to work within grouped layout
- View preference (grouped/flat) persisted in Zustand store (not server-side)

### API changes
- No backend change needed — grouping is a frontend concern

### Files affected
- `src/app/(dashboard)/tasks/page.tsx` — add toggle, goal status badge, priority sort within groups
- `src/lib/store.ts` — add `taskViewMode: 'grouped' | 'flat'` preference

## 3. Better @Mention UX

### Change
Polished mention autocomplete in comments, with visual mention rendering.

### Details

**Autocomplete dropdown:**
- Triggers on `@` character typed in comment input
- Dropdown shows team members filtered by text after `@`
- Each row: avatar + name + role
- Keyboard navigable: arrow keys to move, Enter to select, Escape to dismiss
- Selecting inserts `@Name` into the comment text and adds user ID to `mentions` array
- Reusable `UserMentionInput` component (shared with assignment picker)

**Visual mention rendering:**
- In rendered comments, mentioned names display as styled inline chips
- Highlighted background (using theme accent color), slightly bold
- Non-interactive (no popover on click — keep it simple)

**Backend:**
- The comment action schema already has a `mentionedUserIds` field but the route handler ignores it, instead regex-parsing `@word` from comment text and looking up users by name
- **Change:** Update the comment handler in `src/app/api/tasks/route.ts` to use the `mentionedUserIds` array from the request body for notification targeting, instead of regex name matching. This is required for the ID-based mention flow to work correctly.
- **Semantic change:** The `mentions` field on `TaskComment` currently stores name strings (e.g., `["Nick"]`) from regex parsing. After this change, it will store user IDs instead. The frontend must resolve IDs to names for display (the task query already includes assignee/reviewer user objects — mention rendering can use the same user data). Existing comments with name-based mentions will need a simple fallback: if a mention value doesn't match a user ID, render it as-is (the old name string).

### Files affected
- New: `src/components/ui/UserMentionInput.tsx` — mention-aware text input
- New: `src/components/ui/UserPicker.tsx` — shared dropdown for picking team members
- `src/app/api/tasks/route.ts` — update comment handler to use `mentionedUserIds` from request body
- `src/app/(dashboard)/tasks/page.tsx` — use `UserMentionInput` for comments, render mention chips

## 4. Easier Assignment

### Change
Avatar-chip based assignee picker, plus quick-assign from the task list.

### Details

**Assignee picker in task drawer:**
- Shows assigned users as avatar chips with `x` to remove
- `+` button opens `UserPicker` dropdown (same component as mention autocomplete)
- Click to add, `x` to remove — no modal

**Quick-assign from task list:**
- Task row shows assignee avatars (already partially implemented)
- A `+` avatar placeholder at the end opens the `UserPicker` inline
- Assigning triggers `PATCH /api/tasks/[id]` with updated `assigneeIds`
- Optimistic update via existing `useUpdateTask` mutation

**Reviewer shortcut:**
- When clicking "Send for Review" and no reviewer is set, a `UserPicker` dropdown appears inline asking to select a reviewer first
- Once selected, both the reviewer assignment and status change happen in one action

### Files affected
- `src/components/ui/UserPicker.tsx` — shared user selection component
- `src/app/(dashboard)/tasks/page.tsx` — integrate quick-assign in task rows, reviewer shortcut

## 5. Due Date Reminders

### Change
Visual urgency indicators in the task list and notification triggers for due/overdue tasks.

### Details

**Visual indicators on task rows:**
- Due today: amber badge showing "Today"
- Overdue: red badge showing "Overdue" (or "2d overdue" with day count)
- Due tomorrow: subtle gray label "Tomorrow"
- Applied in both grouped and flat views

**Sorting boost:**
- Within each priority group, overdue and due-today tasks float to the top
- Sort order: overdue (oldest first) > due today > due tomorrow > rest by due date

**Notifications (server-side):**
- Implemented as a dedicated `POST /api/tasks/check-due` endpoint, called at most once per browser session (tracked via `sessionStorage` flag; triggered by client on initial task page load)
- Queries tasks where due <= today, status != Done, and no existing unread `TASK_DUE`/`TASK_OVERDUE` notification for that task
- Generates `TASK_DUE` (due today) and `TASK_OVERDUE` (past due) notifications for assignees + owner
- Deduplication: keyed on `entityId` (task ID) + `type` — `createNotification` already skips if an unread notification of the same type+entity exists
- Uses existing `notifyUsers()` infrastructure, appears in Inbox

### API changes
- Add `TASK_DUE` and `TASK_OVERDUE` to the `NotificationType` enum in `prisma/schema.prisma`
- New `POST /api/tasks/check-due` endpoint for due-date notification generation

### Files affected
- `prisma/schema.prisma` — add `TASK_DUE`, `TASK_OVERDUE` to `NotificationType` enum
- New: `src/app/api/tasks/check-due/route.ts` — due-date notification endpoint
- `src/app/(dashboard)/tasks/page.tsx` — add urgency badges, sorting boost, trigger check-due on mount

## 6. Subtasks

### Change
New `Subtask` model allowing tasks to have a checklist of smaller items.

### Schema

```prisma
model Subtask {
  id        String   @id @default(cuid())
  title     String
  done      Boolean  @default(false)
  position  Int      @default(0)
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  taskId    String
  createdAt DateTime @default(now())

  @@index([taskId])
}
```

Add to `Task` model:
```prisma
subtasks  Subtask[]
```

### UI — Task detail/edit drawer
- "Subtasks" section below the notes field
- Each subtask: checkbox + text, click checkbox to toggle `done`
- Inline text input at bottom: type + Enter to add
- `x` button to delete
- Up/down arrow buttons to reorder (updates `position`). No drag-and-drop library needed.

### Task list indicator
- Tasks with subtasks show a small `3/5` progress badge on the task row
- Calculated from subtask done/total counts

### API
- Subtasks managed via `PATCH /api/tasks/[id]` with a `subtasks` field
- Accepts array of `{ id?, title, done, position }` — create if no id, update if id exists
- Deletions: any existing subtask IDs not in the array are deleted
- `GET /api/tasks` includes subtask counts (`subtasksDone`, `subtasksTotal`) for list display
- Full subtask details included when fetching a single task for the drawer

### Validation
Add to `src/lib/schemas/tasks.ts`:
```typescript
const subtaskSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(200),
  done: z.boolean(),
  position: z.number().int().min(0),
});

// Add to patchTaskSchema:
subtasks: z.array(subtaskSchema).max(20).optional()
```
- Max 20 subtasks per task
- Title required, max 200 chars

### Optimistic updates
- Subtask checkbox toggles use optimistic updates via the existing React Query mutation pattern
- Rapid toggles are debounced to batch subtask changes into a single PATCH request

### Files affected
- `prisma/schema.prisma` — new `Subtask` model, relation on `Task`
- `src/app/api/tasks/[id]/route.ts` — handle subtasks in PATCH
- `src/app/api/tasks/route.ts` — include subtask counts in GET
- `src/lib/schemas/tasks.ts` — add subtask validation
- `src/lib/types.ts` — add `Subtask` type, update `Task` type
- `src/lib/adapters.ts` — add `adaptSubtask()`, update `adaptTask()`
- `src/lib/queries/tasks.ts` — update query types
- `src/app/(dashboard)/tasks/page.tsx` — subtask UI in drawer, progress badge in list

## Shared Components

Two new reusable components extracted from this work:

| Component | Purpose | Used by |
|-----------|---------|---------|
| `UserPicker` | Dropdown for selecting team members (avatar + name + role, filterable) | Assignment picker, reviewer shortcut, mention autocomplete |
| `UserMentionInput` | Text input with `@` trigger that opens `UserPicker` inline | Comment input |

Both live in `src/components/ui/`.

## Testing

- Unit tests: new API logic for subtasks, due-date notifications, subtask validation
- Update existing task API tests for new fields
- E2E: extend `e2e/task-lifecycle.spec.ts` with subtask creation, goal grouping, quick-assign, mention autocomplete
- Mobile viewport E2E test for bottom nav Tasks link

## Migration

- One Prisma migration for the new `Subtask` model
- No data migration needed — existing tasks simply have zero subtasks
- Notification type additions are additive (no breaking changes)
