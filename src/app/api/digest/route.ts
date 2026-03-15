import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { adaptDigest } from '@/lib/adapters';

export const GET = withHandler(null, async (req, ctx) => {
  const digests = await ctx.db.weeklyDigest.findMany({
    orderBy: { weekStart: 'desc' },
    take: 12,
  });

  return NextResponse.json({
    data: digests.map(adaptDigest),
    meta: { totalCount: digests.length },
  });
});
