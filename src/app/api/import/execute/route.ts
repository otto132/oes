import { NextRequest, NextResponse } from 'next/server';
import { AccountType } from '@prisma/client';
import { auth } from '@/lib/auth';
import { scopedDb } from '@/lib/scoped-db';
import { db as rawDb } from '@/lib/db';
import { unauthorized, badRequest } from '@/lib/api-errors';
import { executeRequestSchema, leadRowSchema } from '@/lib/schemas/import';
import { logger } from '@/lib/logger';

const MAX_ROWS = 2000;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

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

  const results: { row: number; status: 'created' | 'skipped' | 'error'; name?: string; error?: string }[] = [];
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowValues = rows[i];
    const mapped: Record<string, string> = {};

    for (const [idx, field] of fieldMap.entries()) {
      if (rowValues[idx] !== undefined) {
        mapped[field] = rowValues[idx];
      }
    }

    try {
      const validatedRow = leadRowSchema.safeParse(mapped);
      if (!validatedRow.success) {
        results.push({ row: i + 2, status: 'error', name: mapped.company, error: validatedRow.error.issues.map(i => i.message).join(', ') });
        errors++;
        continue;
      }
      const { company, type, country, pain, source } = validatedRow.data;
      const existing = await rawDb.lead.findFirst({ where: { company: { equals: company, mode: 'insensitive' } } });
      if (existing) { results.push({ row: i + 2, status: 'skipped', name: company, error: 'Lead already exists' }); skipped++; continue; }
      await db.lead.create({ data: { company, type: (type || 'Unknown') as AccountType, country: country || '', pain: pain || '', source: source || 'Import', stage: 'New', ownerId: session.user.id } });
      results.push({ row: i + 2, status: 'created', name: company });
      created++;
    } catch (err) {
      const name = mapped.company || `Row ${i + 2}`;
      results.push({ row: i + 2, status: 'error', name, error: err instanceof Error ? err.message : 'Failed' });
      errors++;
    }
  }

  logger.info('Lead import completed', { created, skipped, errors, total: rows.length });

  return NextResponse.json(
    { data: { created, skipped, errors, total: rows.length, results } },
    { status: created > 0 ? 201 : 200 },
  );
}
