import { NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const events = await prisma.agentEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ data: events });
}
