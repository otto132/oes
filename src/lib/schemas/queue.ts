import { z } from 'zod';

export const queueActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    id: z.string().min(1),
    editedPayload: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('reject'),
    id: z.string().min(1),
    reason: z.string().min(1, 'Rejection reason is required'),
  }),
]);
