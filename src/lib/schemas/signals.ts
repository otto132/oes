import { z } from 'zod';

export const signalActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dismiss'), id: z.string().min(1) }),
  z.object({
    action: z.literal('convert'),
    id: z.string().min(1),
    company: z.string().trim().min(1, 'Company is required'),
    type: z.string().trim().optional(),
    country: z.string().trim().optional(),
  }),
]);
