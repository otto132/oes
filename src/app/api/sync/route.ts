import { NextRequest, NextResponse } from 'next/server';
import { syncEmails } from '@/lib/integrations/email-sync';
import { syncCalendar } from '@/lib/integrations/calendar-sync';

// POST /api/sync — trigger sync manually or via cron
// Body: { "type": "all" | "emails" | "calendar" }
// Vercel Cron: add to vercel.json: { "crons": [{ "path": "/api/sync", "schedule": "*/15 * * * *" }] }

export async function POST(req: NextRequest) {
  // Verify cron secret if called by scheduler
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
export async function GET() {
  // In production, return last sync timestamp, status, error count
  return NextResponse.json({
    outlook: { status: 'Check /settings for connection status' },
    lastSync: null,
    message: 'POST to this endpoint to trigger sync',
  });
}
