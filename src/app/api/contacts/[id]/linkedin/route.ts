import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { z } from 'zod';
import { unauthorized } from '@/lib/api-errors';

const LinkedInPasteSchema = z.object({
  linkedinText: z.string().min(10).max(50000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const { id } = await params;

  const contact = await db.contact.findUnique({
    where: { id },
    select: { id: true, accountId: true },
  });

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = LinkedInPasteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  await db.contact.update({
    where: { id },
    data: { linkedinData: { rawText: parsed.data.linkedinText, pastedAt: new Date().toISOString() } },
  });

  const { emitEvent } = await import('@/lib/agents/events');
  await emitEvent('linkedin_paste', {
    contactId: id,
    accountId: contact.accountId,
    linkedinText: parsed.data.linkedinText,
  });

  return NextResponse.json({ success: true, message: 'LinkedIn data saved. Enrichment queued.' });
}
