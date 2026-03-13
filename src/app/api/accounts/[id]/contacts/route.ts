import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;
  const body = await req.json();
  const { name, title, role, warmth, email, phone } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Verify account exists
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const contact = await db.contact.create({
    data: {
      name: name.trim(),
      title: title?.trim() || '',
      role: role || 'Influencer',
      warmth: warmth || 'Cold',
      email: email?.trim() || '',
      phone: phone?.trim() || undefined,
      accountId,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
