import { z } from 'zod';

const actionItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(200),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
});

const attendeeNoteSchema = z.object({
  contactId: z.string().min(1),
  note: z.string().min(1).max(500),
});

export const meetingOutcomeSchema = z.object({
  summary: z.string().min(1).max(2000),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  actionItems: z.array(actionItemSchema).max(20).optional().default([]),
  attendeeNotes: z.array(attendeeNoteSchema).max(20).optional().default([]),
  // Keep legacy fields for backward compat
  nextSteps: z.string().max(2000).optional(),
  createFollowUp: z.boolean().optional(),
  followUpTitle: z.string().min(1).max(200).optional(),
  followUpDue: z.string().datetime().optional(),
}).refine(
  (data) => !data.createFollowUp || data.followUpTitle,
  { message: 'followUpTitle is required when createFollowUp is true', path: ['followUpTitle'] },
);
