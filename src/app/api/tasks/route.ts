import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import type { Task } from '@prisma/client';
import { resolveTenantDb } from '@/lib/tenant';
import { db as rawDb } from '@/lib/db';
import { scopedDb } from '@/lib/scoped-db';
import { adaptTask, adaptGoal, adaptTaskComment } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { taskActionSchema } from '@/lib/schemas/tasks';
import { parsePagination, paginate } from '@/lib/schemas/pagination';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { notifyUsers } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const includeCompleted = req.nextUrl.searchParams.get('completed') === 'true';
  const where: Prisma.TaskWhereInput = {};
  if (!includeCompleted) where.status = { not: 'Done' };

  const pagination = parsePagination(req);

  // Count overdue across all tasks (count not scoped in extension, uses db directly)
  const overdueCount = await db.task.count({
    where: { ...where, status: { not: 'Done' }, due: { lt: new Date() } },
  });

  // Then paginated query for tasks
  const tasks = await scoped.task.findMany({
    where,
    include: { owner: true, assignees: true, reviewer: true, goal: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } }, subtasks: { orderBy: { position: 'asc' as const } }, _count: { select: { subtasks: true } } },
    orderBy: [{ due: 'asc' }],
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const goals = await scoped.goal.findMany({
    where: { status: 'active' },
    include: { owner: true, account: { select: { id: true, name: true } } },
  });

  const { data: paginatedTasks, meta: pagMeta } = paginate(tasks, pagination.limit);

  return NextResponse.json({
    data: { tasks: paginatedTasks.map(adaptTask), goals: goals.map(adaptGoal) },
    meta: { ...pagMeta, overdueCount },
  });
}

export const POST = withHandler(taskActionSchema, async (req, ctx) => {
  const body = ctx.body;
  const session = ctx.session;

  if (body.action === 'create') {
    // Create task
    const { title, accountId, priority, due, assigneeIds, reviewerId, goalId } = body;
    const ownerId = ('ownerId' in body && typeof body.ownerId === 'string') ? body.ownerId : session.user.id;
    const task = await ctx.db.task.create({
      data: {
        title, priority: priority || 'Medium', due: due ? new Date(due) : new Date(Date.now() + 7 * 864e5),
        source: 'Manual', accountId: accountId || undefined, ownerId,
        assignees: { connect: (assigneeIds || [ownerId]).map((id: string) => ({ id })) },
        reviewerId: reviewerId || undefined, goalId: goalId || undefined,
      },
      include: { owner: true, assignees: true, reviewer: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } } },
    });
    // Notify assignees (rawDb used — notifyUsers needs PrismaClient, not ScopedDb)
    const notifyIds = assigneeIds || [ownerId];
    await notifyUsers(rawDb, notifyIds, session.user.id, {
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      message: title.slice(0, 100),
      entityType: 'Task',
      entityId: task.id,
    });
    return NextResponse.json({ data: adaptTask(task) }, { status: 201 });
  }

  if (body.action === 'complete') {
    const { id, outcome, notes, followUpTasks } = body;
    const userId = session.user.id;
    const task = await ctx.db.task.update({
      where: { id },
      data: { status: 'Done', completedAt: new Date() },
      include: { owner: true, assignees: true, reviewer: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } } },
    });
    // Log activity
    await ctx.db.activity.create({
      data: {
        type: 'Note', summary: 'Task completed: ' + task.title.slice(0, 60),
        detail: (outcome !== 'done' ? 'Outcome: ' + outcome + '. ' : '') + (notes || ''),
        source: 'Task', accountId: task.accountId || undefined, authorId: userId,
      },
    });
    // Bump engagement health
    if (task.accountId) {
      await ctx.db.account.update({ where: { id: task.accountId }, data: { lastActivityAt: new Date() } });
      const opp = await ctx.db.opportunity.findFirst({
        where: { accountId: task.accountId, stage: { notIn: ['Won', 'Lost'] as any } },
      });
      if (opp) {
        await ctx.db.opportunity.update({
          where: { id: opp.id },
          data: { healthEngagement: Math.min(100, opp.healthEngagement + 10) },
        });
      }
    }
    // Create follow-ups
    const created: Task[] = [];
    if (followUpTasks) {
      for (const ft of followUpTasks) {
        const t = await ctx.db.task.create({
          data: {
            title: ft.title, priority: 'Medium', source: ft.source === 'ai_suggested' ? 'AI Suggested' : 'Follow-up',
            due: new Date(Date.now() + 3 * 864e5), accountId: task.accountId || undefined,
            ownerId: userId, assignees: { connect: [{ id: userId }] }, goalId: task.goalId || undefined,
          },
        });
        created.push(t);
      }
    }
    return NextResponse.json({ data: { task: adaptTask(task), createdFollowUps: created } });
  }

  if (body.action === 'comment') {
    const { id, text, mentionedUserIds } = body;
    const userId = session.user.id;
    const mentions = mentionedUserIds || [];
    const comment = await ctx.db.taskComment.create({
      data: { text, taskId: id, authorId: userId, mentions },
      include: { author: true },
    });
    // Notify mentioned users (rawDb used — notifyUsers needs PrismaClient, not ScopedDb)
    if (mentions.length > 0) {
      await notifyUsers(rawDb, mentions, userId, {
        type: 'MENTION',
        title: 'You were mentioned',
        message: text.slice(0, 100),
        entityType: 'TaskComment',
        entityId: comment.id,
      });
    }
    return NextResponse.json({ data: adaptTaskComment(comment) }, { status: 201 });
  }

  if (body.action === 'send_for_review') {
    const { id } = body;
    const task = await ctx.db.task.update({
      where: { id },
      data: { status: 'InReview' },
      include: { owner: true, assignees: true, reviewer: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json({ data: adaptTask(task) });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
});
