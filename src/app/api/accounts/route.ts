import { NextRequest, NextResponse } from 'next/server';
import { Prisma, AccountType } from '@prisma/client';
import { db } from '@/lib/db';
import { adaptAccount, adaptOpportunity, adaptActivity, adaptTask, adaptGoal } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { createAccountSchema } from '@/lib/schemas/accounts';
import { notFound, badRequest, conflict } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';
import { auth } from '@/lib/auth';
import { logAccess } from '@/lib/access-log';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('q');
  const type = req.nextUrl.searchParams.get('type');
  const id = req.nextUrl.searchParams.get('id');

  // Single account detail
  if (id) {
    const account = await db.account.findUnique({
      where: { id },
      include: {
        owner: true,
        contacts: { orderBy: { role: 'asc' } },
        opportunities: { include: { owner: true }, orderBy: { amount: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20, include: { author: true } },
        tasks: {
          where: { status: { not: 'Done' } },
          include: {
            owner: true,
            assignees: true,
            reviewer: true,
            comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
          },
          orderBy: { due: 'asc' },
        },
        goals: { include: { owner: true } },
      },
    });
    if (!account) return notFound('Account not found');

    const session = await auth();
    if (session?.user?.id) {
      logAccess({
        userId: session.user.id,
        entityType: 'Account',
        entityId: id,
      });
    }

    const adaptedAccount = adaptAccount(account);

    const opportunities = account.opportunities.map(o =>
      adaptOpportunity({ ...o, account: { id: account.id, name: account.name } }),
    );

    const activities = account.activities.map(a =>
      adaptActivity({ ...a, account: { id: account.id, name: account.name } }),
    );

    const tasks = account.tasks.map(t =>
      adaptTask({ ...t, account: { id: account.id, name: account.name } }),
    );

    const goals = account.goals.map(g =>
      adaptGoal({ ...g, account: { id: account.id, name: account.name } }),
    );

    return NextResponse.json({
      data: adaptedAccount,
      opportunities,
      activities,
      tasks,
      goals,
    });
  }

  // List with pagination
  const pagination = parsePagination(req);

  const where: Prisma.AccountWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { country: { contains: search, mode: 'insensitive' } },
      { pain: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (type && type !== 'all') where.type = type as AccountType;

  const ownerParam = req.nextUrl.searchParams.get('owner');
  if (ownerParam === 'me') {
    const session = await auth();
    if (session?.user?.id) {
      where.ownerId = session.user.id;
    }
  }

  const accounts = await db.account.findMany({
    where,
    include: { owner: true, contacts: true },
    orderBy: { scoreFit: 'desc' },
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(accounts, pagination.limit);
  return NextResponse.json({ data: data.map(adaptAccount), meta });
}

export const POST = withHandler(createAccountSchema, async (req, ctx) => {
  const body = ctx.body;
  const { name, type, country, notes } = body;
  const ownerId = body.ownerId || ctx.session.user.id;
  if (!name) return badRequest('Name required');

  // Dedup
  const dup = await db.account.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (dup) return conflict(`Account "${dup.name}" already exists`);

  const account = await db.account.create({
    data: {
      name,
      type: (type || 'Unknown') as AccountType,
      country: country || '',
      status: 'Prospect',
      ownerId,
      pain: notes || '',
    },
  });
  return NextResponse.json({ data: account }, { status: 201 });
});
