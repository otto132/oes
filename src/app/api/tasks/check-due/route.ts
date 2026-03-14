import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { createNotification } from '@/lib/notifications';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);

  const tasks = await db.task.findMany({
    where: {
      status: { not: 'Done' },
      due: { lte: endOfToday },
    },
    select: {
      id: true,
      title: true,
      due: true,
      ownerId: true,
      assignees: { select: { id: true } },
    },
  });

  let processed = 0;

  for (const task of tasks) {
    const isOverdue = task.due! < startOfToday;
    const type = isOverdue ? 'TASK_OVERDUE' : 'TASK_DUE';
    const title = isOverdue ? 'Task overdue' : 'Task due today';

    const userIds = [...new Set([task.ownerId, ...task.assignees.map((a: any) => a.id)])];

    for (const userId of userIds) {
      const created = await createNotification(db, {
        userId,
        type: type as any,
        title,
        message: task.title.slice(0, 100),
        entityType: 'Task',
        entityId: task.id,
      });
      if (created) processed++;
    }
  }

  return NextResponse.json({ processed });
}
