import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';

const updateAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  pain: z.string().optional(),
  whyNow: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;

  const account = await db.account.findUnique({ where: { id } });
  if (!account) return notFound('Account not found');

  const raw = await req.json();
  const parsed = updateAccountSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { ownerId, type, ...rest } = parsed.data;
  const updated = await db.account.update({
    where: { id },
    data: {
      ...rest,
      ...(type ? { type: type as any } : {}),
      ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}
