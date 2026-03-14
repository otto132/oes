import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { meetingOutcomeSchema } from '@/lib/schemas/outcome';
import { adaptActivity } from '@/lib/adapters';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;

  const meeting = await db.meeting.findUnique({ where: { id } });
  if (!meeting) return notFound('Meeting not found');

  const raw = await req.json();
  const parsed = meetingOutcomeSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  // Idempotency: check for existing outcome for this meeting
  const existing = await db.activity.findFirst({
    where: {
      type: 'Meeting',
      source: 'Meeting Outcome',
      detail: { startsWith: `[meeting:${id}]` },
    },
  });
  if (existing) {
    return NextResponse.json({
      data: adaptActivity({ ...existing, account: meeting.accountId ? { id: meeting.accountId, name: '' } : null }),
    });
  }

  const detail = `[meeting:${id}] ${body.summary}${body.nextSteps ? `\n\nNext steps: ${body.nextSteps}` : ''}`;

  // Create activity — include author for adaptActivity
  const activity = await db.activity.create({
    data: {
      type: 'Meeting',
      source: 'Meeting Outcome',
      summary: body.summary.slice(0, 80),
      detail,
      accountId: meeting.accountId,
      authorId: session.user.id,
    },
    include: { author: true },
  });

  // Update account sentiment + lastActivityAt
  if (meeting.accountId) {
    const account = await db.account.findUnique({
      where: { id: meeting.accountId },
      select: { sentimentTrajectory: true },
    });
    const trajectory = (account?.sentimentTrajectory as Array<{ date: string; sentiment: string }>) ?? [];
    trajectory.push({ date: new Date().toISOString(), sentiment: body.sentiment });

    await db.account.update({
      where: { id: meeting.accountId },
      data: {
        lastActivityAt: new Date(),
        sentimentTrajectory: trajectory,
      },
    });
  }

  // Create follow-up task if requested
  let task = null;
  if (body.createFollowUp && body.followUpTitle) {
    task = await db.task.create({
      data: {
        title: body.followUpTitle,
        status: 'Open',
        priority: 'Medium',
        due: body.followUpDue ? new Date(body.followUpDue) : undefined,
        source: 'Meeting Outcome',
        accountId: meeting.accountId,
        ownerId: session.user.id,
      },
    });
  }

  return NextResponse.json(
    {
      data: adaptActivity({ ...activity, account: meeting.accountId ? { id: meeting.accountId, name: '' } : null }),
      ...(task ? { task } : {}),
    },
    { status: 201 },
  );
}
