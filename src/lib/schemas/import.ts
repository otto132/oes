import { z } from 'zod';

// Existing account schema — keep for backward compat with /api/accounts/import
export const csvRowSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required'),
  type: z.enum(['Utility', 'Trader', 'Retailer', 'Industrial', 'Developer', 'Unknown']).optional().default('Unknown'),
  country: z.string().trim().optional().default(''),
  status: z.enum(['Prospect', 'Active', 'Partner', 'Churned']).optional().default('Prospect'),
  notes: z.string().trim().optional().default(''),
});

export type CsvRow = z.infer<typeof csvRowSchema>;

// Lead import schema
export const leadRowSchema = z.object({
  company: z.string().trim().min(1, 'Company name is required'),
  type: z.string().trim().optional().default('Unknown'),
  country: z.string().trim().optional().default(''),
  pain: z.string().trim().optional().default(''),
  source: z.string().trim().optional().default('Import'),
});

// Analyze request — for AI column mapping
export const analyzeRequestSchema = z.object({
  headers: z.array(z.string()).min(1),
  sampleRows: z.array(z.array(z.string())).min(1).max(5),
});

// Execute request — leads only
export const executeRequestSchema = z.object({
  mappings: z.array(z.object({
    sourceColumn: z.string(),
    targetField: z.string().nullable(),
  })),
  rows: z.array(z.array(z.string())),
  headers: z.array(z.string()),
});
