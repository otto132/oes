import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';
import { adaptMeeting } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { createMeetingSchema } from '@/lib/schemas/meetings';
import { parsePagination, paginate } from '@/lib/schemas/pagination';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const url = req.nextUrl;
  const dateParam = url.searchParams.get('date');
  const rangeParam = parseInt(url.searchParams.get('range') ?? '7', 10);
  const range = Math.min(Math.max(rangeParam || 7, 1), 90);

  const startDate = dateParam ? new Date(dateParam) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + range);

  const pagination = parsePagination(req);

  const meetings = await db.meeting.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const { data, meta } = paginate(meetings, pagination.limit);
  return NextResponse.json({ data: data.map(adaptMeeting), meta });
}

export const POST = withHandler(createMeetingSchema, async (_req, ctx) => {
  const db = resolveTenantDb(ctx.session as any);
  const { title, date, startTime, duration, attendees, accountId } = ctx.body;

  let accountName: string | null = null;
  if (accountId) {
    const account = await db.account.findUnique({
      where: { id: accountId },
      select: { name: true },
    });
    accountName = account?.name ?? null;
  }

  const meeting = await db.meeting.create({
    data: {
      title,
      date: new Date(date),
      startTime,
      duration: parseInt(duration, 10) || 30,
      attendees,
      accountId: accountId ?? null,
      accountName,
    },
  });

  return NextResponse.json({ data: adaptMeeting(meeting) }, { status: 201 });
});
