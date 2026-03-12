import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptQueueItem } from '@/lib/adapters';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'pending';
  const type = req.nextUrl.searchParams.get('type');

  const where: any = status === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } };
  if (type && type !== 'all') where.type = type;

  const items = await db.queueItem.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  const pendingCount = await db.queueItem.count({ where: { status: 'pending' } });
  const completedCount = await db.queueItem.count({ where: { status: { not: 'pending' } } });

  // Per-type counts for the current tab (pending or completed)
  const statusWhere = status === 'pending' ? { status: 'pending' as const } : { status: { not: 'pending' as const } };
  const typeGroups = await db.queueItem.groupBy({
    by: ['type'],
    where: statusWhere,
    _count: true,
  });
  const typeCounts: Record<string, number> = {};
  for (const g of typeGroups) {
    typeCounts[g.type] = g._count;
  }

  return NextResponse.json({
    data: items.map(adaptQueueItem),
    meta: { pendingCount, completedCount, typeCounts },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { action, id, reason, editedPayload } = body;
  const userId = session.user.id;

  if (action === 'approve') {
    const item = await db.queueItem.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await db.queueItem.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedById: userId,
        reviewedAt: new Date(),
        ...(editedPayload ? { originalPayload: item.payload ?? undefined, payload: editedPayload } : {}),
      },
    });

    // Apply side-effects based on type
    if (item.type === 'lead_qualification') {
      const payload = item.payload as any;
      await db.lead.create({
        data: {
          company: payload.company,
          source: 'AI Qualified',
          type: payload.type || 'Unknown',
          country: payload.country || '',
          stage: payload.stage || 'Researching',
          pain: payload.pain || '',
          scoreFit: payload.scores?.f || 50,
          scoreIntent: payload.scores?.i || 50,
          scoreUrgency: payload.scores?.u || 50,
          scoreAccess: payload.scores?.a || 30,
          scoreCommercial: payload.scores?.c || 50,
          confidence: item.confidence,
          ownerId: userId,
        },
      });
    } else if (item.type === 'enrichment' && item.accId) {
      const payload = item.payload as any;
      if (payload.field) {
        await db.account.update({
          where: { id: item.accId },
          data: { [payload.field]: payload.after, lastActivityAt: new Date() },
        });
      }
    } else if (item.type === 'task_creation') {
      const payload = item.payload as any;
      await db.task.create({
        data: {
          title: payload.task,
          due: payload.due ? new Date(payload.due) : new Date(Date.now() + 7 * 864e5),
          priority: payload.pri || 'Medium',
          source: item.agent,
          accountId: item.accId || undefined,
          ownerId: userId,
          assignees: { connect: [{ id: userId }] },
        },
      });
    } else if (item.type === 'outreach_draft') {
      const payload = item.payload as any;
      await db.activity.create({
        data: {
          type: 'Email',
          summary: 'Outreach sent: ' + (payload.subject || '').slice(0, 60),
          detail: (payload.body || '').slice(0, 200),
          source: 'Outreach Drafter',
          accountId: item.accId || undefined,
          authorId: userId,
        },
      });
      if (item.accId) {
        await db.account.update({ where: { id: item.accId }, data: { lastActivityAt: new Date() } });
      }
    }

    // Log approval activity
    await db.activity.create({
      data: {
        type: 'Note',
        summary: 'Queue approved: ' + item.title.slice(0, 60),
        detail: `Reviewed by ${userId} · ${item.agent}`,
        source: 'Approval Queue',
        accountId: item.accId || undefined,
        authorId: userId,
      },
    });

    const adapted = adaptQueueItem(updated);
    // Resolve reviewer display name (reviewedById is a plain string, no relation)
    if (updated.reviewedById) {
      const reviewer = await db.user.findUnique({ where: { id: updated.reviewedById }, select: { name: true } });
      if (reviewer) adapted.reviewedBy = reviewer.name;
    }
    return NextResponse.json({ data: adapted });
  }

  if (action === 'reject') {
    const updated = await db.queueItem.update({
      where: { id },
      data: { status: 'rejected', reviewedById: userId, reviewedAt: new Date(), rejReason: reason },
    });
    const adapted = adaptQueueItem(updated);
    if (updated.reviewedById) {
      const reviewer = await db.user.findUnique({ where: { id: updated.reviewedById }, select: { name: true } });
      if (reviewer) adapted.reviewedBy = reviewer.name;
    }
    return NextResponse.json({ data: adapted });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
