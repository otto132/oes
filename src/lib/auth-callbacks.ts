import { db } from '@/lib/db';

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}

export async function testSignInCallback({ user }: { user: { email?: string | null; name?: string | null } }): Promise<boolean> {
  if (!user.email) return false;

  const existing = await db.user.findUnique({ where: { email: user.email } });

  if (existing) {
    if (!existing.isActive) return false;
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: user.name || user.email,
        lastLoginAt: new Date(),
      },
    });
    return true;
  }

  const invitation = await db.invitation.findFirst({
    where: { email: user.email, status: 'PENDING', expiresAt: { gt: new Date() } },
  });

  if (invitation) {
    await db.user.create({
      data: {
        email: user.email,
        name: user.name || user.email,
        initials: deriveInitials(user.name || user.email),
        role: invitation.role,
        lastLoginAt: new Date(),
        tenantId: invitation.tenantId,
      },
    });
    await db.invitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } });
    return true;
  }

  // Auto-create user on first Google sign-in (bypass invitation requirement)
  const tenant = await db.tenant.findFirst();
  await db.user.create({
    data: {
      email: user.email,
      name: user.name || user.email,
      initials: deriveInitials(user.name || user.email),
      role: 'ADMIN',
      lastLoginAt: new Date(),
      ...(tenant ? { tenantId: tenant.id } : {}),
    },
  });
  return true;
}
