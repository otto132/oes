import { z } from 'zod';

export const bulkLeadActionSchema = z.discriminatedUnion('action', [
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

export const bulkOppActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('bulk_move'),
    ids: z.array(z.string().min(1)).min(1).max(50),
    stage: z.string().min(1),
  }),
  z.object({
    action: z.literal('bulk_close_lost'),
    ids: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    action: z.literal('bulk_assign'),
    ids: z.array(z.string().min(1)).min(1).max(50),
    ownerId: z.string().min(1),
  }),
]);
