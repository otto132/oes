import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncEmails } from '@/lib/integrations/email-sync';
import { syncCalendar } from '@/lib/integrations/calendar-sync';
import { requireRole } from '@/lib/rbac';
import { emitEvent } from '@/lib/agents/events';
import { runDueAgents } from '@/lib/agents/runner';
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

  return NextResponse.json({
    success: allErrors.length === 0,
    synced: totalSynced,
    details: results,
    errors: allErrors,
  });
}

// GET /api/sync — check sync status
export async function GET(req: NextRequest) {
  const denied = await verifyCronOrSession(req);
  if (denied) return denied;

  // In production, return last sync timestamp, status, error count
  return NextResponse.json({
    outlook: { status: 'Check /settings for connection status' },
    lastSync: null,
    message: 'POST to this endpoint to trigger sync',
  });
}
