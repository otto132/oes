import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { adaptAccount } from '@/lib/adapters';
import { patchAccountSchema } from '@/lib/schemas/accounts';
import { unauthorized, notFound, conflict, zodError } from '@/lib/api-errors';

const AI_FIELDS = new Set([
  'pain', 'whyNow', 'moduleFit', 'competitors', 'aiConfidence',
  'scoreFit', 'scoreIntent', 'scoreUrgency', 'scoreAccess', 'scoreCommercial',
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;

  const raw = await req.json();
  const parsed = patchAccountSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  const existing = await db.account.findUnique({ where: { id } });
  if (!existing) return notFound('Account not found');

  if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await db.account.findFirst({
      where: {
        name: { equals: body.name, mode: 'insensitive' },
        id: { not: id },
      },
    });
    if (dup) return conflict(`Account "${dup.name}" already exists`);
  }

  const hasAiChange = Object.keys(body).some(k => AI_FIELDS.has(k));
  const changedFields = Object.keys(body);

  const updated = await db.account.update({
    where: { id },
    data: {
      ...(body as Prisma.AccountUpdateInput),
      ...(hasAiChange ? { aiUpdatedAt: new Date() } : {}),
    },
    include: { owner: true, contacts: { orderBy: { role: 'asc' } } },
  });

  await db.activity.create({
    data: {
      type: 'Note',
      summary: 'Account updated',
      detail: `Changed: ${changedFields.join(', ')}`,
      source: 'user',
      accountId: id,
      authorId: session.user.id,
    },
  });

  return NextResponse.json({ data: adaptAccount(updated) });
}
