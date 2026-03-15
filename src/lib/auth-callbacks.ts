import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

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

  // Pre-approved admin accounts — bypasses auto-provision restriction in production
  const approvedAdmins: string[] = [
    'pade79m@gmail.com',
  ];

  if (approvedAdmins.includes(user.email)) {
    let tenant = await db.tenant.findFirst();
    if (!tenant) {
      tenant = await db.tenant.create({ data: { id: 'tenant-default', name: 'Default', slug: 'default' } });
    }
    await db.user.create({
      data: {
        email: user.email,
        name: user.name || user.email,
        initials: user.name
          ? user.name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).slice(0, 2).join('')
          : user.email.slice(0, 2).toUpperCase(),
        role: 'ADMIN',
        lastLoginAt: new Date(),
        tenantId: tenant.id,
      },
    });
    logger.info('[auth] Auto-provisioned approved admin', { email: user.email });
    return true;
  }

  // Auto-provision: only allowed in development or when ALLOW_AUTO_PROVISION=true
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_AUTO_PROVISION !== 'true') {
    logger.warn('[auth] Rejected unknown user (auto-provisioning disabled in production)', { email: user.email });
    return false;
  }

  // First unknown user becomes ADMIN, subsequent become MEMBER
  const userCount = await db.user.count();
  const role = userCount === 0 ? 'ADMIN' : 'MEMBER';

  // Find or create default tenant
  let tenant = await db.tenant.findFirst();
  if (!tenant) {
    tenant = await db.tenant.create({ data: { id: 'tenant-default', name: 'Default', slug: 'default' } });
  }

  await db.user.create({
    data: {
      email: user.email,
      name: user.name || user.email,
      initials: user.name
        ? user.name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).slice(0, 2).join('')
        : user.email.slice(0, 2).toUpperCase(),
      role,
      lastLoginAt: new Date(),
      tenantId: tenant.id,
    },
  });
  logger.info('[auth] Auto-provisioned user', { email: user.email, role });
  return true;
}
