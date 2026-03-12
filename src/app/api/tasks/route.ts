import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptTask, adaptGoal, adaptTaskComment } from '@/lib/adapters';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const includeCompleted = req.nextUrl.searchParams.get('completed') === 'true';
  const where: any = {};
  if (!includeCompleted) where.status = { not: 'Done' };

  const tasks = await db.task.findMany({
    where,
    include: { owner: true, assignees: true, reviewer: true, goal: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } } },
    orderBy: [{ due: 'asc' }],
  });
  const goals = await db.goal.findMany({
    where: { status: 'active' },
    include: { owner: true, account: { select: { id: true, name: true } } },
  });
  const overdue = tasks.filter(t => t.status !== 'Done' && t.due && t.due < new Date()).length;
  return NextResponse.json({
    data: { tasks: tasks.map(adaptTask), goals: goals.map(adaptGoal) },
    meta: { overdueCount: overdue },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { action, id } = body;

  if (!action) {
    // Create task
    const { title, accountId, priority, due, assigneeIds, reviewerId, goalId } = body;
    const ownerId = body.ownerId || session.user.id;
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
    const task = await db.task.create({
      data: {
        title, priority: priority || 'Medium', due: due ? new Date(due) : new Date(Date.now() + 7 * 864e5),
        source: 'Manual', accountId: accountId || undefined, ownerId,
        assignees: { connect: (assigneeIds || [ownerId]).map((id: string) => ({ id })) },
        reviewerId: reviewerId || undefined, goalId: goalId || undefined,
      },
      include: { owner: true, assignees: true, reviewer: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json({ data: adaptTask(task) }, { status: 201 });
  }

  if (action === 'complete') {
    const { outcome, notes, followUpTasks } = body;
    const userId = session.user.id;
    const task = await db.task.update({
      where: { id },
      data: { status: 'Done', completedAt: new Date() },
      include: { owner: true, assignees: true, reviewer: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } } },
    });
    // Log activity
    await db.activity.create({
      data: {
        type: 'Note', summary: 'Task completed: ' + task.title.slice(0, 60),
        detail: (outcome !== 'done' ? 'Outcome: ' + outcome + '. ' : '') + (notes || ''),
        source: 'Task', accountId: task.accountId || undefined, authorId: userId,
      },
    });
    // Bump engagement health
    if (task.accountId) {
      await db.account.update({ where: { id: task.accountId }, data: { lastActivityAt: new Date() } });
      const opp = await db.opportunity.findFirst({
        where: { accountId: task.accountId, stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
      });
      if (opp) {
        await db.opportunity.update({
          where: { id: opp.id },
          data: { healthEngagement: Math.min(100, opp.healthEngagement + 10) },
        });
      }
    }
    // Create follow-ups
    const created: any[] = [];
    if (followUpTasks) {
      for (const ft of followUpTasks) {
        const t = await db.task.create({
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

  if (action === 'comment') {
    const { text } = body;
    const userId = session.user.id;
    if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 });
    const mentions = (text.match(/@(\w+)/g) || []).map((m: string) => m.slice(1));
    const comment = await db.taskComment.create({
      data: { text, taskId: id, authorId: userId, mentions },
      include: { author: true },
    });
    return NextResponse.json({ data: adaptTaskComment(comment) }, { status: 201 });
  }

  if (action === 'send_for_review') {
    const task = await db.task.update({
      where: { id },
      data: { status: 'InReview' },
      include: { owner: true, assignees: true, reviewer: true, account: { select: { id: true, name: true } }, comments: { include: { author: true }, orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json({ data: adaptTask(task) });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
