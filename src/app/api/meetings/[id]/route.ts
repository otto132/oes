import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { adaptMeeting, adaptAccount, adaptContact, adaptActivity, adaptOpportunity } from '@/lib/adapters';
import { patchMeetingSchema } from '@/lib/schemas/meetings';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';
import { logAccess } from '@/lib/access-log';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const { id } = await params;

  const meeting = await db.meeting.findUnique({ where: { id } });
  if (!meeting) return notFound('Meeting not found');

  if (session?.user?.id) {
    logAccess({
      userId: session.user.id,
      entityType: 'Meeting',
      entityId: id,
    });
  }

  const result: Record<string, unknown> = { data: adaptMeeting(meeting) };

  if (meeting.accountId) {
    const account = await db.account.findUnique({
      where: { id: meeting.accountId },
      include: {
        owner: true,
        contacts: { orderBy: { role: 'asc' } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { author: true },
        },
      },
    });
    if (account) {
      result.account = adaptAccount(account);
      result.contacts = account.contacts.map(adaptContact);
      result.activities = account.activities.map(a =>
        adaptActivity({ ...a, account: { id: account.id, name: account.name } }),
      );
      const opportunities = await db.opportunity.findMany({
        where: {
          accountId: account.id,
          stage: { notIn: ['ClosedWon', 'ClosedLost'] },
        },
        include: { owner: true },
      });
      result.opportunities = opportunities.map(o =>
        adaptOpportunity({ ...o, account: { id: account.id, name: account.name } }),
      );
    }
  }

  return NextResponse.json(result);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const { id } = await params;

  const raw = await req.json();
  const parsed = patchMeetingSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  const existing = await db.meeting.findUnique({ where: { id } });
  if (!existing) return notFound('Meeting not found');

  let accountName: string | null | undefined = undefined;
  if (body.accountId !== undefined) {
    if (body.accountId === null) {
      accountName = null;
    } else {
      const account = await db.account.findUnique({
        where: { id: body.accountId },
        select: { name: true },
      });
      accountName = account?.name ?? null;
    }
  }

  const { duration, date, accountId, ...rest } = body;
  const updated = await db.meeting.update({
    where: { id },
    data: {
      ...rest,
      ...(duration !== undefined ? { duration: parseInt(duration, 10) || existing.duration } : {}),
      ...(date ? { date: new Date(date) } : {}),
      ...(accountId !== undefined ? { accountId } : {}),
      ...(accountName !== undefined ? { accountName } : {}),
    },
  });

  return NextResponse.json({ data: adaptMeeting(updated) });
}
