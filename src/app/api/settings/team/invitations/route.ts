import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveTenantDb } from '@/lib/tenant';
import { unauthorized, forbidden } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const invitations = await db.invitation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ data: invitations });
}
