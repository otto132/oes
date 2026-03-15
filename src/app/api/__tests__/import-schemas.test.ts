import { describe, it, expect } from 'vitest';
import { leadRowSchema, analyzeRequestSchema, executeRequestSchema } from '@/lib/schemas/import';

describe('leadRowSchema', () => {
  it('validates valid input', () => {
    const result = leadRowSchema.safeParse({
      company: 'Acme Corp',
      type: 'Utility',
      country: 'US',
      pain: 'High energy costs',
      source: 'Trade Show',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company).toBe('Acme Corp');
      expect(result.data.type).toBe('Utility');
      expect(result.data.country).toBe('US');
      expect(result.data.pain).toBe('High energy costs');
      expect(result.data.source).toBe('Trade Show');
    }
  });

  it('rejects empty company', () => {
    const result = leadRowSchema.safeParse({ company: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Company name is required');
    }
  });

  it('rejects missing company', () => {
    const result = leadRowSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('provides defaults for optional fields', () => {
    const result = leadRowSchema.safeParse({ company: 'Test Co' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('Unknown');
      expect(result.data.country).toBe('');
      expect(result.data.pain).toBe('');
      expect(result.data.source).toBe('Import');
    }
  });

  it('trims whitespace from company', () => {
    const result = leadRowSchema.safeParse({ company: '  Acme Corp  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company).toBe('Acme Corp');
    }
  });
});

describe('analyzeRequestSchema', () => {
  it('validates valid input', () => {
    const result = analyzeRequestSchema.safeParse({
      headers: ['Company', 'Country'],
      sampleRows: [['Acme', 'US']],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty headers', () => {
    const result = analyzeRequestSchema.safeParse({
      headers: [],
      sampleRows: [['Acme']],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty sampleRows', () => {
    const result = analyzeRequestSchema.safeParse({
      headers: ['Company'],
      sampleRows: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 5 sample rows', () => {
    const result = analyzeRequestSchema.safeParse({
      headers: ['Company'],
      sampleRows: [['A'], ['B'], ['C'], ['D'], ['E'], ['F']],
    });
    expect(result.success).toBe(false);
  });

  it('accepts up to 5 sample rows', () => {
    const result = analyzeRequestSchema.safeParse({
      headers: ['Company'],
      sampleRows: [['A'], ['B'], ['C'], ['D'], ['E']],
    });
    expect(result.success).toBe(true);
  });
});

describe('executeRequestSchema', () => {
  it('validates valid input', () => {
    const result = executeRequestSchema.safeParse({
      mappings: [{ sourceColumn: 'Name', targetField: 'company' }],
      rows: [['Acme Corp']],
      headers: ['Name'],
    });
    expect(result.success).toBe(true);
  });

  it('allows null targetField for skipped columns', () => {
    const result = executeRequestSchema.safeParse({
      mappings: [{ sourceColumn: 'Extra', targetField: null }],
      rows: [['something']],
      headers: ['Extra'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mappings[0].targetField).toBeNull();
    }
  });

  it('rejects missing mappings', () => {
    const result = executeRequestSchema.safeParse({
      rows: [['Acme']],
      headers: ['Name'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing rows', () => {
    const result = executeRequestSchema.safeParse({
      mappings: [{ sourceColumn: 'Name', targetField: 'company' }],
      headers: ['Name'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing headers', () => {
    const result = executeRequestSchema.safeParse({
      mappings: [{ sourceColumn: 'Name', targetField: 'company' }],
      rows: [['Acme']],
    });
    expect(result.success).toBe(false);
  });
});
