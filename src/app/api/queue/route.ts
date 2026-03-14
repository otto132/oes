import { NextRequest, NextResponse } from 'next/server';
import { Prisma, SignalType, AccountType, LeadStage, TaskPriority } from '@prisma/client';
import type { QueueItemType } from '@prisma/client';
import { resolveTenantDb } from '@/lib/tenant';
import { adaptQueueItem } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { queueActionSchema } from '@/lib/schemas/queue';
import { notFound, badRequest, unauthorized, forbidden } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';
import { canMutate } from '@/lib/rbac';
import { auth } from '@/lib/auth';
import { handleApproval } from '@/lib/agents/chain';
import { notifyUsers } from '@/lib/notifications';

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

import { z } from 'zod';

/** Type-specific validation schemas for editedPayload */
const payloadSchemas: Record<string, z.ZodSchema> = {
  lead_qualification: z.object({
    company: z.string().optional(),
    type: z.string().optional(),
    country: z.string().optional(),
    stage: z.string().optional(),
    pain: z.string().optional(),
    scores: z.object({
      f: z.number().min(0).max(100).optional(),
      i: z.number().min(0).max(100).optional(),
      u: z.number().min(0).max(100).optional(),
      a: z.number().min(0).max(100).optional(),
      c: z.number().min(0).max(100).optional(),
    }).optional(),
  }).passthrough(),
  enrichment: z.object({
    field: z.string().optional(),
    after: z.unknown().optional(),
  }).passthrough(),
  task_creation: z.object({
    task: z.string().optional(),
    due: z.string().optional(),
    pri: z.string().optional(),
  }).passthrough(),
  signal_review: z.object({
    signalType: z.string().optional(),
    headline: z.string().optional(),
    summary: z.string().optional(),
    sourceName: z.string().optional(),
    sourceUrl: z.string().optional(),
    relevanceScore: z.number().optional(),
    matchedAccounts: z.array(z.string()).optional(),
  }).passthrough(),
  outreach_draft: z.object({
    subject: z.string().optional(),
    body: z.string().optional(),
  }).passthrough(),
};

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

  const pagination = parsePagination(req);
  const status = req.nextUrl.searchParams.get('status') || 'pending';
  const type = req.nextUrl.searchParams.get('type');

  const where: Prisma.QueueItemWhereInput = status === 'pending' ? { status: 'pending' } : { status: { not: 'pending' } };
  if (type && type !== 'all') where.type = type as QueueItemType;

  const items = await db.queueItem.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(items, pagination.limit);

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
    data: data.map(adaptQueueItem),
    meta: { ...meta, pendingCount, completedCount, typeCounts },
  });
}

export const POST = withHandler(queueActionSchema, async (req, ctx) => {
  // RBAC: only ADMIN and MEMBER can approve/reject queue items
  if (!canMutate(ctx.session.user.role)) {
    return forbidden('Only ADMIN or MEMBER roles can approve or reject queue items');
  }

  const db = resolveTenantDb(ctx.session as any);
  const body = ctx.body;
  const userId = ctx.session.user.id;

  if (body.action === 'approve') {
    const { id, editedPayload } = body;
    const item = await db.queueItem.findUnique({ where: { id } });
    if (!item) return notFound('Queue item not found');

    // Validate editedPayload against type-specific schema
    if (editedPayload) {
      const schema = payloadSchemas[item.type];
      if (schema) {
        const result = schema.safeParse(editedPayload);
        if (!result.success) {
          return badRequest(`Invalid payload for ${item.type}: ${result.error.issues.map(i => i.message).join(', ')}`);
        }
      }
    }

    const updated = await db.queueItem.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedById: userId,
        reviewedAt: new Date(),
        ...(editedPayload ? { originalPayload: item.payload ?? undefined, payload: editedPayload as Prisma.InputJsonValue } : {}),
      },
    });

    // Validate the effective payload before applying side-effects
    const effectivePayload = editedPayload || item.payload;
    const typeSchema = payloadSchemas[item.type];
    if (typeSchema) {
      const validation = typeSchema.safeParse(effectivePayload);
      if (!validation.success) {
        return badRequest(`Invalid payload for ${item.type}: ${validation.error.issues.map(i => i.message).join(', ')}`);
      }
    }

    // Apply side-effects based on type
    if (item.type === 'lead_qualification') {
      const payload = (effectivePayload ?? item.payload) as unknown as LeadQualificationPayload;
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
      const payload = (effectivePayload ?? item.payload) as unknown as EnrichmentPayload;
      if (payload.field) {
        await db.account.update({
          where: { id: item.accId },
          data: { [payload.field]: payload.after, lastActivityAt: new Date() },
        });
      }
    } else if (item.type === 'task_creation') {
      const payload = (effectivePayload ?? item.payload) as unknown as TaskCreationPayload;
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
      const payload = (effectivePayload ?? item.payload) as unknown as SignalReviewPayload;
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
      const payload = (effectivePayload ?? item.payload) as unknown as OutreachDraftPayload;
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

    // Notify admins of approval
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    await notifyUsers(db, admins.map(a => a.id), userId, {
      type: 'QUEUE_ITEM',
      title: 'Queue item approved',
      message: item.title.slice(0, 100),
      entityType: 'QueueItem',
      entityId: item.id,
    });

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
    const item = await db.queueItem.findUnique({ where: { id } });
    if (!item) return notFound('Queue item not found');
    const updated = await db.queueItem.update({
      where: { id },
      data: { status: 'rejected', reviewedById: userId, reviewedAt: new Date(), rejReason: reason },
    });

    // Notify admins of rejection
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    await notifyUsers(db, admins.map(a => a.id), userId, {
      type: 'QUEUE_ITEM',
      title: 'Queue item rejected',
      message: `${item.title.slice(0, 80)}${reason ? ' — ' + reason.slice(0, 50) : ''}`,
      entityType: 'QueueItem',
      entityId: item.id,
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
