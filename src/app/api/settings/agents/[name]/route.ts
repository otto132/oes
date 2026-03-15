import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantDb } from '@/lib/tenant';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden, notFound, zodError } from '@/lib/api-errors';
import { auditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { MODEL_SONNET, MODEL_HAIKU } from '@/lib/agents/ai';

const VALID_MODELS = [MODEL_SONNET, MODEL_HAIKU];

// Simple cron validation: 5 space-separated parts
function isValidCron(s: string): boolean {
  return /^[0-9*/,-]+\s+[0-9*/,-]+\s+[0-9*/,-]+\s+[0-9*/,-]+\s+[0-9*/,-]+$/.test(s.trim());
}

const patchAgentSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();
  const db = resolveTenantDb(session as any);

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const { name } = await params;

  const raw = await req.json();
  const parsed = patchAgentSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const existing = await db.agentConfig.findUnique({ where: { name } });
  if (!existing) return notFound('Agent not found');

  const { status, parameters } = parsed.data;

  // Validate guardrail parameter values
  if (parameters) {
    if (parameters.model !== undefined && !VALID_MODELS.includes(parameters.model as string)) {
      return NextResponse.json(
        { error: { message: `Invalid model. Must be one of: ${VALID_MODELS.join(', ')}` } },
        { status: 400 },
      );
    }
    if (parameters.schedule !== undefined && !isValidCron(parameters.schedule as string)) {
      return NextResponse.json(
        { error: { message: 'Invalid schedule. Must be a valid 5-field cron expression.' } },
        { status: 400 },
      );
    }
    if (parameters.maxRunsPerDay !== undefined) {
      const val = Number(parameters.maxRunsPerDay);
      if (!Number.isInteger(val) || val < 1 || val > 100) {
        return NextResponse.json(
          { error: { message: 'maxRunsPerDay must be an integer between 1 and 100.' } },
          { status: 400 },
        );
      }
    }
  }

  // Merge parameters with existing ones
  const mergedParameters = parameters !== undefined
    ? { ...(existing.parameters as Record<string, unknown>), ...parameters }
    : undefined;

  const updated = await db.agentConfig.update({
    where: { name },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(mergedParameters !== undefined ? { parameters: mergedParameters as Record<string, string | number | boolean> } : {}),
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
