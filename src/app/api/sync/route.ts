import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncEmails } from '@/lib/integrations/email-sync';
import { syncCalendar } from '@/lib/integrations/calendar-sync';
import { requireRole } from '@/lib/rbac';

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
  const type = body.type || 'all';
  const results: any = {};

  if (type === 'all' || type === 'emails') {
    results.emails = await syncEmails();
  }
  if (type === 'all' || type === 'calendar') {
    results.calendar = await syncCalendar();
  }

  const totalSynced = (results.emails?.synced || 0) + (results.calendar?.synced || 0);
  const allErrors = [...(results.emails?.errors || []), ...(results.calendar?.errors || [])];

  console.log(`Sync complete: ${totalSynced} items synced, ${allErrors.length} errors`);

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
