import { z } from 'zod';

const subtaskSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  done: z.boolean(),
  position: z.number().int().min(0),
});

export const patchTaskSchema = z.object({
  title: z.string().trim().min(1).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigneeIds: z.array(z.string()).optional(),
  reviewerId: z.string().nullable().optional(),
  notes: z.string().optional(),
  subtasks: z.array(subtaskSchema).max(20).optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});

export const taskActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    title: z.string().trim().min(1, 'Task title is required'),
    accountId: z.string().optional(),
    priority: z.enum(['Low', 'Medium', 'High']).optional(),
    due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
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
