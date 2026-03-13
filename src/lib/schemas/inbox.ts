import { z } from 'zod';

export const inboxActionSchema = z.object({
  action: z.enum(['read', 'archive', 'create_task', 'create_account']),
  id: z.string().min(1),
});
