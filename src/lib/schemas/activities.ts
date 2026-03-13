import { z } from 'zod';

export const createActivitySchema = z.object({
  type: z.string().trim().min(1, 'Activity type is required'),
  accountId: z.string().min(1),
  summary: z.string().trim().min(1, 'Summary is required'),
  detail: z.string().trim().optional(),
  noteType: z.string().trim().optional(),
  source: z.string().trim().optional(),
  authorId: z.string().optional(),
});
