import { NextRequest, NextResponse } from 'next/server';
import { scopedDb } from '@/lib/scoped-db';
import { auth } from '@/lib/auth';
import { adaptTask } from '@/lib/adapters';
import { patchTaskSchema } from '@/lib/schemas/tasks';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';
import { notifyUsers } from '@/lib/notifications';

const TASK_INCLUDE = {
  owner: true,
  assignees: true,
  reviewer: true,
  account: { select: { id: true, name: true } },
  comments: { include: { author: true }, orderBy: { createdAt: 'asc' as const } },
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = scopedDb(session.user.id, (session.user as any).role ?? 'MEMBER');

  const { id } = await params;

  const raw = await req.json();
  const parsed = patchTaskSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  const existing = await db.task.findUnique({ where: { id } });
  if (!existing) return notFound('Task not found');

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.due !== undefined) data.due = new Date(body.due);
  if (body.assigneeIds !== undefined) {
    data.assignees = { set: body.assigneeIds.map(aid => ({ id: aid })) };
  }
  if (body.reviewerId !== undefined) {
    data.reviewerId = body.reviewerId;
  }
  if (body.notes !== undefined) data.notes = body.notes;

  const updated = await db.task.update({
    where: { id },
    data,
    include: TASK_INCLUDE,
  });

  // Notify new assignees if assigneeIds changed
  if (body.assigneeIds !== undefined) {
    await notifyUsers(db, body.assigneeIds, session.user.id, {
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: updated.title.slice(0, 100),
      entityType: 'Task',
      entityId: id,
    });
  }

  return NextResponse.json({ data: adaptTask(updated as any) });
}
