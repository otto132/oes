import { NextRequest, NextResponse } from 'next/server';
import { AccountType, AccountStatus } from '@prisma/client';
import { auth } from '@/lib/auth';
import { scopedDb } from '@/lib/scoped-db';
import { db as rawDb } from '@/lib/db';
import { unauthorized, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { csvRowSchema } from '@/lib/schemas/import';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';

const MAX_ROWS = 500;

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function mapRow(headers: string[], values: string[], fieldMap: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [csvCol, dbField] of Object.entries(fieldMap)) {
    const idx = headers.indexOf(csvCol.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (idx >= 0 && values[idx] !== undefined) {
      row[dbField] = values[idx];
    }
  }
  return row;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();

    const rl = rateLimit(`acct-import:${session.user.id}`, { limit: 5, windowSec: 60 });
    if (!rl.success) return rateLimitResponse(rl);

    const db = scopedDb(session.user.id, (session.user as any).role ?? 'MEMBER');

    const contentType = req.headers.get('content-type') || '';

    let csvText: string;
    let fieldMap: Record<string, string> | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      if (!file) return badRequest('No file uploaded');
      if (!file.name.endsWith('.csv')) return badRequest('Only CSV files are supported');
      if (file.size > 5 * 1024 * 1024) return badRequest('File too large (max 5MB)');
      csvText = await file.text();
      const mapStr = form.get('fieldMap') as string | null;
      if (mapStr) {
        try { fieldMap = JSON.parse(mapStr); } catch { /* use auto-detect */ }
      }
    } else {
      const body = await req.json();
      if (typeof body?.csv !== 'string' || !body.csv) return badRequest('No CSV data provided');
      csvText = body.csv;
      if (body.fieldMap && typeof body.fieldMap === 'object' && !Array.isArray(body.fieldMap)) {
        fieldMap = body.fieldMap as Record<string, string>;
      }
    }

    const { headers, rows } = parseCSV(csvText);
    if (headers.length === 0) return badRequest('CSV has no headers');
    if (rows.length === 0) return badRequest('CSV has no data rows');
    if (rows.length > MAX_ROWS) return badRequest(`Too many rows (max ${MAX_ROWS})`);

    // Auto-detect field mapping if not provided
    if (!fieldMap) {
      const autoMap: Record<string, string> = {};
      const knownMappings: Record<string, string> = {
        name: 'name', company: 'name', companyname: 'name', accountname: 'name', account: 'name',
        type: 'type', accounttype: 'type',
        country: 'country', region: 'country', location: 'country',
        status: 'status', accountstatus: 'status',
        notes: 'notes', description: 'notes', pain: 'notes', comment: 'notes', comments: 'notes',
      };
      for (const h of headers) {
        const normalized = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (knownMappings[normalized]) {
          autoMap[h] = knownMappings[normalized];
        }
      }
      if (!Object.values(autoMap).includes('name')) {
        // Fallback: first column is name
        autoMap[headers[0]] = 'name';
      }
      fieldMap = autoMap;
    }

    const results: { row: number; status: 'created' | 'skipped' | 'error'; name?: string; error?: string }[] = [];
    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRow(headers, rows[i], fieldMap);
      const parsed = csvRowSchema.safeParse(mapped);

      if (!parsed.success) {
        const msg = parsed.error.issues.map(is => is.message).join(', ');
        results.push({ row: i + 2, status: 'error', name: mapped.name || `Row ${i + 2}`, error: msg });
        errors++;
        continue;
      }

      const { name, type, country, status, notes } = parsed.data;

      // Dedup check
      const existing = await rawDb.account.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) {
        results.push({ row: i + 2, status: 'skipped', name, error: `Account "${existing.name}" already exists` });
        skipped++;
        continue;
      }

      try {
        await db.account.create({
          data: {
            name,
            type: (type || 'Unknown') as AccountType,
            country: country || '',
            status: (status || 'Prospect') as AccountStatus,
            pain: notes || '',
            ownerId: session.user.id,
          },
        });
        results.push({ row: i + 2, status: 'created', name });
        created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ row: i + 2, status: 'error', name, error: msg });
        errors++;
      }
    }

    logger.info('CSV import completed', { created, skipped, errors, total: rows.length });

    return NextResponse.json({
      data: { created, skipped, errors, total: rows.length, results },
    }, { status: created > 0 ? 201 : 200 });
  } catch (err) {
    logger.error('CSV import error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Import failed' } },
      { status: 500 },
    );
  }
}
