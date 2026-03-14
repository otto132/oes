import { NextResponse } from 'next/server';
import { runRetentionCleanup } from '@/lib/retention';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const run = await runRetentionCleanup();
    return NextResponse.json({ data: run });
  } catch (err) {
    logger.error('Retention cleanup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Retention cleanup failed' }, { status: 500 });
  }
}
