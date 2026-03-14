import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/rbac';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { logAccess } from '@/lib/access-log';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const denied = requireRole(session, 'ADMIN');
  if (denied) return denied;

  // Rate limit: check for recent export in last hour (synchronous)
  const recentExport = await db.auditLog.findFirst({
    where: {
      action: AUDIT_ACTIONS.DATA_EXPORTED,
      createdAt: { gt: new Date(Date.now() - 3600_000) },
    },
  });
  if (recentExport) {
    return NextResponse.json(
      { error: 'Export rate limit exceeded. Try again in 1 hour.' },
      { status: 429 },
    );
  }

  // Fetch all data
  const [accounts, leads, tasks] = await Promise.all([
    db.account.findMany({
      include: {
        contacts: true,
        opportunities: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    }),
    db.lead.findMany(),
    db.task.findMany(),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((a) => ({
      ...a,
      contacts: a.contacts,
      opportunities: a.opportunities,
      activities: a.activities,
    })),
    leads,
    tasks,
  };

  const recordCount = accounts.length + leads.length + tasks.length;

  // Synchronous audit log for rate limit reliability
  await auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.DATA_EXPORTED,
    entityType: 'Export',
    entityId: 'full-export',
    metadata: { format: 'json', recordCount },
  });

  logAccess({
    userId: session.user.id,
    entityType: 'Export',
    entityId: 'full-export',
  });

  return NextResponse.json(exportData);
}
