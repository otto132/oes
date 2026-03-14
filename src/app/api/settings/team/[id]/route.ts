import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden, notFound, badRequest, zodError } from '@/lib/api-errors';

const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const { id } = await params;

  const raw = await req.json();
  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { role, isActive } = parsed.data;

  const targetUser = await db.user.findUnique({ where: { id } });
  if (!targetUser) return notFound('User not found');

  // Cannot deactivate yourself
  if (isActive === false && id === session.user.id) {
    return badRequest('Cannot deactivate yourself');
  }

  // Prevent self-role-change
  if (id === session.user.id && parsed.data.role) {
    return badRequest('Cannot change your own role');
  }

  // Prevent removing the last admin
  if (targetUser.role === 'ADMIN' && (role && role !== 'ADMIN' || isActive === false)) {
    const adminCount = await db.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
    if (adminCount <= 1) {
      return badRequest('Cannot remove or deactivate the last admin');
    }
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: updated });
}
