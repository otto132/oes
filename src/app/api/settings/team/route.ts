import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      initials: true,
      email: true,
      role: true,
      color: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: users });
}
