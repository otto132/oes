import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { updateAgentConfigSchema } from '@/lib/schemas/agents';
import { getAgent } from '@/lib/agents/registry';
import { runAgent } from '@/lib/agents/runner';

type RouteContext = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await ctx.params;
  const config = await prisma.agentConfig.findUnique({ where: { name } });
  if (!config) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, { status: 404 });
  }
  const recentRuns = await prisma.agentRun.findMany({
    where: { agentName: name },
    orderBy: { startedAt: 'desc' },
    take: 10,
  });
  return NextResponse.json({ data: { ...config, recentRuns } });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await ctx.params;
  const body = await req.json();
  const parsed = updateAgentConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues } },
      { status: 400 }
    );
  }
  const updateData: Prisma.AgentConfigUpdateInput = {
    ...(parsed.data.status && { status: parsed.data.status }),
    ...(parsed.data.parameters && {
      parameters: parsed.data.parameters as Prisma.InputJsonValue,
    }),
  };
  const updated = await prisma.agentConfig.update({
    where: { name },
    data: updateData,
  });
  return NextResponse.json({ data: updated });
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await ctx.params;
  const agent = getAgent(name);
  if (!agent) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Agent "${name}" not registered` } },
      { status: 404 }
    );
  }
  const run = await runAgent(agent, 'manual');
  if (!run) {
    return NextResponse.json(
      { error: { code: 'SKIPPED', message: 'Agent is paused or already running' } },
      { status: 409 }
    );
  }
  return NextResponse.json({ data: run });
}
