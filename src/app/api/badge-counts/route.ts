// src/app/api/badge-counts/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const [pendingQueue, newSignals, newLeads, unreadEmails, overdueTasks] = await Promise.all([
    db.queueItem.count({ where: { status: 'pending' } }),
    db.signal.count({ where: { status: 'new_signal' } }),
    db.lead.count({ where: { stage: 'New' } }),
    db.inboxEmail.count({ where: { isUnread: true, isArchived: false } }),
    db.task.count({ where: { status: { not: 'Done' }, due: { lt: new Date() } } }),
  ]);

  return NextResponse.json({
    queue: pendingQueue,
    signals: newSignals,
    leads: newLeads,
    inbox: unreadEmails,
    tasks: overdueTasks,
  });
}
