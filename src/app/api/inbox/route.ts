import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { adaptEmail } from '@/lib/adapters';
import { withHandler } from '@/lib/api-handler';
import { inboxActionSchema } from '@/lib/schemas/inbox';
import { notFound, unauthorized } from '@/lib/api-errors';
import { parsePagination, paginate } from '@/lib/schemas/pagination';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const pagination = parsePagination(req);

  const totalCount = await db.inboxEmail.count({ where: { isArchived: false } });
  const unreadCount = await db.inboxEmail.count({ where: { isArchived: false, isUnread: true } });

  const emails = await db.inboxEmail.findMany({
    where: { isArchived: false }, orderBy: { receivedAt: 'desc' },
    take: pagination.limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });
  const { data, meta } = paginate(emails, pagination.limit);
  return NextResponse.json({ data: data.map(adaptEmail), meta: { ...meta, unreadCount, totalCount } });
}

export const POST = withHandler(inboxActionSchema, async (req, ctx) => {
  const db = resolveTenantDb(ctx.session as any);
  const body = ctx.body;
  const { action, id } = body;
  const session = ctx.session;

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
    if (!email) return notFound('Email not found');
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
    if (!email || !email.domain) return notFound('Email not found');
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
});
