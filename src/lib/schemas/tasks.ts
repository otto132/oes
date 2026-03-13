import { z } from 'zod';

export const taskActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    title: z.string().trim().min(1, 'Task title is required'),
    accountId: z.string().optional(),
    priority: z.enum(['Low', 'Medium', 'High']).optional(),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format').optional(),
    assigneeIds: z.array(z.string()).optional(),
    reviewerId: z.string().optional(),
    goalId: z.string().optional(),
  }),
  z.object({
    action: z.literal('complete'),
    id: z.string().min(1),
    outcome: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    followUpTasks: z.array(z.object({
      title: z.string().trim().min(1),
      source: z.enum(['ai_suggested', 'custom']).optional(),
    })).optional(),
  }),
  z.object({ action: z.literal('comment'), id: z.string().min(1), text: z.string().trim().min(1, 'Comment text is required'), mentionedUserIds: z.array(z.string()).optional() }),
  z.object({ action: z.literal('send_for_review'), id: z.string().min(1) }),
]);
