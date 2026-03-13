import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApproval } from '../chain';
import * as events from '../events';
import * as registry from '../registry';
import * as runner from '../runner';
import type { Agent } from '../types';

vi.mock('../events', () => ({
  emitEvent: vi.fn(),
}));

vi.mock('../runner', () => ({
  runAgent: vi.fn(),
}));

vi.mock('../registry', () => ({
  getAgentsByTrigger: vi.fn(),
}));

const makeAgent = (name: string): Agent => ({
  name,
  triggers: [{ type: 'chain', afterApproval: 'lead_qualification' }],
  analyze: vi.fn().mockResolvedValue({
    items: [],
    metrics: { scanned: 0, matched: 0, skipped: 0 },
    errors: [],
  }),
});

describe('Chain Coordinator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits queue_item_approved event', async () => {
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([]);
    await handleApproval(
      { id: 'q1', type: 'lead_qualification', accId: 'a1', payload: { leadId: 'l1' } } as any,
      { leadId: 'l1' }
    );
    expect(events.emitEvent).toHaveBeenCalledWith('queue_item_approved', {
      type: 'lead_qualification',
      id: 'q1',
      accId: 'a1',
      payload: { leadId: 'l1' },
    });
  });

  it('triggers matching chain agents in parallel', async () => {
    const drafter = makeAgent('outreach_drafter');
    const enricher = makeAgent('account_enricher');
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([drafter, enricher]);
    vi.mocked(runner.runAgent).mockResolvedValue(null);

    await handleApproval(
      { id: 'q1', type: 'lead_qualification', accId: 'a1', payload: {} } as any,
      {}
    );

    expect(runner.runAgent).toHaveBeenCalledTimes(2);
    expect(runner.runAgent).toHaveBeenCalledWith(
      drafter,
      'chain:lead_qualification',
      expect.objectContaining({ event: 'queue_item_approved' })
    );
  });

  it('does not throw if chain agents fail', async () => {
    const agent = makeAgent('failing');
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([agent]);
    vi.mocked(runner.runAgent).mockRejectedValue(new Error('fail'));

    // Should not throw
    await expect(
      handleApproval(
        { id: 'q1', type: 'lead_qualification', accId: 'a1', payload: {} } as any,
        {}
      )
    ).resolves.not.toThrow();
  });

  it('does nothing when no chain agents match', async () => {
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([]);
    await handleApproval(
      { id: 'q1', type: 'enrichment', accId: 'a1', payload: {} } as any,
      {}
    );
    expect(runner.runAgent).not.toHaveBeenCalled();
  });
});
