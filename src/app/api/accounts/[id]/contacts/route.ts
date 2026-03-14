import { NextRequest, NextResponse } from 'next/server';
import { scopedDb } from '@/lib/scoped-db';
import { auth } from '@/lib/auth';
import { createContactSchema } from '@/lib/schemas/contacts';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const { id: accountId } = await params;
  const raw = await req.json();
  const parsed = createContactSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => i.message).join(', ');
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { name, title, role, warmth, email, phone } = parsed.data;

  // Verify account exists
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const contact = await db.contact.create({
    data: {
      name,
      title: title || '',
      role: role || 'Influencer',
      warmth: warmth || 'Cold',
      email: email || '',
      phone: phone || undefined,
      accountId,
    },
  });

  return NextResponse.json({ data: contact }, { status: 201 });
}
