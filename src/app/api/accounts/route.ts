import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptAccount, adaptContact, adaptOpportunity, adaptActivity, adaptTask, adaptGoal } from '@/lib/adapters';
import { auth } from '@/lib/auth';

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
    if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

  // List
  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { country: { contains: search, mode: 'insensitive' } },
      { pain: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (type && type !== 'all') where.type = type;

  const accounts = await db.account.findMany({
    where,
    include: { owner: true, contacts: true },
    orderBy: { scoreFit: 'desc' },
  });
  return NextResponse.json({ data: accounts.map(adaptAccount) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { name, type, country, notes } = body;
  const ownerId = body.ownerId || session.user.id;
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Dedup
  const dup = await db.account.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
  if (dup) return NextResponse.json({ error: `Account "${dup.name}" already exists` }, { status: 409 });

  const account = await db.account.create({
    data: {
      name,
      type: type || 'Unknown',
      country: country || '',
      status: 'Prospect',
      ownerId,
      pain: notes || '',
    },
  });
  return NextResponse.json({ data: account }, { status: 201 });
}
