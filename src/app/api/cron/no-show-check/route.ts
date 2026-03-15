import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// Triggered daily at 9 AM by Vercel Cron — checks yesterday's meetings
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
  const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);

  // Find meetings from yesterday with no outcome recorded and not already marked no-show
  const unrecorded = await db.meeting.findMany({
    where: {
      date: { gte: yesterdayStart, lte: yesterdayEnd },
      outcomeRecordedAt: null,
      noShow: false,
    },
  });

  // Notify all active users about each unrecorded meeting
  // NotificationType enum does not include MEETING_NO_OUTCOME; using TASK_DUE as a
  // general-purpose reminder type. Meeting context is stored in entityType/entityId.
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  let checked = 0;
  for (const meeting of unrecorded) {
    for (const userId of userIds) {
      await createNotification(db, {
        userId,
        type: 'TASK_DUE',
        title: `Meeting "${meeting.title}" has no outcome — did it happen?`,
        message: JSON.stringify({
          meetingId: meeting.id,
          actions: ['record_outcome', 'mark_no_show', 'reschedule'],
        }),
        entityType: 'Meeting',
        entityId: meeting.id,
      });
    }
    checked++;
  }

  return NextResponse.json({ data: { checked } });
}
