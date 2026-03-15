import { describe, it, expect } from 'vitest';
import { queueActionSchema } from '@/lib/schemas/queue';
import { signalActionSchema } from '@/lib/schemas/signals';
import { leadActionSchema } from '@/lib/schemas/leads';
import { createAccountSchema, patchAccountSchema } from '@/lib/schemas/accounts';
import { opportunityActionSchema } from '@/lib/schemas/opportunities';
import { taskActionSchema } from '@/lib/schemas/tasks';
import { createActivitySchema } from '@/lib/schemas/activities';
import { inboxActionSchema } from '@/lib/schemas/inbox';

describe('queueActionSchema', () => {
  it('accepts valid approve', () => {
    const result = queueActionSchema.safeParse({ action: 'approve', id: 'q1' });
    expect(result.success).toBe(true);
  });
  it('accepts approve with editedPayload', () => {
    const result = queueActionSchema.safeParse({ action: 'approve', id: 'q1', editedPayload: { company: 'Acme' } });
    expect(result.success).toBe(true);
  });
  it('accepts valid reject', () => {
    const result = queueActionSchema.safeParse({ action: 'reject', id: 'q1', reason: 'wrong company' });
    expect(result.success).toBe(true);
  });
  it('rejects reject without reason', () => {
    const result = queueActionSchema.safeParse({ action: 'reject', id: 'q1', reason: '' });
    expect(result.success).toBe(false);
  });
  it('rejects unknown action', () => {
    const result = queueActionSchema.safeParse({ action: 'delete', id: 'q1' });
    expect(result.success).toBe(false);
  });
});

describe('signalActionSchema', () => {
  it('accepts dismiss', () => {
    expect(signalActionSchema.safeParse({ action: 'dismiss', id: 's1' }).success).toBe(true);
  });
  it('accepts convert with company', () => {
    expect(signalActionSchema.safeParse({ action: 'convert', id: 's1', company: 'Acme' }).success).toBe(true);
  });
  it('rejects convert without company', () => {
    expect(signalActionSchema.safeParse({ action: 'convert', id: 's1' }).success).toBe(false);
  });
});

describe('leadActionSchema', () => {
  it('accepts create with company', () => {
    expect(leadActionSchema.safeParse({ action: 'create', company: 'Acme' }).success).toBe(true);
  });
  it('rejects create without company', () => {
    expect(leadActionSchema.safeParse({ action: 'create' }).success).toBe(false);
  });
  it('accepts advance', () => {
    expect(leadActionSchema.safeParse({ action: 'advance', id: 'l1' }).success).toBe(true);
  });
  it('rejects convert without oppName', () => {
    expect(leadActionSchema.safeParse({ action: 'convert', id: 'l1', accountName: 'Acme' }).success).toBe(false);
  });
  it('accepts convert with opp fields', () => {
    const result = leadActionSchema.safeParse({
      action: 'convert', id: 'l1', accountName: 'Acme', oppName: 'Deal', oppAmount: 1000,
      closeDate: '2026-06-30',
    });
    expect(result.success).toBe(true);
  });
  it('accepts disqualify with reason', () => {
    expect(leadActionSchema.safeParse({ action: 'disqualify', id: 'l1', reason: 'No Budget' }).success).toBe(true);
  });
  it('rejects disqualify without reason', () => {
    expect(leadActionSchema.safeParse({ action: 'disqualify', id: 'l1' }).success).toBe(false);
  });
  it('rejects disqualify with empty reason', () => {
    expect(leadActionSchema.safeParse({ action: 'disqualify', id: 'l1', reason: '' }).success).toBe(false);
  });
  it('accepts pause with pausedUntil', () => {
    expect(leadActionSchema.safeParse({ action: 'pause', id: 'l1', pausedUntil: '2026-06-01' }).success).toBe(true);
  });
  it('rejects pause without pausedUntil', () => {
    expect(leadActionSchema.safeParse({ action: 'pause', id: 'l1' }).success).toBe(false);
  });
  it('accepts requalify', () => {
    expect(leadActionSchema.safeParse({ action: 'requalify', id: 'l1' }).success).toBe(true);
  });
  it('requires oppName on convert', () => {
    expect(leadActionSchema.safeParse({ action: 'convert', id: 'l1', accountName: 'Acme' }).success).toBe(false);
  });
  it('accepts convert with required oppName', () => {
    expect(leadActionSchema.safeParse({ action: 'convert', id: 'l1', accountName: 'Acme', oppName: 'Deal' }).success).toBe(true);
  });
});

describe('createAccountSchema', () => {
  it('accepts valid account', () => {
    expect(createAccountSchema.safeParse({ name: 'Acme' }).success).toBe(true);
  });
  it('rejects empty name', () => {
    expect(createAccountSchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('trims whitespace', () => {
    const result = createAccountSchema.parse({ name: '  Acme  ' });
    expect(result.name).toBe('Acme');
  });
});

describe('patchAccountSchema', () => {
  it('accepts partial update', () => {
    expect(patchAccountSchema.safeParse({ pain: 'new pain' }).success).toBe(true);
  });
  it('rejects empty object', () => {
    expect(patchAccountSchema.safeParse({}).success).toBe(false);
  });
});

describe('opportunityActionSchema', () => {
  it('accepts create', () => {
    expect(opportunityActionSchema.safeParse({ action: 'create', name: 'Deal', accountId: 'a1' }).success).toBe(true);
  });
  it('rejects create without name', () => {
    expect(opportunityActionSchema.safeParse({ action: 'create', accountId: 'a1' }).success).toBe(false);
  });
  it('accepts move', () => {
    expect(opportunityActionSchema.safeParse({ action: 'move', id: 'o1', stage: 'Proposal' }).success).toBe(true);
  });
  it('accepts close_won (snake_case)', () => {
    expect(opportunityActionSchema.safeParse({ action: 'close_won', id: 'o1' }).success).toBe(true);
  });
  it('accepts close_lost with reason', () => {
    expect(opportunityActionSchema.safeParse({ action: 'close_lost', id: 'o1', lossReason: 'price' }).success).toBe(true);
  });
  it('rejects close_lost without reason', () => {
    expect(opportunityActionSchema.safeParse({ action: 'close_lost', id: 'o1', lossReason: '' }).success).toBe(false);
  });
  it('validates closeDate format', () => {
    expect(opportunityActionSchema.safeParse({ action: 'create', name: 'D', accountId: 'a1', closeDate: 'not-a-date' }).success).toBe(false);
    expect(opportunityActionSchema.safeParse({ action: 'create', name: 'D', accountId: 'a1', closeDate: '2026-06-30' }).success).toBe(true);
  });
});

describe('taskActionSchema', () => {
  it('accepts create with title', () => {
    expect(taskActionSchema.safeParse({ action: 'create', title: 'Do thing' }).success).toBe(true);
  });
  it('rejects create without title', () => {
    expect(taskActionSchema.safeParse({ action: 'create' }).success).toBe(false);
  });
  it('accepts complete', () => {
    expect(taskActionSchema.safeParse({ action: 'complete', id: 't1' }).success).toBe(true);
  });
  it('accepts comment', () => {
    expect(taskActionSchema.safeParse({ action: 'comment', id: 't1', text: 'hello' }).success).toBe(true);
  });
  it('rejects comment without text', () => {
    expect(taskActionSchema.safeParse({ action: 'comment', id: 't1', text: '' }).success).toBe(false);
  });
  it('accepts send_for_review', () => {
    expect(taskActionSchema.safeParse({ action: 'send_for_review', id: 't1' }).success).toBe(true);
  });
  it('validates due date format', () => {
    expect(taskActionSchema.safeParse({ action: 'create', title: 'X', due: 'tomorrow' }).success).toBe(false);
    expect(taskActionSchema.safeParse({ action: 'create', title: 'X', due: '2026-03-20' }).success).toBe(true);
  });
});

describe('createActivitySchema', () => {
  it('accepts valid activity', () => {
    expect(createActivitySchema.safeParse({ type: 'Note', accountId: 'a1', summary: 'test' }).success).toBe(true);
  });
  it('rejects missing summary', () => {
    expect(createActivitySchema.safeParse({ type: 'Note', accountId: 'a1' }).success).toBe(false);
  });
});

describe('inboxActionSchema', () => {
  it('accepts read action', () => {
    expect(inboxActionSchema.safeParse({ action: 'read', id: 'e1' }).success).toBe(true);
  });
  it('accepts create_task', () => {
    expect(inboxActionSchema.safeParse({ action: 'create_task', id: 'e1' }).success).toBe(true);
  });
  it('rejects unknown action', () => {
    expect(inboxActionSchema.safeParse({ action: 'delete', id: 'e1' }).success).toBe(false);
  });
});
