import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { adaptEmail } from '@/lib/adapters';
import { auth } from '@/lib/auth';

export async function GET() {
  const emails = await db.inboxEmail.findMany({
    where: { isArchived: false },
    orderBy: { receivedAt: 'desc' },
  });
  const unread = emails.filter(e => e.isUnread).length;
  return NextResponse.json({ data: emails.map(adaptEmail), meta: { unreadCount: unread, totalCount: emails.length } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { action, id } = body;

  if (action === 'read') {
    const email = await db.inboxEmail.update({ where: { id }, data: { isUnread: false } });
    return NextResponse.json({ data: adaptEmail(email) });
  }
  if (action === 'archive') {
    const email = await db.inboxEmail.update({ where: { id }, data: { isArchived: true } });
    return NextResponse.json({ data: adaptEmail(email) });
  }
  if (action === 'create_task') {
    const email = await db.inboxEmail.findUnique({ where: { id } });
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const task = await db.task.create({
      data: {
        title: 'Follow up: ' + email.subject.slice(0, 50),
        due: new Date(Date.now() + 2 * 864e5),
        priority: 'High',
        source: 'Inbox',
        accountId: email.accountId || undefined,
        ownerId: session.user.id,
        assignees: { connect: [{ id: session.user.id }] },
      },
    });
    return NextResponse.json({ data: task }, { status: 201 });
  }
  if (action === 'create_account') {
    const email = await db.inboxEmail.findUnique({ where: { id } });
    if (!email || !email.domain) return NextResponse.json({ error: 'No domain' }, { status: 400 });
    const domName = email.domain.split('.')[0].replace(/(^|\s)\S/g, (l: string) => l.toUpperCase());
    const name = email.accountName || domName;
    const dup = await db.account.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (dup) {
      await db.inboxEmail.update({ where: { id }, data: { isLinked: true, accountId: dup.id, accountName: dup.name } });
      const updatedEmail = await db.inboxEmail.findUnique({ where: { id } });
      return NextResponse.json({ data: { account: dup, email: updatedEmail ? adaptEmail(updatedEmail) : null } });
    }
    const account = await db.account.create({
      data: {
        name, type: 'Unknown', status: 'Prospect', ownerId: session.user.id,
        pain: 'Inbound inquiry: ' + email.preview.slice(0, 80),
        whyNow: 'Inbound email received',
      },
    });
    await db.contact.create({
      data: { name: email.fromName, email: email.fromEmail, role: 'Champion', warmth: 'Warm', accountId: account.id },
    });
    await db.inboxEmail.update({ where: { id }, data: { isLinked: true, accountId: account.id, accountName: account.name } });
    const updatedEmail = await db.inboxEmail.findUnique({ where: { id } });
    return NextResponse.json({ data: { account, email: updatedEmail ? adaptEmail(updatedEmail) : null } }, { status: 201 });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
