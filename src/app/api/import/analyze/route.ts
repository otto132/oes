import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { unauthorized, badRequest } from '@/lib/api-errors';
import { analyzeRequestSchema } from '@/lib/schemas/import';
import { LEAD_IMPORT_FIELDS } from '@/lib/import-fields';
import { logger } from '@/lib/logger';

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const raw = await req.json();
  const parsed = analyzeRequestSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues.map(i => i.message).join(', '));

  const { headers, sampleRows } = parsed.data;

  const fieldList = LEAD_IMPORT_FIELDS.map(f => `  - "${f.key}" (${f.label}${f.required ? ', REQUIRED' : ''})`).join('\n');

  const sampleTable = [headers, ...sampleRows].map(row => row.join(' | ')).join('\n');

  const prompt = `You are a CRM data import assistant. Analyze the following CSV/spreadsheet headers and sample data, then map each column to the best matching lead field.

Available target fields:
${fieldList}

CSV Headers and sample data:
${sampleTable}

Rules:
1. Map each source column to exactly one target field key, or null if no match.
2. Be generous with matching — "Company Name" maps to "company", "Description" maps to "pain", "Origin" maps to "source", etc.
3. Return ONLY valid JSON, no explanation.

Return this exact JSON structure:
{
  "mappings": [
    { "sourceColumn": "header name", "targetField": "field key or null" }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('AI mapping: no JSON in response', { text });
      return badRequest('AI could not analyze the file. Try adjusting headers.');
    }

    const mapping = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ data: mapping });
  } catch (err) {
    logger.error('AI mapping error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: { code: 'AI_ERROR', message: 'AI analysis failed. Please try again.' } },
      { status: 500 },
    );
  }
}
