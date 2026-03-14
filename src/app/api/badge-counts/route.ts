// src/app/api/badge-counts/route.ts
import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const [pendingQueue, newSignals, newLeads, unreadEmails, overdueTasks, notificationCount] = await Promise.all([
    db.queueItem.count({ where: { status: 'pending' } }),
    db.signal.count({ where: { status: 'new_signal' } }),
    db.lead.count({ where: { stage: 'New' } }),
    db.inboxEmail.count({ where: { isUnread: true, isArchived: false } }),
    (() => {
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return db.task.count({
        where: {
          status: { not: 'Done' },
          due: { lte: endOfToday },
          OR: [
            { ownerId: session.user.id },
            { assignees: { some: { id: session.user.id } } },
          ],
        },
      });
    })(),
    db.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);

  return NextResponse.json({
    queue: pendingQueue,
    signals: newSignals,
    leads: newLeads,
    inbox: unreadEmails,
    tasks: overdueTasks,
    notifications: notificationCount,
  });
}
