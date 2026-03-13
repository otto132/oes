import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncEmails } from '@/lib/integrations/email-sync';
import { syncCalendar } from '@/lib/integrations/calendar-sync';
import { requireRole } from '@/lib/rbac';
import { emitEvent } from '@/lib/agents/events';
import { runDueAgents } from '@/lib/agents/runner';
import { db } from '@/lib/db';
import '@/lib/agents'; // registers all agents

// POST /api/sync — trigger sync manually or via cron
// Body: { "type": "all" | "emails" | "calendar" }
// Vercel Cron: add to vercel.json: { "crons": [{ "path": "/api/sync", "schedule": "*/15 * * * *" }] }

/** Require either a valid CRON_SECRET header or an authenticated session. */
async function verifyCronOrSession(req: NextRequest): Promise<NextResponse | null> {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret === process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return null; // authorised via cron secret
  }

  const session = await auth();
  if (session?.user) {
    // Only admins may trigger sync manually
    const denied = requireRole(session, 'ADMIN');
    if (denied) return denied;
    return null; // authorised via session
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const denied = await verifyCronOrSession(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({ type: 'all' }));
  const urlType = req.nextUrl.searchParams.get('type');
  const type = urlType || body.type || 'all';
  const results: any = {};

  if (type === 'all' || type === 'emails') {
    results.emails = await syncEmails();
    await emitEvent('emails_synced', { count: results.emails?.synced || 0, timestamp: new Date().toISOString() });
  }
  if (type === 'all' || type === 'calendar') {
    results.calendar = await syncCalendar();
    await emitEvent('calendar_synced', { count: results.calendar?.synced || 0, timestamp: new Date().toISOString() });
  }

  // Run agents (on all syncs or agent-specific cron)
  if (type === 'all' || type === 'agents') {
    try {
      const agentRuns = await runDueAgents();
      results.agents = { runs: agentRuns.length };
    } catch (err) {
      results.agents = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  const totalSynced = (results.emails?.synced || 0) + (results.calendar?.synced || 0);
  const allErrors = [...(results.emails?.errors || []), ...(results.calendar?.errors || [])];

  console.log(`Sync complete: ${totalSynced} items synced, ${allErrors.length} errors, ${results.agents?.runs || 0} agent runs`);

  // Create a summary alert activity if there were sync errors (visible to admins)
  if (allErrors.length > 0) {
    try {
      const admin = await db.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
      if (admin) {
        const errorSources: string[] = [];
        if (results.emails?.errors?.length) errorSources.push('email');
        if (results.calendar?.errors?.length) errorSources.push('calendar');
        const summary = `Sync alert: ${allErrors.length} error${allErrors.length === 1 ? '' : 's'} in ${errorSources.join(' & ')} sync`;
        const detail = allErrors.slice(0, 10).join('\n');

        await db.activity.create({
          data: {
            type: 'Note',
            summary,
            detail: detail.slice(0, 2000),
            source: 'System Alert',
            authorId: admin.id,
          },
        });
      }
    } catch {
      // Best-effort: don't let alert creation break the sync response
      console.error('Failed to create sync summary alert activity');
    }
  }

  return NextResponse.json({
    success: allErrors.length === 0,
    synced: totalSynced,
    details: results,
    errors: allErrors,
  });
}

// GET /api/sync — check sync status (returns latest SyncLog entries)
export async function GET(req: NextRequest) {
  const denied = await verifyCronOrSession(req);
  if (denied) return denied;

  const recentLogs = await db.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      status: true,
      itemsSynced: true,
      errors: true,
      startedAt: true,
      completedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const lastEmail = recentLogs.find((l) => l.type === 'email');
  const lastCalendar = recentLogs.find((l) => l.type === 'calendar');

  return NextResponse.json({
    lastEmailSync: lastEmail
      ? { status: lastEmail.status, at: lastEmail.completedAt, errors: lastEmail.errors.length }
      : null,
    lastCalendarSync: lastCalendar
      ? { status: lastCalendar.status, at: lastCalendar.completedAt, errors: lastCalendar.errors.length }
      : null,
    recentLogs,
  });
}
