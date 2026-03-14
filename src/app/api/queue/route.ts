import { NextRequest, NextResponse } from 'next/server';
import { Prisma, SignalType, AccountType, LeadStage, TaskPriority } from '@prisma/client';
import type { QueueItemType } from '@prisma/client';
import { resolveTenantDb } from '@/lib/tenant';
import { adaptQueueItem } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { queueActionSchema } from '@/lib/schemas/queue';
import { notFound, badRequest, unauthorized } from '@/lib/api-errors';
import { auth } from '@/lib/auth';
import { handleApproval } from '@/lib/agents/chain';

/** Typed payload interfaces for queue item side-effects */
interface LeadQualificationPayload {
  company: string;
  type?: string;
  country?: string;
  stage?: string;
  pain?: string;
  scores?: { f?: number; i?: number; u?: number; a?: number; c?: number };
}

interface EnrichmentPayload {
  field?: string;
  after?: unknown;
}

interface TaskCreationPayload {
  task: string;
  due?: string;
  pri?: string;
}

interface SignalReviewPayload {
  signalType?: string;
  headline?: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
  relevanceScore?: number;
  matchedAccounts?: string[];
}

interface OutreachDraftPayload {
  subject?: string;
  body?: string;
}

/**
 * Approval authority policy (U-04):
 * Any MEMBER or ADMIN can approve/reject any queue item.
 * VIEWER cannot mutate (enforced by middleware).
 * This is intentional — no owner-based or seniority-based restrictions.
 */

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const status = req.nextUrl.searchParams.get('status') || 'pending';
  const type = req.nextUrl.searchParams.get('type');

  const where: Prisma.QueueItemWhereInput = status === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } };
  if (type && type !== 'all') where.type = type as QueueItemType;

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

export const POST = withHandler(queueActionSchema, async (req, ctx) => {
  const db = resolveTenantDb(ctx.session as any);
  const body = ctx.body;
  const userId = ctx.session.user.id;

  if (body.action === 'approve') {
    const { id, editedPayload } = body;
    const item = await db.queueItem.findUnique({ where: { id } });
    if (!item) return notFound('Queue item not found');

    const updated = await db.queueItem.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedById: userId,
        reviewedAt: new Date(),
        ...(editedPayload ? { originalPayload: item.payload ?? undefined, payload: editedPayload as Prisma.InputJsonValue } : {}),
      },
    });

    // Apply side-effects based on type
    if (item.type === 'lead_qualification') {
      const payload = item.payload as unknown as LeadQualificationPayload;
      await db.lead.create({
        data: {
          company: payload.company,
          source: 'AI Qualified',
          type: (payload.type || 'Unknown') as AccountType,
          country: payload.country || '',
          stage: (payload.stage || 'Researching') as LeadStage,
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
      const payload = item.payload as unknown as EnrichmentPayload;
      if (payload.field) {
        await db.account.update({
          where: { id: item.accId },
          data: { [payload.field]: payload.after, lastActivityAt: new Date() },
        });
      }
    } else if (item.type === 'task_creation') {
      const payload = item.payload as unknown as TaskCreationPayload;
      await db.task.create({
        data: {
          title: payload.task,
          due: payload.due ? new Date(payload.due) : new Date(Date.now() + 7 * 864e5),
          priority: (payload.pri || 'Medium') as TaskPriority,
          source: item.agent,
          accountId: item.accId || undefined,
          ownerId: userId,
          assignees: { connect: [{ id: userId }] },
        },
      });
    } else if (item.type === 'signal_review') {
      const payload = item.payload as unknown as SignalReviewPayload;
      await db.signal.create({
        data: {
          type: (payload.signalType || 'market_entry') as SignalType,
          title: String(payload.headline || item.title),
          summary: String(payload.summary || ''),
          reasoning: String(item.reasoning || ''),
          source: String(payload.sourceName || ''),
          sourceUrl: payload.sourceUrl ? String(payload.sourceUrl) : null,
          relevance: Number(payload.relevanceScore || item.confidence * 100),
          confidence: item.confidence ?? 0.5,
          companies: payload.matchedAccounts || [],
        },
      });
    } else if (item.type === 'outreach_draft') {
      const payload = item.payload as unknown as OutreachDraftPayload;
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

    // Trigger chain agents (fire-and-forget)
    handleApproval(updated, (editedPayload || item.payload) as Record<string, unknown>).catch((err) => {
      console.error('Chain coordinator error:', err);
    });

    const adapted = adaptQueueItem(updated);
    // Resolve reviewer display name (reviewedById is a plain string, no relation)
    if (updated.reviewedById) {
      const reviewer = await db.user.findUnique({ where: { id: updated.reviewedById }, select: { name: true } });
      if (reviewer) adapted.reviewedBy = reviewer.name;
    }
    return NextResponse.json({ data: adapted });
  }

  if (body.action === 'reject') {
    const { id, reason } = body;
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

  return badRequest('Invalid action');
});
