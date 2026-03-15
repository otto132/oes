import { describe, it, expect } from 'vitest';
import { meetingOutcomeSchema } from '@/lib/schemas/outcome';

describe('meetingOutcomeSchema', () => {
  const validBase = { summary: 'Good meeting', sentiment: 'positive' as const };

  it('accepts minimal valid input', () => {
    const result = meetingOutcomeSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionItems).toEqual([]);
      expect(result.data.attendeeNotes).toEqual([]);
    }
  });

  it('rejects empty summary', () => {
    const result = meetingOutcomeSchema.safeParse({ ...validBase, summary: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid sentiment', () => {
    const result = meetingOutcomeSchema.safeParse({ ...validBase, sentiment: 'awesome' });
    expect(result.success).toBe(false);
  });

  it('accepts action items with description only', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      actionItems: [{ description: 'Send proposal' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionItems).toHaveLength(1);
      expect(result.data.actionItems[0].description).toBe('Send proposal');
    }
  });

  it('accepts action items with all fields', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      actionItems: [{ description: 'Send proposal', assignee: 'user-1', dueDate: '2026-04-01' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects action items with empty description', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      actionItems: [{ description: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 action items', () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ description: `Item ${i}` }));
    const result = meetingOutcomeSchema.safeParse({ ...validBase, actionItems: items });
    expect(result.success).toBe(false);
  });

  it('accepts attendee notes', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      attendeeNotes: [{ contactId: 'contact-1', note: 'Very engaged' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attendeeNotes).toHaveLength(1);
    }
  });

  it('rejects attendee notes with empty contactId', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      attendeeNotes: [{ contactId: '', note: 'Some note' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects attendee notes with empty note', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      attendeeNotes: [{ contactId: 'contact-1', note: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 attendee notes', () => {
    const notes = Array.from({ length: 21 }, (_, i) => ({ contactId: `c-${i}`, note: 'Note' }));
    const result = meetingOutcomeSchema.safeParse({ ...validBase, attendeeNotes: notes });
    expect(result.success).toBe(false);
  });

  it('accepts legacy nextSteps field', () => {
    const result = meetingOutcomeSchema.safeParse({ ...validBase, nextSteps: 'Follow up next week' });
    expect(result.success).toBe(true);
  });

  it('requires followUpTitle when createFollowUp is true', () => {
    const result = meetingOutcomeSchema.safeParse({ ...validBase, createFollowUp: true });
    expect(result.success).toBe(false);
  });

  it('accepts createFollowUp with followUpTitle', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      createFollowUp: true,
      followUpTitle: 'Follow-up call',
    });
    expect(result.success).toBe(true);
  });

  it('defaults actionItems and attendeeNotes when omitted', () => {
    const result = meetingOutcomeSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionItems).toEqual([]);
      expect(result.data.attendeeNotes).toEqual([]);
    }
  });

  it('rejects action item description over 200 chars', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      actionItems: [{ description: 'x'.repeat(201) }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects attendee note over 500 chars', () => {
    const result = meetingOutcomeSchema.safeParse({
      ...validBase,
      attendeeNotes: [{ contactId: 'c-1', note: 'x'.repeat(501) }],
    });
    expect(result.success).toBe(false);
  });
});
