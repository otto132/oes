import { z } from 'zod';

export const leadActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    company: z.string().trim().min(1, 'Company is required'),
    type: z.string().trim().optional(),
    country: z.string().trim().optional(),
    pain: z.string().trim().optional(),
    ownerId: z.string().optional(),
  }),
  z.object({ action: z.literal('advance'), id: z.string().min(1) }),
  z.object({
    action: z.literal('disqualify'),
    id: z.string().min(1),
    reason: z.string().trim().min(1, 'Disqualify reason is required'),
  }),
  z.object({
    action: z.literal('convert'),
    id: z.string().min(1),
    accountName: z.string().trim().min(1),
    accountType: z.string().trim().optional(),
    oppName: z.string().trim().min(1, 'Opportunity name is required'),
    oppAmount: z.number().nonnegative().optional(),
    closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format').optional(),
    ownerId: z.string().optional(),
  }),
  z.object({
    action: z.literal('pause'),
    id: z.string().min(1),
    pausedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format'),
  }),
  z.object({ action: z.literal('requalify'), id: z.string().min(1) }),
  z.object({
    action: z.literal('bulk_advance'),
    ids: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    action: z.literal('bulk_disqualify'),
    ids: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    action: z.literal('bulk_assign'),
    ids: z.array(z.string().min(1)).min(1).max(50),
    ownerId: z.string().min(1),
  }),
]);
