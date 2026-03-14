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
