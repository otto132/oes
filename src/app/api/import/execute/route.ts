import { NextRequest, NextResponse } from 'next/server';
import { AccountType } from '@prisma/client';
import { auth } from '@/lib/auth';
import { scopedDb } from '@/lib/scoped-db';
import { db as rawDb } from '@/lib/db';
import { unauthorized, badRequest } from '@/lib/api-errors';
import { executeRequestSchema, leadRowSchema } from '@/lib/schemas/import';
import { logger } from '@/lib/logger';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const MAX_ROWS = 2000;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const rl = rateLimit(`import:${session.user.id}`, { limit: 5, windowSec: 60 });
  if (!rl.success) return rateLimitResponse(rl);

  const db = scopedDb(session.user.id, (session.user as any).role ?? 'MEMBER');
  const raw = await req.json();
  const parsed = executeRequestSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues.map(i => i.message).join(', '));

  const { mappings, rows, headers } = parsed.data;

  if (rows.length > MAX_ROWS) return badRequest(`Too many rows (max ${MAX_ROWS})`);

  // Build field mapping: sourceColumnIndex -> targetField
  const fieldMap = new Map<number, string>();
  for (const m of mappings) {
    if (!m.targetField) continue;
    const idx = headers.indexOf(m.sourceColumn);
    if (idx >= 0) fieldMap.set(idx, m.targetField);
  }

  // Pre-validate all rows and build create list before touching DB
  const validatedRows: { row: number; company: string; type: AccountType; country: string; pain: string; source: string }[] = [];
  const validationResults: { row: number; status: 'created' | 'skipped' | 'error'; name?: string; error?: string }[] = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowValues = rows[i];
    const mapped: Record<string, string> = {};
    for (const [idx, field] of fieldMap.entries()) {
      if (rowValues[idx] !== undefined) mapped[field] = rowValues[idx];
    }

    const validatedRow = leadRowSchema.safeParse(mapped);
    if (!validatedRow.success) {
      validationResults.push({ row: i + 2, status: 'error', name: mapped.company, error: validatedRow.error.issues.map(i => i.message).join(', ') });
      errors++;
      continue;
    }
    const { company, type, country, pain, source } = validatedRow.data;
    validatedRows.push({ row: i + 2, company, type: (type || 'Unknown') as AccountType, country: country || '', pain: pain || '', source: source || 'Import' });
  }

  // Batch lookup existing leads to avoid N+1
  const existingLeads = await rawDb.lead.findMany({
    where: { company: { in: validatedRows.map(r => r.company), mode: 'insensitive' } },
    select: { company: true },
  });
  const existingNames = new Set(existingLeads.map(l => l.company.toLowerCase()));

  const toCreate: typeof validatedRows = [];
  for (const vr of validatedRows) {
    if (existingNames.has(vr.company.toLowerCase())) {
      validationResults.push({ row: vr.row, status: 'skipped', name: vr.company, error: 'Lead already exists' });
      skipped++;
    } else {
      toCreate.push(vr);
    }
  }

  // Create all new leads in a single transaction
  let created = 0;
  if (toCreate.length > 0) {
    try {
      await rawDb.$transaction(async (tx: any) => {
        for (const vr of toCreate) {
          await tx.lead.create({
            data: { company: vr.company, type: vr.type, country: vr.country, pain: vr.pain, source: vr.source, stage: 'New', ownerId: session.user.id },
          });
          validationResults.push({ row: vr.row, status: 'created', name: vr.company });
          created++;
        }
      });
    } catch (err) {
      // Transaction failed — all creates rolled back
      const errorMsg = err instanceof Error ? err.message : 'Transaction failed';
      for (const vr of toCreate) {
        if (!validationResults.find(r => r.row === vr.row)) {
          validationResults.push({ row: vr.row, status: 'error', name: vr.company, error: errorMsg });
          errors++;
        }
      }
      created = 0;
    }
  }

  const results = validationResults.sort((a, b) => a.row - b.row);
  logger.info('Lead import completed', { created, skipped, errors, total: rows.length });

  return NextResponse.json(
    { data: { created, skipped, errors, total: rows.length, results } },
    { status: created > 0 ? 201 : 200 },
  );
}
