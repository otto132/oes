import { NextResponse } from 'next/server';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const userId = session.user.id;

  // Fetch user's Microsoft token
  const msToken = await db.integrationToken.findUnique({
    where: { provider_userId: { provider: 'microsoft', userId } },
    select: { status: true, expiresAt: true, updatedAt: true },
  });

  // Fetch latest sync logs for this user
  const [lastEmailSync, lastCalendarSync] = await Promise.all([
    db.syncLog.findFirst({
      where: { userId, type: 'email' },
      orderBy: { startedAt: 'desc' },
      select: { status: true, itemsSynced: true, errors: true, completedAt: true, startedAt: true },
    }),
    db.syncLog.findFirst({
      where: { userId, type: 'calendar' },
      orderBy: { startedAt: 'desc' },
      select: { status: true, itemsSynced: true, errors: true, completedAt: true, startedAt: true },
    }),
  ]);

  // Fetch sync history (last 5 entries)
  const syncHistory = await db.syncLog.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: { id: true, type: true, status: true, itemsSynced: true, errors: true, startedAt: true, completedAt: true },
  });

  // Counts (org-wide — InboxEmail/Meeting models don't have per-user ownership)
  const [emailCount, meetingCount] = await Promise.all([
    db.inboxEmail.count(),
    db.meeting.count(),
  ]);

  // Token with active status is considered connected — runSync handles refresh transparently
  const isConnected = msToken !== null && msToken.status === 'active';
  const needsReconnect = msToken?.status === 'error' || msToken?.status === 'revoked';

  const lastEmailError = lastEmailSync?.status === 'failed' || lastEmailSync?.status === 'partial'
    ? lastEmailSync.errors[0] || null
    : null;
  const lastCalendarError = lastCalendarSync?.status === 'failed' || lastCalendarSync?.status === 'partial'
    ? lastCalendarSync.errors[0] || null
    : null;

  const integrations = [
    {
      provider: 'microsoft',
      name: 'Microsoft 365 / Outlook',
      status: isConnected ? 'connected' : needsReconnect ? 'error' : 'disconnected',
      active: isConnected,
      needsReconnect,
      lastSyncAt: lastEmailSync?.completedAt?.toISOString() || null,
      emailsSynced: emailCount,
      lastError: lastEmailError,
    },
    {
      provider: 'calendar',
      name: 'Calendar Sync',
      status: isConnected ? 'connected' : needsReconnect ? 'error' : 'disconnected',
      active: isConnected,
      needsReconnect,
      lastSyncAt: lastCalendarSync?.completedAt?.toISOString() || null,
      meetingsSynced: meetingCount,
      lastError: lastCalendarError,
    },
    {
      provider: 'linkedin',
      name: 'LinkedIn (manual)',
      status: 'manual',
      active: false,
      needsReconnect: false,
      lastSyncAt: null,
      lastError: null,
    },
  ];

  return NextResponse.json({
    data: integrations,
    syncHistory: syncHistory.map(s => ({
      id: s.id,
      type: s.type,
      status: s.status,
      itemsSynced: s.itemsSynced,
      errorCount: s.errors.length,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() || null,
    })),
  });
}
