# Commercial Readiness: Admin Health Dashboard + Notification System

> **Backlog items:** C-03 (Admin Dashboard for System Health), C-04 (Notification System)
> **Date:** 2026-03-14
> **Status:** Design

---

## Overview

Two features that give admins visibility into system state and give all users awareness of events that need their attention.

- **C-03:** Dedicated `/admin` page showing user counts, entity totals, queue health, sync status, agent status, and recent errors.
- **C-04:** In-app notification system with bell icon dropdown, polling for unread count, and server-side notification creation on key events.

---

## Data Model

### Notification Model

```prisma
enum NotificationType {
  QUEUE_ITEM
  TASK_ASSIGNED
  MENTION
}

model Notification {
  id         String           @id @default(cuid())
  userId     String
  user       User             @relation("notifications", fields: [userId], references: [id], onDelete: Cascade)
  actorId    String?
  actor      User?            @relation("notificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  type       NotificationType
  title      String
  message    String
  entityType String?          // "QueueItem" | "Task" | "TaskComment"
  entityId   String?
  readAt     DateTime?
  createdAt  DateTime         @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("notifications")
}
```

Add two relation lists to the `User` model:

```prisma
notifications      Notification[] @relation("notifications")
actedNotifications Notification[] @relation("notificationActor")
```

No new model needed for admin health — it queries existing tables.

---

## C-03: Admin Health Dashboard

### Route

`/admin` — dedicated page under the dashboard layout. Admin-only access.

### Sidebar

Add an "Admin" link in the sidebar, visible only when `session.user.role === 'ADMIN'`. Use `Shield` Lucide icon. Place below Settings.

### API

**`GET /api/admin/stats`**

Returns 403 for non-admin users. Response shape:

```ts
interface AdminStats {
  db: "connected" | "error";
  users: {
    total: number;
    active: number;  // logged in within last 7 days
  };
  entities: {
    accounts: number;
    leads: number;
    opportunities: number;
    tasks: number;
    contacts: number;
  };
  queue: {
    pending: number;
    total: number;
  };
  sync: {
    lastRun: {
      status: string;
      completedAt: string;
      itemsSynced: number;
      errors: number;
    } | null;
  };
  agents: {
    lastRuns: {
      agentName: string;
      status: string;
      completedAt: string;
    }[];
  };
  recentErrors: {
    source: "sync" | "agent";
    agentName?: string;
    message: string;
    createdAt: string;
  }[];
}
```

Implementation: Single Prisma transaction with parallel count queries for entities, `findFirst` for last sync, `groupBy` for agent last runs, and a union query for recent errors (last 10 from SyncLog + AgentRun where status is error).

Note: `SyncLog.errors` is `String[]` while `AgentRun.errors` is `Json` (defaults to `"[]"`). Normalize both to `{ message, createdAt }` when building the errors list.

DB health: wrap the query block in try/catch; if it throws, return `db: "error"`.

### UI Layout

Card grid with the following sections:

1. **Database Status** — green/red badge
2. **Users** — total count, active count (last 7 days)
3. **Entity Counts** — accounts, leads, opportunities, tasks, contacts in a compact grid
4. **Queue Health** — pending count with link to `/queue`, total count
5. **Sync Status** — last run time (relative, e.g., "12 minutes ago"), status badge, items synced, error count
6. **Agent Status** — one row per agent showing name, last run time (relative), status badge
7. **Recent Errors** — scrollable list grouped by source (sync/agent), showing message and relative timestamp

### Empty States

- No sync history: "No sync history — connect Outlook in Settings"
- No agent runs: "No agent runs recorded yet"
- No errors: "No recent errors" (green indicator)

### Auto-refresh

Use React Query `refetchInterval: 30_000` (30 seconds) so the dashboard stays live.

### Access Control

- Page: check `session.user.role === 'ADMIN'` in the component, redirect to `/` if not admin
- API: check role in handler, return `forbidden()` if not admin

---

## C-04: Notification System

### API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/notifications` | List notifications for current user, newest first, limit 20 |
| `PATCH` | `/api/notifications/mark-read` | Mark notifications as read |

**`GET /api/notifications`**

Query params: `cursor` (optional, for pagination). Returns:

```ts
{
  notifications: {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    entityType: string | null;
    entityId: string | null;
    readAt: string | null;
    createdAt: string;
    actor: { id: string; name: string; image: string | null } | null;
  }[];
  nextCursor: string | null;
}
```

Includes a cleanup step: delete notifications older than 90 days for the current user (`WHERE createdAt < NOW() - 90 days AND userId = currentUser`). Run inline on fetch — no separate cron needed.

**`PATCH /api/notifications/mark-read`**

Body: `{ ids: string[] }` or `{ all: true }`. Sets `readAt = now()` on matching notifications owned by the current user.

### Unread Count

Add notification unread count to the existing badge-counts endpoint (`/api/badge-counts` or equivalent). This avoids a separate polling endpoint. The TopBar already consumes badge counts — just add `notifications: number` to the response.

### `createNotification()` Utility

Location: `src/lib/notifications.ts`

```ts
async function createNotification(
  db: PrismaClient,
  params: {
    userId: string;
    actorId?: string;
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
  }
): Promise<Notification | null>
```

**Dedup logic:** Before creating, check for an existing unread notification with the same `userId + entityType + entityId + type`. If found, skip creation and return `null`. Once the user reads the existing notification, a new one can be created if the event fires again.

**Tenant scoping:** All queries go through the tenant-resolved Prisma client passed as `db`.

### Notification Triggers

Called from existing API route handlers:

1. **Queue item creation** (`POST /api/queue` or wherever queue items are created):
   - Notify all ADMIN users
   - Type: `QUEUE_ITEM`
   - Title: "New queue item"
   - Message: summary of the queue item
   - EntityType: `"QueueItem"`, EntityId: the queue item ID

2. **Task assignment** (`POST /api/tasks` or `PATCH /api/tasks/:id`):
   - Notify each assignee (skip the actor — don't notify yourself)
   - Type: `TASK_ASSIGNED`
   - Title: "Task assigned to you"
   - Message: task title
   - EntityType: `"Task"`, EntityId: the task ID

3. **Mention in task comment** (when a comment is created with mentions):
   - Notify each mentioned user (skip the actor)
   - Mentions are stored as `String[]` in `TaskComment.mentions` — resolve each to a userId via `User.name` lookup
   - Type: `MENTION`
   - Title: "You were mentioned"
   - Message: truncated comment text
   - EntityType: `"TaskComment"`, EntityId: the comment ID

### TopBar UI Changes

Replace the current bell icon (which links to `/queue`) with a notification dropdown:

**Bell icon behavior:**
- Shows unread count badge (red dot or number) from badge-counts
- Click → opens dropdown panel (not a new page)
- Click outside → closes dropdown

**Dropdown content:**
- Header: "Notifications" + "Mark all as read" link
- List of last 10 notifications, each showing:
  - Actor initial/avatar (colored circle with first letter)
  - Title + message (truncated)
  - Relative timestamp ("2m ago", "1h ago")
  - Unread indicator (dot) if `readAt` is null
- Clicking a notification: marks it as read AND navigates to the relevant page based on `entityType`:
  - `QueueItem` → `/queue`
  - `Task` → `/tasks`
  - `TaskComment` → `/tasks`
- Empty state: "No notifications yet"

**Navigation URL mapping:**

```ts
function getNotificationUrl(entityType: string | null): string {
  switch (entityType) {
    case "QueueItem": return "/queue";
    case "Task":
    case "TaskComment": return "/tasks";
    default: return "/";
  }
}
```

### React Query Hooks

Location: `src/lib/queries/notifications.ts`

- `useNotificationsQuery()` — fetches `GET /api/notifications`, used by dropdown
- `useMarkReadMutation()` — calls `PATCH /api/notifications/mark-read`

Unread count comes from the existing badge-counts hook (extended to include notifications).

Polling: badge-counts already polls; no additional polling needed. The dropdown fetches on open.

---

## Shared Patterns

### Admin Route Protection

Both the admin page and the admin stats API check `session.user.role === 'ADMIN'`. Use the existing `forbidden()` helper from `src/lib/api-errors.ts` for the API. For the page, check in the component and redirect.

### Tenant Scoping

Both features use `resolveTenantDb(session)` for all database access, consistent with the rest of the codebase.

### Relative Time Formatting

Both features display relative timestamps ("5 minutes ago"). Create a small `formatRelativeTime(date: Date): string` utility in `src/lib/utils.ts` (or extend existing utils) shared by both the admin dashboard and notification dropdown.

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/admin/page.tsx` | Admin health dashboard page |
| `src/app/api/admin/stats/route.ts` | Admin stats API endpoint |
| `src/app/api/notifications/route.ts` | GET notifications list |
| `src/app/api/notifications/mark-read/route.ts` | PATCH mark notifications as read |
| `src/lib/notifications.ts` | `createNotification()` utility with dedup |
| `src/lib/queries/notifications.ts` | React Query hooks for notifications |
| `src/lib/queries/admin.ts` | React Query hook for admin stats |
| `src/components/layout/NotificationDropdown.tsx` | Bell icon dropdown component |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `NotificationType` enum, `Notification` model, User relations |
| `src/components/layout/TopBar.tsx` | Replace bell link with `NotificationDropdown` |
| `src/components/layout/Sidebar.tsx` | Add Admin link for admin users |
| `src/lib/queries/badge-counts.ts` | Add notification unread count |
| `src/app/api/badge-counts/route.ts` (or equivalent) | Include notification count in response |
| Queue item creation route | Call `createNotification()` |
| Task creation/update route | Call `createNotification()` on assignment |
| Task comment creation route | Call `createNotification()` on mention |

### Migration

One Prisma migration: adds `NotificationType` enum and `Notification` table with indexes.

---

## Acceptance Criteria

### C-03: Admin Health Dashboard

- [ ] `/admin` page accessible only to ADMIN users
- [ ] Non-admins redirected to `/`
- [ ] Dashboard shows: active users, pending queue items, last sync status, total records per entity, recent errors
- [ ] DB connection status displayed
- [ ] Errors grouped by source (sync/agent)
- [ ] All timestamps shown as relative time
- [ ] Auto-refreshes every 30 seconds
- [ ] Empty states shown when no data exists
- [ ] Admin link visible in sidebar for admin users only

### C-04: Notification System

- [ ] Bell icon in TopBar opens notification dropdown
- [ ] Unread count badge shown on bell icon
- [ ] Dropdown shows last 10 notifications with actor, title, message, relative time
- [ ] Clicking notification marks as read and navigates to relevant page
- [ ] "Mark all as read" clears all unread notifications
- [ ] Notifications created on: queue item creation (admins), task assignment (assignees), mention in comment (mentioned users)
- [ ] Self-notifications skipped (actor not notified of own actions)
- [ ] Dedup: no duplicate unread notification for same entity+type+user
- [ ] Notifications older than 90 days auto-cleaned on fetch
- [ ] Empty state: "No notifications yet"
