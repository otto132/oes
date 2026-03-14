import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const events = await db.agentEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ data: events });
}
