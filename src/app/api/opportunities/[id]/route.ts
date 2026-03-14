import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scopedDb } from '@/lib/scoped-db';
import { auth } from '@/lib/auth';
import { adaptOpportunity } from '@/lib/adapters';
import { unauthorized, notFound, zodError } from '@/lib/api-errors';

const patchOpportunitySchema = z.object({
  name: z.string().trim().min(1).optional(),
  amount: z.number().min(0).optional(),
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = scopedDb(session.user.id, (session.user as any).role ?? 'MEMBER');

  const { id } = await params;

  const raw = await req.json();
  const parsed = patchOpportunitySchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const body = parsed.data;

  const existing = await db.opportunity.findUnique({
    where: { id },
    include: { owner: true, account: { select: { id: true, name: true } } },
  });
  if (!existing) return notFound('Opportunity not found');

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.closeDate !== undefined) data.closeDate = new Date(body.closeDate);
  if (body.amount !== undefined) {
    data.amount = body.amount;
  }

  const updated = await db.opportunity.update({
    where: { id },
    data: data as any,
    include: { owner: true, account: { select: { id: true, name: true } } },
  });

  const changedFields = Object.keys(body).filter(k => body[k as keyof typeof body] !== undefined);
  await db.activity.create({
    data: {
      type: 'Note',
      summary: 'Opportunity updated',
      detail: `Changed: ${changedFields.join(', ')}`,
      source: 'user',
      accountId: existing.accountId,
      authorId: session.user.id,
    },
  });

  return NextResponse.json({ data: adaptOpportunity(updated as any) });
}
