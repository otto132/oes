import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

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
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: users });
}
