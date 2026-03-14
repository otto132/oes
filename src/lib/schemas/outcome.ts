import { z } from 'zod';

export const meetingOutcomeSchema = z.object({
  summary: z.string().min(1).max(2000),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  nextSteps: z.string().max(2000).optional(),
  createFollowUp: z.boolean().optional(),
  followUpTitle: z.string().min(1).max(200).optional(),
  followUpDue: z.string().datetime().optional(),
}).refine(
  (data) => !data.createFollowUp || data.followUpTitle,
  { message: 'followUpTitle is required when createFollowUp is true', path: ['followUpTitle'] },
);
