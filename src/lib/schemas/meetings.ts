import { z } from 'zod';

export const createMeetingSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  date: z.string().trim().min(1, 'Date is required'),
  startTime: z.string().trim().min(1, 'Start time is required'),
  duration: z.string().trim().default('30 min'),
  attendees: z.array(z.string()).default([]),
  accountId: z.string().optional(),
});

export const patchMeetingSchema = z.object({
  prepStatus: z.enum(['draft', 'ready']).optional(),
  title: z.string().trim().min(1).optional(),
  startTime: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  date: z.string().trim().optional(),
  attendees: z.array(z.string()).optional(),
  accountId: z.string().nullable().optional(),
}).superRefine((obj, ctx) => {
  if (!Object.values(obj).some(v => v !== undefined)) {
    ctx.addIssue({ code: 'custom', message: 'At least one field is required' });
  }
});
