import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { scopedDb } from '@/lib/scoped-db';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);
  const scoped = scopedDb(session.user.id, (session.user as any).role ?? 'VIEWER');

  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.length < 2) return NextResponse.json({ data: { accounts: [], opportunities: [], leads: [], signals: [] } });

  const [accounts, opportunities, leads, signals] = await Promise.all([
    scoped.account.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { country: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, type: true, country: true },
      take: 5,
    }),
    scoped.opportunity.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, stage: true, account: { select: { name: true } } },
      take: 5,
    }),
    scoped.lead.findMany({
      where: { OR: [{ company: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, company: true, stage: true, type: true },
      take: 5,
    }),
    scoped.signal.findMany({
      where: { title: { contains: q, mode: 'insensitive' } },
      select: { id: true, title: true, type: true },
      take: 3,
    }),
  ]);

  return NextResponse.json({ data: { accounts, opportunities, leads, signals } });
}
