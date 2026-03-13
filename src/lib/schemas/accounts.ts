import { z } from 'zod';

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required'),
  type: z.string().trim().optional(),
  country: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ownerId: z.string().optional(),
});

export const patchAccountSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.string().trim().optional(),
  country: z.string().trim().optional(),
  countryCode: z.string().trim().optional(),
  region: z.string().trim().optional(),
  status: z.enum(['Prospect', 'Active', 'Partner', 'Churned']).optional(),
  notes: z.string().trim().optional(),
  pain: z.string().trim().optional(),
  whyNow: z.string().trim().optional(),
  moduleFit: z.array(z.string()).optional(),
  competitors: z.string().trim().optional(),
  aiConfidence: z.number().min(0).max(100).optional(),
  scoreFit: z.number().min(0).max(100).optional(),
  scoreIntent: z.number().min(0).max(100).optional(),
  scoreUrgency: z.number().min(0).max(100).optional(),
  scoreAccess: z.number().min(0).max(100).optional(),
  scoreCommercial: z.number().min(0).max(100).optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});
