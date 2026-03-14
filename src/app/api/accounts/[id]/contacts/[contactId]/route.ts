import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { requireRole } from '@/lib/rbac';
import { scopedDb } from '@/lib/scoped-db';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';
import { adaptContact } from '@/lib/adapters';

const patchContactSchema = z.object({
  name: z.string().trim().min(1).optional(),
  title: z.string().trim().optional(),
  role: z.enum(['Champion', 'EconomicBuyer', 'TechnicalBuyer', 'Influencer', 'Blocker']).optional(),
  warmth: z.enum(['Strong', 'Warm', 'Cold']).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});

type RouteCtx = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const { id: accountId, contactId } = await params;

  const raw = await req.json();
  const parsed = patchContactSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.accountId !== accountId) {
    return notFound('Contact not found');
  }

  const updated = await db.contact.update({
    where: { id: contactId },
    data: body,
  });

  return NextResponse.json({ data: adaptContact(updated) });
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const denied = requireRole(session, 'ADMIN', 'MEMBER');
  if (denied) return denied;

  const { id: accountId, contactId } = await params;

  // Verify account is within user's access boundary
  const userRole = (session.user as { role?: string }).role ?? 'VIEWER';
  const scoped = scopedDb(session.user.id, userRole);
  const account = await scoped.account.findUnique({ where: { id: accountId } });
  if (!account) return notFound('Account not found');

  // Verify contact belongs to this account
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.accountId !== accountId) {
    return notFound('Contact not found');
  }

  // Snapshot before anonymization
  const beforeSnapshot = {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    title: contact.title,
    linkedinUrl: contact.linkedinUrl,
  };

  // Anonymize
  await db.contact.update({
    where: { id: contactId },
    data: {
      name: 'Deleted Contact',
      email: '',
      phone: null,
      title: '',
      linkedinUrl: null,
      linkedinData: Prisma.DbNull,
      personalProfile: Prisma.DbNull,
    },
  });

  // Audit log
  auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.CONTACT_DELETED,
    entityType: 'Contact',
    entityId: contactId,
    before: beforeSnapshot,
    metadata: { accountId },
  });

  return new NextResponse(null, { status: 204 });
}
