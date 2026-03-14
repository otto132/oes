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
