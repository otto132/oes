import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { unauthorized, badRequest } from '@/lib/api-errors';
import { resolveTenantDb } from '@/lib/tenant';

const markReadSchema = z.union([
  z.object({
    all: z.literal(true),
    types: z.array(z.enum(['QUEUE_ITEM', 'TASK_ASSIGNED', 'MENTION', 'TASK_DUE', 'TASK_OVERDUE'])).optional(),
  }),
  z.object({
    ids: z.array(z.string().min(1)).min(1),
  }),
]);

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const userId = session.user.id;

  const raw = await req.json();
  const parsed = markReadSchema.safeParse(raw);
  if (!parsed.success) return badRequest('Provide { ids: string[] } or { all: true }');

  const body = parsed.data;
  const now = new Date();

  if ('all' in body) {
    const where: Record<string, unknown> = { userId, readAt: null };
    if (body.types && body.types.length > 0) {
      where.type = { in: body.types };
    }
    await db.notification.updateMany({
      where,
      data: { readAt: now },
    });
    return NextResponse.json({ success: true });
  }

  await db.notification.updateMany({
    where: { id: { in: body.ids }, userId, readAt: null },
    data: { readAt: now },
  });
  return NextResponse.json({ success: true });
}
