# SSE Real-Time Notifications & Enhanced Dropdown

**Date:** 2026-03-15
**Status:** Approved

## Overview

Add real-time notification delivery via Server-Sent Events (SSE) and enhance the notification dropdown with filtering and pagination. Replaces the current 30-second polling approach.

## Scope

- SSE streaming endpoint for real-time push
- In-memory pub/sub for notification delivery
- Client-side EventSource hook replacing polling
- Enhanced dropdown with filter tabs and load-more pagination
- API query param additions for filtering

**Out of scope:** Resend email integration, full `/notifications` history page.

## 1. SSE Real-Time Streaming

### Server: `GET /api/notifications/stream`

- Returns `ReadableStream` with `Content-Type: text/event-stream`
- Module-level singleton: `Map<string, Set<ReadableStreamDefaultController>>` keyed by userId
- Authenticated via session cookies (same NextAuth flow as other routes; EventSource sends cookies automatically — no custom headers needed)
- Events emitted:
  - `notification` — full notification object JSON (on new notification)
  - `badge` — updated badge count object (alongside each notification)
- Heartbeat every 30 seconds as SSE comment (`: ping\n\n`) to keep connection alive
- On client disconnect: controller removed from the user's set
- On connection: controller added to the user's set

### Pub/Sub Module: `src/lib/notifications-pubsub.ts`

```typescript
// Module-level singleton
const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();

export function subscribe(userId: string, controller: ReadableStreamDefaultController): void;
export function unsubscribe(userId: string, controller: ReadableStreamDefaultController): void;
export function publishToUser(userId: string, event: string, data: unknown): void;
// Single-server only. For horizontal scaling, swap to Redis pub/sub.
```

### Integration with `createNotification()`

In `src/lib/notifications.ts`, after the DB insert in `createNotification()`:
1. **Only if the insert succeeded** (function returns non-null — it returns `null` on dedup):
2. Call `publishToUser(userId, 'notification', notificationWithActor)`
3. Query fresh badge counts for the user
4. Call `publishToUser(userId, 'badge', badgeCounts)`

Note: `notifyUsers()` delegates to `createNotification()` in a loop, so pub/sub integration only needs to be in `createNotification()` — not in both functions.

### Client: `useNotificationStream()` Hook

- Located in `src/lib/queries/notifications.ts`
- Opens `EventSource` to `/api/notifications/stream`
- On `notification` event: invalidates via `notificationKeys.list()` (`['notifications', 'list']`) — React Query prefix matching ensures all list queries refresh
- On `badge` event: updates `badgeKeys.all` (`['badge-counts']`) via `setQueryData`
- Removes the 30-second `refetchInterval` from `useBadgeCounts`
- **Mounted in the layout** (not inside the dropdown) so the SSE connection stays open regardless of dropdown open/close state
- EventSource auto-reconnects on disconnect (built-in browser behavior)
- Falls back to 30s polling if SSE connection fires 3 consecutive `onerror` events

## 2. Enhanced Notification Dropdown

### API Changes: `GET /api/notifications`

Add optional query parameters:
- `readStatus` — `"unread"` or `"all"` (default: `"all"`)
- `type` — comma-separated `NotificationType` values (e.g., `"TASK_ASSIGNED,MENTION"`)

Filtering applied as additional `where` clauses on the existing Prisma query.

### UI: Filter Tabs

Row of filter chips at the top of the dropdown:
- **All** (default) — no filter
- **Unread** — `readStatus=unread`
- **Queue** — `type=QUEUE_ITEM`
- **Tasks** — `type=TASK_ASSIGNED,TASK_DUE,TASK_OVERDUE`
- **Mentions** — `type=MENTION`

Active filter visually highlighted. Selecting a filter refetches with updated params.

### UI: Load More Pagination

- "Load more" button at the bottom of the dropdown list
- Visible when the API returns a `nextCursor`
- Clicking appends next page to the existing list (React Query infinite query or manual append)
- Initial fetch: 20 items (existing `limit = 20` in the API route)
- Remove the existing `.slice(0, 10)` in the dropdown component to show all fetched items

### UI: Type Icons

Each notification gets a contextual icon based on its type:
- `QUEUE_ITEM` — inbox/tray icon
- `TASK_ASSIGNED` — clipboard/check icon
- `TASK_DUE` / `TASK_OVERDUE` — clock/alert icon
- `MENTION` — at-sign icon

Displayed alongside the actor avatar, not replacing it.

### Mark All Read

"Mark all as read" applies to the current filter scope:
- If viewing "Unread" filter: marks all unread as read
- If viewing "Tasks" filter: marks all task notifications as read
- API already supports `{ all: true }` — extend body to accept: `{ all: true, types?: NotificationType[] }`
- When `types` is provided, only mark matching notifications as read

## 3. Files to Create/Modify

### New Files
- `src/lib/notifications-pubsub.ts` — in-memory pub/sub singleton
- `src/app/api/notifications/stream/route.ts` — SSE endpoint

### Modified Files
- `src/lib/notifications.ts` — integrate pub/sub publish after createNotification
- `src/lib/queries/notifications.ts` — add `useNotificationStream` hook, update query params
- `src/lib/api-client.ts` — add filter params to notification fetch
- `src/app/api/notifications/route.ts` — add readStatus/type query param filtering
- `src/app/api/notifications/mark-read/route.ts` — support type-scoped mark-all
- `src/components/layout/NotificationDropdown.tsx` — filter tabs, load more, type icons

## 4. Error Handling

- SSE endpoint: if auth fails, return 401 (not a stream)
- SSE connection loss: EventSource auto-reconnects; after 3 failures, fall back to 30s polling
- Pub/sub publish failures: log and continue (never block the notification creation flow)
- Filter API: invalid type values ignored (return empty results)
