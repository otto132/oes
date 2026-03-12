import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q || q.length < 2) return NextResponse.json({ data: { accounts: [], opportunities: [], leads: [], signals: [] } });

  const [accounts, opportunities, leads, signals] = await Promise.all([
    db.account.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { country: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, type: true, country: true },
      take: 5,
    }),
    db.opportunity.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, name: true, stage: true, account: { select: { name: true } } },
      take: 5,
    }),
    db.lead.findMany({
      where: { OR: [{ company: { contains: q, mode: 'insensitive' } }] },
      select: { id: true, company: true, stage: true, type: true },
      take: 5,
    }),
    db.signal.findMany({
      where: { title: { contains: q, mode: 'insensitive' } },
      select: { id: true, title: true, type: true },
      take: 3,
    }),
  ]);

  return NextResponse.json({ data: { accounts, opportunities, leads, signals } });
}
