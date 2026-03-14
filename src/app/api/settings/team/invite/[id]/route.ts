import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { resolveTenantDb } from '@/lib/tenant';
import { unauthorized, forbidden, notFound, badRequest, zodError } from '@/lib/api-errors';

const revokeSchema = z.object({
  status: z.literal('REVOKED'),
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
  const parsed = revokeSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const invitation = await db.invitation.findUnique({ where: { id } });
  if (!invitation) return notFound('Invitation not found');
  if (invitation.status !== 'PENDING') return badRequest('Only pending invitations can be revoked');

  const updated = await db.invitation.update({
    where: { id },
    data: { status: 'REVOKED' },
    select: { id: true, email: true, role: true, status: true },
  });

  return NextResponse.json({ data: updated });
}
