import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  const where: any = {};
  if (accountId) where.accountId = accountId;

  const activities = await db.activity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { author: true },
  });
  return NextResponse.json({ data: activities });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { type, summary, detail, source, noteType, accountId } = body;
  const authorId = body.authorId || session.user.id;
  if (!summary) return NextResponse.json({ error: 'Summary required' }, { status: 400 });

  const activity = await db.activity.create({
    data: { type: type || 'Note', summary, detail: detail || '', source: source || 'Manual', noteType, accountId: accountId || undefined, authorId },
  });
  if (accountId) {
    await db.account.update({ where: { id: accountId }, data: { lastActivityAt: new Date() } });
  }
  return NextResponse.json({ data: activity }, { status: 201 });
}
