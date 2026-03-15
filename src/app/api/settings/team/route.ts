import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveTenantDb } from '@/lib/tenant';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const isAdmin = session.user.role === 'ADMIN';
  const db = resolveTenantDb(session as any);

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      initials: true,
      email: isAdmin,
      role: true,
      color: true,
      isActive: true,
      createdAt: isAdmin,
      lastLoginAt: isAdmin,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: users });
}
