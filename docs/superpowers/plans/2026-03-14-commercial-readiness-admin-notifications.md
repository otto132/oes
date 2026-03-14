# Commercial Readiness: Admin Health Dashboard + Notification System

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin health dashboard (C-03) and in-app notification system (C-04) so admins can monitor system state and all users receive notifications for queue items, task assignments, and mentions.

**Architecture:** New `Notification` Prisma model with `createNotification()` utility called from existing API routes. Admin stats served by a single aggregate endpoint. TopBar bell icon replaced with notification dropdown. Badge counts extended with notification unread count.

**Tech Stack:** Next.js 15, Prisma, React Query, Zustand (toasts), Lucide icons, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-14-commercial-readiness-admin-notifications-design.md`

---

## Chunk 1: Data Model & Shared Utilities

### Task 1: Prisma Schema — Notification Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add NotificationType enum and Notification model to schema**

Add after the existing enums (near `Role` enum):

```prisma
enum NotificationType {
  QUEUE_ITEM
  TASK_ASSIGNED
  MENTION
}
```

Add the model (after existing models):

```prisma
model Notification {
  id         String           @id @default(cuid())
  userId     String
  user       User             @relation("notifications", fields: [userId], references: [id], onDelete: Cascade)
  actorId    String?
  actor      User?            @relation("notificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  type       NotificationType
  title      String
  message    String
  entityType String?
  entityId   String?
  readAt     DateTime?
  createdAt  DateTime         @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("notifications")
}
```

Add two relations to the `User` model (inside the existing relation list):

```prisma
  notifications      Notification[] @relation("notifications")
  actedNotifications Notification[] @relation("notificationActor")
```

- [ ] **Step 2: Generate and apply migration**

Run: `npx prisma migrate dev --name add-notification-model`
Expected: Migration created and applied successfully. Prisma Client regenerated.

- [ ] **Step 3: Verify schema compiles**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat(C-04): add Notification model and NotificationType enum"
```

---

### Task 2: Relative Time Utility

**Files:**
- Modify: `src/lib/adapters.ts` (add `formatRelativeTime` — adapters already handles data transformations)

- [ ] **Step 1: Add formatRelativeTime function**

Add at the bottom of `src/lib/adapters.ts`:

```ts
export function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const then = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(then).toLocaleDateString();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/adapters.ts
git commit -m "feat: add formatRelativeTime utility for admin dashboard and notifications"
```

---

### Task 3: createNotification Utility

**Files:**
- Create: `src/lib/notifications.ts`

- [ ] **Step 1: Create the notification utility with dedup**

```ts
import type { PrismaClient, NotificationType, Notification } from '@prisma/client';

interface CreateNotificationParams {
  userId: string;
  actorId?: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Create a notification for a user with dedup.
 * Returns null if an unread notification for the same entity+type+user already exists.
 */
export async function createNotification(
  db: PrismaClient,
  params: CreateNotificationParams,
): Promise<Notification | null> {
  // Dedup: skip if unread notification exists for same user+entity+type
  if (params.entityType && params.entityId) {
    const existing = await db.notification.findFirst({
      where: {
        userId: params.userId,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        readAt: null,
      },
    });
    if (existing) return null;
  }

  return db.notification.create({
    data: {
      userId: params.userId,
      actorId: params.actorId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType,
      entityId: params.entityId,
    },
  });
}

/**
 * Create notifications for multiple users (e.g., all admins).
 * Skips the actor (no self-notifications).
 */
export async function notifyUsers(
  db: PrismaClient,
  userIds: string[],
  actorId: string | undefined,
  params: Omit<CreateNotificationParams, 'userId' | 'actorId'>,
): Promise<void> {
  const targets = actorId ? userIds.filter((id) => id !== actorId) : userIds;
  await Promise.all(
    targets.map((userId) =>
      createNotification(db, { ...params, userId, actorId }),
    ),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notifications.ts
git commit -m "feat(C-04): add createNotification utility with dedup and bulk notify"
```

---

## Chunk 2: Admin Health Dashboard (C-03)

### Task 4: Admin Stats API

**Files:**
- Create: `src/app/api/admin/stats/route.ts`

- [ ] **Step 1: Create the admin stats endpoint**

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden } from '@/lib/api-errors';
import { resolveTenantDb } from '@/lib/tenant';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  if ((session.user as any).role !== 'ADMIN') return forbidden();

  const db = resolveTenantDb(session as any);

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      accountCount,
      leadCount,
      oppCount,
      taskCount,
      contactCount,
      pendingQueue,
      totalQueue,
      lastSync,
      agentLastRuns,
      syncErrors,
      agentErrors,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
      db.account.count(),
      db.lead.count(),
      db.opportunity.count(),
      db.task.count(),
      db.contact.count(),
      db.queueItem.count({ where: { status: 'pending' } }),
      db.queueItem.count(),
      db.syncLog.findFirst({ orderBy: { completedAt: 'desc' }, where: { completedAt: { not: null } } }),
      db.agentRun.findMany({
        where: { status: { not: 'running' } },
        distinct: ['agentName'],
        orderBy: { completedAt: 'desc' },
        select: { agentName: true, status: true, completedAt: true },
      }),
      db.syncLog.findMany({
        where: { status: { in: ['failed', 'partial'] } },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: { errors: true, completedAt: true, startedAt: true },
      }),
      db.agentRun.findMany({
        where: { status: 'failed' },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: { agentName: true, errors: true, completedAt: true },
      }),
    ]);

    // Normalize errors from both sources
    const recentErrors: { source: string; agentName?: string; message: string; createdAt: string }[] = [];

    for (const sl of syncErrors) {
      for (const errMsg of sl.errors) {
        recentErrors.push({
          source: 'sync',
          message: errMsg,
          createdAt: (sl.completedAt ?? sl.startedAt).toISOString(),
        });
      }
    }

    for (const ar of agentErrors) {
      const errs = Array.isArray(ar.errors) ? ar.errors : [];
      for (const e of errs as { message?: string }[]) {
        recentErrors.push({
          source: 'agent',
          agentName: ar.agentName,
          message: typeof e === 'string' ? e : e?.message ?? 'Unknown error',
          createdAt: ar.completedAt?.toISOString() ?? new Date().toISOString(),
        });
      }
    }

    // Sort by date desc and take 10
    recentErrors.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    recentErrors.splice(10);

    return NextResponse.json({
      db: 'connected',
      users: { total: totalUsers, active: activeUsers },
      entities: {
        accounts: accountCount,
        leads: leadCount,
        opportunities: oppCount,
        tasks: taskCount,
        contacts: contactCount,
      },
      queue: { pending: pendingQueue, total: totalQueue },
      sync: {
        lastRun: lastSync
          ? {
              status: lastSync.status,
              completedAt: lastSync.completedAt?.toISOString() ?? null,
              itemsSynced: lastSync.itemsSynced,
              errors: lastSync.errors.length,
            }
          : null,
      },
      agents: {
        lastRuns: agentLastRuns.map((r) => ({
          agentName: r.agentName,
          status: r.status,
          completedAt: r.completedAt?.toISOString() ?? null,
        })),
      },
      recentErrors,
    });
  } catch {
    return NextResponse.json({
      db: 'error',
      users: { total: 0, active: 0 },
      entities: { accounts: 0, leads: 0, opportunities: 0, tasks: 0, contacts: 0 },
      queue: { pending: 0, total: 0 },
      sync: { lastRun: null },
      agents: { lastRuns: [] },
      recentErrors: [],
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/stats/route.ts
git commit -m "feat(C-03): add GET /api/admin/stats endpoint with health metrics"
```

---

### Task 5: Admin React Query Hook & API Client

**Files:**
- Create: `src/lib/queries/admin.ts`
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add admin methods to API client**

In `src/lib/api-client.ts`, add inside the `api` object (after the `settings` section):

```ts
  // ── Admin ───────────────────────────────────────
  admin: {
    stats: () => get<any>('/admin/stats'),
  },
```

- [ ] **Step 2: Create admin query hook**

Create `src/lib/queries/admin.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
};

export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => api.admin.stats(),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts src/lib/queries/admin.ts
git commit -m "feat(C-03): add admin stats API client method and React Query hook"
```

---

### Task 6: Admin Dashboard Page

**Files:**
- Create: `src/app/(dashboard)/admin/page.tsx`

- [ ] **Step 1: Create the admin health dashboard page**

```tsx
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminStats } from '@/lib/queries/admin';
import { formatRelativeTime } from '@/lib/adapters';
import { Badge } from '@/components/ui';
import Link from 'next/link';
import {
  Database,
  Users,
  Building2,
  Target,
  Layers,
  CheckSquare,
  UserCircle,
  ListChecks,
  RefreshCw,
  Bot,
  AlertTriangle,
} from 'lucide-react';

export default function AdminPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'ADMIN';

  useEffect(() => {
    if (session && !isAdmin) router.replace('/');
  }, [session, isAdmin, router]);

  const { data: stats, isLoading } = useAdminStats();

  if (!isAdmin) return null;

  if (isLoading || !stats) {
    return (
      <div className="max-w-[900px] page-enter">
        <h1 className="text-[18px] font-semibold mb-6">System Health</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-elevated p-4 h-[100px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] page-enter">
      <h1 className="text-[18px] font-semibold mb-6">System Health</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Database Status */}
        <Card title="Database" icon={Database}>
          <Badge variant={stats.db === 'connected' ? 'ok' : 'err'}>
            {stats.db === 'connected' ? 'Connected' : 'Error'}
          </Badge>
        </Card>

        {/* Users */}
        <Card title="Users" icon={Users}>
          <Stat label="Total" value={stats.users.total} />
          <Stat label="Active (7d)" value={stats.users.active} />
        </Card>

        {/* Entity Counts */}
        <Card title="Records" icon={Building2}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Stat label="Accounts" value={stats.entities.accounts} />
            <Stat label="Leads" value={stats.entities.leads} />
            <Stat label="Opps" value={stats.entities.opportunities} />
            <Stat label="Tasks" value={stats.entities.tasks} />
            <Stat label="Contacts" value={stats.entities.contacts} />
          </div>
        </Card>

        {/* Queue Health */}
        <Card title="Queue" icon={ListChecks}>
          <div className="flex items-baseline gap-3">
            <Stat label="Pending" value={stats.queue.pending} />
            <Stat label="Total" value={stats.queue.total} />
          </div>
          {stats.queue.pending > 0 && (
            <Link href="/queue" className="text-[11px] text-brand hover:underline mt-1 inline-block">
              View queue →
            </Link>
          )}
        </Card>

        {/* Sync Status */}
        <Card title="Sync" icon={RefreshCw}>
          {stats.sync.lastRun ? (
            <>
              <Badge variant={stats.sync.lastRun.status === 'success' ? 'ok' : stats.sync.lastRun.status === 'partial' ? 'warn' : 'err'}>
                {stats.sync.lastRun.status}
              </Badge>
              <p className="text-[11px] text-sub mt-1">
                {formatRelativeTime(stats.sync.lastRun.completedAt)} · {stats.sync.lastRun.itemsSynced} items
                {stats.sync.lastRun.errors > 0 && ` · ${stats.sync.lastRun.errors} errors`}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-sub">No sync history — connect Outlook in Settings</p>
          )}
        </Card>

        {/* Agent Status */}
        <Card title="Agents" icon={Bot}>
          {stats.agents.lastRuns.length > 0 ? (
            <div className="space-y-1.5">
              {stats.agents.lastRuns.map((r: any) => (
                <div key={r.agentName} className="flex items-center gap-2">
                  <Badge variant={r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'err' : 'neutral'}>
                    {r.status}
                  </Badge>
                  <span className="text-[11px] text-main truncate">{r.agentName}</span>
                  {r.completedAt && (
                    <span className="text-[10px] text-sub ml-auto shrink-0">{formatRelativeTime(r.completedAt)}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-sub">No agent runs recorded yet</p>
          )}
        </Card>
      </div>

      {/* Recent Errors */}
      <div className="mt-6">
        <h2 className="text-[14px] font-medium mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-sub" />
          Recent Errors
        </h2>
        {stats.recentErrors.length > 0 ? (
          <div className="rounded-lg border border-border bg-elevated divide-y divide-border max-h-[300px] overflow-y-auto">
            {stats.recentErrors.map((err: any, i: number) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                <Badge variant={err.source === 'sync' ? 'warn' : 'purple'} className="mt-0.5 shrink-0">
                  {err.source}{err.agentName ? `: ${err.agentName}` : ''}
                </Badge>
                <span className="text-[12px] text-main break-all flex-1">{err.message}</span>
                <span className="text-[10px] text-sub shrink-0">{formatRelativeTime(err.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-elevated px-4 py-6 text-center">
            <Badge variant="ok">No recent errors</Badge>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helper components ──────────────────────────── */

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-sub" />
        <span className="text-[12px] font-medium text-sub uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-[18px] font-semibold text-main">{value.toLocaleString()}</span>
      <span className="text-[11px] text-sub ml-1.5">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/admin/page.tsx
git commit -m "feat(C-03): add admin health dashboard page"
```

---

### Task 7: Add Admin Link to Sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add Admin item to the sections array**

The Sidebar uses a `sections` array rendered in a loop. Settings is in the "System" section. Add an `adminOnly` flag and the Admin item.

1. Add `adminOnly?: boolean` to the item type (inline — the items are plain objects). Add the Admin entry to the System section **before** Settings:

```ts
  { label: 'System', items: [
    { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]},
```

`Shield` is already imported from `lucide-react`.

2. In the render loop inside `<nav>`, filter out admin-only items for non-admin users. Change the `sec.items.map(item => {` to:

```tsx
{sec.items
  .filter(item => !('adminOnly' in item && item.adminOnly) || session?.user?.role === 'ADMIN')
  .map(item => {
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat(C-03): add Admin link to sidebar for admin users"
```

---

## Chunk 3: Notification API & Hooks (C-04)

### Task 8: Notification API — GET List

**Files:**
- Create: `src/app/api/notifications/route.ts`

- [ ] **Step 1: Create the notifications list endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { resolveTenantDb } from '@/lib/tenant';

const RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const userId = session.user.id;

  const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
  const limit = 20;

  // Cleanup: delete notifications older than 90 days (fire-and-forget)
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  db.notification.deleteMany({ where: { userId, createdAt: { lt: cutoff } } }).catch(() => {});

  const notifications = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      actor: { select: { id: true, name: true, initials: true, color: true } },
    },
  });

  const hasMore = notifications.length > limit;
  const data = hasMore ? notifications.slice(0, limit) : notifications;

  return NextResponse.json({
    notifications: data.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      entityType: n.entityType,
      entityId: n.entityId,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      actor: n.actor ? { id: n.actor.id, name: n.actor.name, initials: n.actor.initials, color: n.actor.color } : null,
    })),
    nextCursor: hasMore ? data[data.length - 1].id : null,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/notifications/route.ts
git commit -m "feat(C-04): add GET /api/notifications endpoint with pagination and cleanup"
```

---

### Task 9: Notification API — PATCH Mark Read

**Files:**
- Create: `src/app/api/notifications/mark-read/route.ts`

- [ ] **Step 1: Create the mark-read endpoint**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { unauthorized, badRequest } from '@/lib/api-errors';
import { resolveTenantDb } from '@/lib/tenant';

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const userId = session.user.id;

  const body = await req.json();
  const now = new Date();

  if (body.all === true) {
    await db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });
    return NextResponse.json({ success: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: body.ids }, userId, readAt: null },
      data: { readAt: now },
    });
    return NextResponse.json({ success: true });
  }

  return badRequest('Provide { ids: string[] } or { all: true }');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/notifications/mark-read/route.ts
git commit -m "feat(C-04): add PATCH /api/notifications/mark-read endpoint"
```

---

### Task 10: Extend Badge Counts with Notification Unread Count

**Files:**
- Modify: `src/app/api/badge-counts/route.ts`
- Modify: `src/lib/api-client.ts` (update type)

- [ ] **Step 1: Add notification count to badge-counts API**

In `src/app/api/badge-counts/route.ts`, add a `notificationCount` query to the `Promise.all` array:

```ts
db.notification.count({ where: { userId: session.user.id, readAt: null } }),
```

Destructure it alongside existing counts and add `notifications: notificationCount` to the response JSON.

- [ ] **Step 2: Update API client type**

In `src/lib/api-client.ts`, update the `badgeCounts.get` return type to include `notifications`:

```ts
get: () => get<{ queue: number; signals: number; leads: number; inbox: number; tasks: number; notifications: number }>('/badge-counts'),
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/badge-counts/route.ts src/lib/api-client.ts
git commit -m "feat(C-04): add notification unread count to badge-counts endpoint"
```

---

### Task 11: Notification React Query Hooks

**Files:**
- Create: `src/lib/queries/notifications.ts`
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add notification methods to API client**

In `src/lib/api-client.ts`, add inside the `api` object:

```ts
  // ── Notifications ───────────────────────────────
  notifications: {
    list: (cursor?: string) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      return get<any>(`/notifications${qs ? `?${qs}` : ''}`);
    },
    markRead: (ids: string[]) => patch<any>('/notifications/mark-read', { ids }),
    markAllRead: () => patch<any>('/notifications/mark-read', { all: true }),
  },
```

- [ ] **Step 2: Create notification query hooks**

Create `src/lib/queries/notifications.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { badgeKeys } from '@/lib/queries/badge-counts';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => ['notifications', 'list'] as const,
};

export function useNotificationsQuery(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => api.notifications.list(),
    enabled,
  });
}

export function useMarkReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['notifications', 'markRead'],
    mutationFn: (ids: string[]) => api.notifications.markRead(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      qc.invalidateQueries({ queryKey: badgeKeys.all });
    },
  });
}

export function useMarkAllReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['notifications', 'markAllRead'],
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      qc.invalidateQueries({ queryKey: badgeKeys.all });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts src/lib/queries/notifications.ts
git commit -m "feat(C-04): add notification API client methods and React Query hooks"
```

---

## Chunk 4: Notification UI (C-04)

### Task 12: Notification Dropdown Component

**Files:**
- Create: `src/components/layout/NotificationDropdown.tsx`

- [ ] **Step 1: Create the notification dropdown**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useNotificationsQuery, useMarkReadMutation, useMarkAllReadMutation } from '@/lib/queries/notifications';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
import { formatRelativeTime } from '@/lib/adapters';
import { Avatar } from '@/components/ui';

function getNotificationUrl(entityType: string | null): string {
  switch (entityType) {
    case 'QueueItem': return '/queue';
    case 'Task':
    case 'TaskComment': return '/tasks';
    default: return '/';
  }
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data: badges } = useBadgeCounts();
  const unreadCount = badges?.notifications ?? 0;

  const { data, isLoading } = useNotificationsQuery(open);
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleNotificationClick(n: any) {
    if (!n.readAt) {
      markRead.mutate([n.id]);
    }
    setOpen(false);
    router.push(getNotificationUrl(n.entityType));
  }

  function handleMarkAllRead() {
    markAllRead.mutate();
  }

  const notifications = data?.notifications ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-sub hover:text-main hover:bg-[var(--surface)] transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full bg-brand" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[360px] max-h-[440px] rounded-lg border border-border bg-elevated shadow-lg overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-[13px] font-medium text-main">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-brand hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[380px]">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-[12px] text-sub">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-sub">No notifications yet</div>
            ) : (
              notifications.slice(0, 10).map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--surface)] transition-colors border-b border-border last:border-b-0"
                >
                  {/* Unread dot */}
                  <div className="w-2 pt-1.5 shrink-0">
                    {!n.readAt && <span className="block w-2 h-2 rounded-full bg-brand" />}
                  </div>

                  {/* Actor avatar */}
                  {n.actor ? (
                    <Avatar initials={n.actor.initials} color={n.actor.color} size="xs" />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-[var(--surface)] flex items-center justify-center shrink-0">
                      <Bell className="w-3 h-3 text-sub" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-main truncate">{n.title}</p>
                    <p className="text-[11px] text-sub truncate">{n.message}</p>
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-sub shrink-0 pt-0.5">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/NotificationDropdown.tsx
git commit -m "feat(C-04): add NotificationDropdown component with mark-read and navigation"
```

---

### Task 13: Wire NotificationDropdown into TopBar

**Files:**
- Modify: `src/components/layout/TopBar.tsx`

- [ ] **Step 1: Replace bell icon Link with NotificationDropdown**

In `src/components/layout/TopBar.tsx`:

1. Add import: `import NotificationDropdown from '@/components/layout/NotificationDropdown';`
2. Remove the existing bell icon `<Link>` block (the one with `href="/queue"` containing `<Bell>` and the badge dot)
3. Replace it with: `<NotificationDropdown />`
4. Remove unused `Bell` import from lucide-react if no longer used elsewhere in the file
5. Remove `pendingCount` variable if no longer used elsewhere

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/TopBar.tsx
git commit -m "feat(C-04): replace TopBar bell link with NotificationDropdown"
```

---

## Chunk 5: Notification Triggers (C-04)

### Task 14: Notify Admins on Queue Item Creation

**Files:**
- Modify: `src/lib/agents/runner.ts`

- [ ] **Step 1: Add notification after queue items are created**

In `src/lib/agents/runner.ts`, after the `queueItem.createMany` block (around line 81), add:

```ts
import { notifyUsers } from '@/lib/notifications';
```

After `createMany`, query admin user IDs and notify them:

```ts
    if (result.items.length > 0) {
      await prisma.queueItem.createMany({ /* existing code */ });

      // Notify all admins of new queue items
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { id: true },
      });
      const adminIds = admins.map((a) => a.id);
      for (const item of result.items) {
        await notifyUsers(prisma, adminIds, undefined, {
          type: 'QUEUE_ITEM',
          title: 'New queue item',
          message: item.title.slice(0, 100),
          entityType: 'QueueItem',
          entityId: item.title, // createMany doesn't return IDs; use title as dedup key
        });
      }
    }
```

Note: `createMany` doesn't return created records in Prisma. Use `item.title` as a dedup identifier since queue item titles are unique enough per agent run. Alternatively, if precision matters, switch to individual `create` calls — but for v1 this is acceptable.

- [ ] **Step 2: Commit**

```bash
git add src/lib/agents/runner.ts
git commit -m "feat(C-04): notify admins when new queue items are created by agents"
```

---

### Task 15: Notify on Task Assignment

**Files:**
- Modify: `src/app/api/tasks/route.ts`

- [ ] **Step 1: Add notification on task create with assignees**

In `src/app/api/tasks/route.ts`:

1. Add import: `import { notifyUsers } from '@/lib/notifications';`

2. In the `create` action block, after the task is created (after `db.task.create`), add:

```ts
    // Notify assignees
    const assigneeIds = body.assigneeIds || [ownerId];
    await notifyUsers(db, assigneeIds, session.user.id, {
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: title.slice(0, 100),
      entityType: 'Task',
      entityId: task.id,
    });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tasks/route.ts
git commit -m "feat(C-04): notify assignees on task creation"
```

---

### Task 15b: Notify on Task Reassignment via PATCH

**Files:**
- Modify: `src/app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Add notification when assignees change**

In `src/app/api/tasks/[id]/route.ts`:

1. Add import: `import { notifyUsers } from '@/lib/notifications';`

2. After the `db.task.update` call, check if assignees changed and notify new assignees:

```ts
  // Notify new assignees if assigneeIds changed
  // The `set` operation replaces all assignees. Dedup in createNotification
  // will skip users who already have an unread notification for this task.
  if (body.assigneeIds !== undefined) {
    await notifyUsers(db, body.assigneeIds, session.user.id, {
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: updated.title.slice(0, 100),
      entityType: 'Task',
      entityId: id,
    });
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tasks/\[id\]/route.ts
git commit -m "feat(C-04): notify assignees on task reassignment via PATCH"
```

---

### Task 16: Notify on Mention in Task Comment

**Files:**
- Modify: `src/app/api/tasks/route.ts`

- [ ] **Step 1: Add notification on comment with mentions**

In the `comment` action block of `src/app/api/tasks/route.ts`, after the comment is created, add:

```ts
    // Notify mentioned users
    if (mentions.length > 0) {
      const mentionedUsers = await db.user.findMany({
        where: { name: { in: mentions, mode: 'insensitive' } },
        select: { id: true },
      });
      const mentionedIds = mentionedUsers.map((u) => u.id);
      await notifyUsers(db, mentionedIds, userId, {
        type: 'MENTION',
        title: 'You were mentioned',
        message: text.slice(0, 100),
        entityType: 'TaskComment',
        entityId: comment.id,
      });
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tasks/route.ts
git commit -m "feat(C-04): notify mentioned users on task comments"
```

---

## Chunk 6: Build Verification

### Task 17: Verify Build

- [ ] **Step 1: Run TypeScript compilation check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run Next.js build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Fix any build errors if found**

Address any type errors, missing imports, or compilation issues.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address build errors for admin dashboard and notifications"
```
