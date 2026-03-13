import { NextRequest, NextResponse } from 'next/server';
import { Prisma, ActivityType } from '@prisma/client';
import { db } from '@/lib/db';
import { withHandler } from '@/lib/api-handler';
import { createActivitySchema } from '@/lib/schemas/activities';
import { parsePagination, paginate } from '@/lib/schemas/pagination';

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId');
  const where: Prisma.ActivityWhereInput = {};
  if (accountId) where.accountId = accountId;

  const pagination = parsePagination(req);

  const activities = await db.activity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: pagination.limit + 1,
    include: { author: true },
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(activities, pagination.limit);
  return NextResponse.json({ data, meta });
}

export const POST = withHandler(createActivitySchema, async (req, ctx) => {
  const body = ctx.body;
  const { type, summary, detail, source, noteType, accountId } = body;
  const authorId = body.authorId || ctx.session.user.id;

  const activity = await db.activity.create({
    data: { type: (type || 'Note') as ActivityType, summary, detail: detail || '', source: source || 'Manual', noteType, accountId: accountId || undefined, authorId },
  });
  if (accountId) {
    await db.account.update({ where: { id: accountId }, data: { lastActivityAt: new Date() } });
  }
  return NextResponse.json({ data: activity }, { status: 201 });
});
