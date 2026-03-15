import { z } from 'zod';

export const inboxActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), id: z.string().min(1) }),
  z.object({ action: z.literal('archive'), id: z.string().min(1) }),
  z.object({ action: z.literal('create_task'), id: z.string().min(1) }),
  z.object({ action: z.literal('create_account'), id: z.string().min(1) }),
  z.object({ action: z.literal('snooze'), id: z.string().min(1), snoozedUntil: z.string().datetime() }),
]);
