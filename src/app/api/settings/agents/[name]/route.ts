import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden, notFound, zodError } from '@/lib/api-errors';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';

const patchAgentSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  parameters: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const { name } = await params;

  const raw = await req.json();
  const parsed = patchAgentSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const existing = await db.agentConfig.findUnique({ where: { name } });
  if (!existing) return notFound('Agent not found');

  const { status, parameters } = parsed.data;

  const updated = await db.agentConfig.update({
    where: { name },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
    },
  });

  auditLog({
    userId: session.user.id,
    action: AUDIT_ACTIONS.AGENT_CONFIG_UPDATED,
    entityType: 'AgentConfig',
    entityId: updated.id,
    before: { status: existing.status, parameters: existing.parameters },
    after: { status: updated.status, parameters: updated.parameters },
  });

  return NextResponse.json({ data: updated });
}
