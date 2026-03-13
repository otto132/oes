import { z } from 'zod';

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required'),
  type: z.string().trim().optional(),
  country: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ownerId: z.string().optional(),
});

export const updateAccountSchema = z.object({
  pain: z.string().trim().optional(),
  status: z.string().trim().optional(),
  whyNow: z.string().trim().optional(),
  notes: z.string().trim().optional(),
}).superRefine((obj, ctx) => {
  const hasValue = Object.values(obj).some(v => v !== undefined);
  if (!hasValue) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});
