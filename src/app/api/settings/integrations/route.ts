import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const msToken = await db.integrationToken.findFirst({
    where: { provider: 'microsoft' },
    select: { expiresAt: true, updatedAt: true },
  });

  const msConnected = msToken !== null && msToken.expiresAt > new Date();
  const lastSyncAt = msConnected ? msToken.updatedAt.toISOString() : null;

  const integrations = [
    {
      name: 'Microsoft 365 / Outlook',
      status: msConnected ? 'Connected' : 'Disconnected',
      active: msConnected,
      lastSyncAt,
    },
    {
      name: 'Calendar Sync',
      status: msConnected ? 'Connected' : 'Disconnected',
      active: msConnected,
      lastSyncAt,
    },
    {
      name: 'LinkedIn (manual)',
      status: 'Manual enrichment',
      active: false,
      lastSyncAt: null,
    },
  ];

  return NextResponse.json({ data: integrations });
}
