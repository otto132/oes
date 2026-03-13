import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
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

  const { id: accountId, contactId } = await params;

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.accountId !== accountId) {
    return notFound('Contact not found');
  }

  await db.contact.delete({ where: { id: contactId } });

  return NextResponse.json({ success: true });
}
