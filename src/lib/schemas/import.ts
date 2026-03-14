import { z } from 'zod';

export const csvRowSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required'),
  type: z.enum(['Utility', 'Trader', 'Retailer', 'Industrial', 'Developer', 'Unknown']).optional().default('Unknown'),
  country: z.string().trim().optional().default(''),
  status: z.enum(['Prospect', 'Active', 'Partner', 'Churned']).optional().default('Prospect'),
  notes: z.string().trim().optional().default(''),
});

export type CsvRow = z.infer<typeof csvRowSchema>;
