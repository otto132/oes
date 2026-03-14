import { z } from 'zod';

export const opportunityActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1, 'Opportunity name is required'),
    accountId: z.string().min(1),
    stage: z.string().trim().optional(),
    amount: z.number().positive().optional(),
    closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format').optional(),
    ownerId: z.string().optional(),
  }),
  z.object({ action: z.literal('move'), id: z.string().min(1), stage: z.string().trim().min(1, 'Target stage is required') }),
  z.object({ action: z.literal('close_won'), id: z.string().min(1), winNotes: z.string().trim().optional(), competitorBeaten: z.string().trim().optional(), keyStakeholders: z.string().trim().optional(), lessonsLearned: z.string().trim().optional() }),
  z.object({
    action: z.literal('close_lost'),
    id: z.string().min(1),
    lossReason: z.string().trim().min(1, 'Loss reason is required'),
    lossCompetitor: z.string().trim().optional(),
    lossNotes: z.string().trim().optional(),
    lessonsLearned: z.string().trim().optional(),
  }),
]);
