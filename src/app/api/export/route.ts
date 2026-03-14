import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveTenantDb } from '@/lib/tenant';
import { requireRole } from '@/lib/rbac';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { logAccess } from '@/lib/access-log';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const denied = requireRole(session, 'ADMIN');
  if (denied) return denied;

  const tenantDb = resolveTenantDb(session as any);

  // Rate limit: check for recent export in last hour (uses global db for audit access)
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

  // Fetch all data (tenant-scoped)
  const [accounts, leads, tasks] = await Promise.all([
    tenantDb.account.findMany({
      include: {
        contacts: true,
        opportunities: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    }),
    tenantDb.lead.findMany(),
    tenantDb.task.findMany(),
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
