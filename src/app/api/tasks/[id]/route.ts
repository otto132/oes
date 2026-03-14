import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { adaptTask } from '@/lib/adapters';
import { patchTaskSchema } from '@/lib/schemas/tasks';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';

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
  const db = resolveTenantDb(session as any);

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

  const updated = await db.task.update({
    where: { id },
    data,
    include: TASK_INCLUDE,
  });

  return NextResponse.json({ data: adaptTask(updated as any) });
}
