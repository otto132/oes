import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAgentAnalytics } from '@/lib/agents/analytics';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const period = req.nextUrl.searchParams.get('period') || '30d';
  const days = parseInt(period.replace('d', ''), 10) || 30;
  const analytics = await getAgentAnalytics(days);
  return NextResponse.json(analytics);
}
