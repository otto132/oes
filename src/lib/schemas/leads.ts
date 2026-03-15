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
  z.object({ action: z.literal('disqualify'), id: z.string().min(1), reason: z.string().trim().optional() }),
  z.object({
    action: z.literal('convert'),
    id: z.string().min(1),
    accountName: z.string().trim().min(1),
    accountType: z.string().trim().optional(),
    oppName: z.string().trim().optional(),
    oppAmount: z.number().positive().optional(),
    oppStage: z.string().trim().optional(),
    ownerId: z.string().optional(),
  }),
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
