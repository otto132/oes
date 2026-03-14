import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden, conflict, zodError, badRequest } from '@/lib/api-errors';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';

const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const raw = await req.json();
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { email, role } = parsed.data;

  // Check domain restriction
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (allowedDomain) {
    const emailDomain = email.split('@')[1];
    if (emailDomain !== allowedDomain) {
      return badRequest(`Only @${allowedDomain} email addresses are allowed`);
    }
  }

  // Check for existing active user with this email
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser && existingUser.isActive) {
    return conflict('A user with this email already exists');
  }

  // Revoke any existing pending invitations for this email
  await db.invitation.updateMany({
    where: { email, status: 'PENDING' },
    data: { status: 'REVOKED' },
  });

  // Create new invitation with 7-day expiry
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = await db.invitation.create({
    data: {
      email,
      role,
      invitedById: session.user.id,
      expiresAt,
      tenantId: dbUser.tenantId,
    },
  });

  auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.USER_INVITED,
    entityType: 'Invitation',
    entityId: invitation.id,
    metadata: { email, role },
  });

  const inviteLink = `/invite?token=${invitation.token}`;

  return NextResponse.json(
    {
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        inviteLink,
        expiresAt: invitation.expiresAt,
      },
    },
    { status: 201 },
  );
}
