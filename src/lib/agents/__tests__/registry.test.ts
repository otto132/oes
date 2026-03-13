import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAgent,
  getAgent,
  getAllAgents,
  getAgentsByTrigger,
  clearRegistry,
} from '../registry';
import type { Agent, AgentContext, AgentResult } from '../types';

const makeAgent = (name: string, triggers: Agent['triggers'] = []): Agent => ({
  name,
  triggers,
  analyze: async (_ctx: AgentContext): Promise<AgentResult> => ({
    items: [],
    metrics: { scanned: 0, matched: 0, skipped: 0 },
    errors: [],
  }),
});

describe('Agent Registry', () => {
  beforeEach(() => clearRegistry());

  it('registers and retrieves an agent by name', () => {
    const agent = makeAgent('test_agent');
    registerAgent(agent);
    expect(getAgent('test_agent')).toBe(agent);
  });

  it('returns undefined for unknown agent', () => {
    expect(getAgent('nonexistent')).toBeUndefined();
  });

  it('lists all registered agents', () => {
    registerAgent(makeAgent('a'));
    registerAgent(makeAgent('b'));
    expect(getAllAgents()).toHaveLength(2);
  });

  it('filters by cron trigger type', () => {
    registerAgent(makeAgent('cron_agent', [{ type: 'cron', schedule: '0 * * * *' }]));
    registerAgent(makeAgent('event_agent', [{ type: 'event', event: 'emails_synced' }]));
    const result = getAgentsByTrigger('cron');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('cron_agent');
  });

  it('filters by event trigger type and match', () => {
    registerAgent(makeAgent('classifier', [{ type: 'event', event: 'emails_synced' }]));
    registerAgent(makeAgent('other', [{ type: 'event', event: 'calendar_synced' }]));
    const result = getAgentsByTrigger('event', 'emails_synced');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('classifier');
  });

  it('filters by chain trigger type and match', () => {
    registerAgent(makeAgent('drafter', [{ type: 'chain', afterApproval: 'lead_qualification' }]));
    registerAgent(makeAgent('enricher', [{ type: 'chain', afterApproval: 'signal_review' }]));
    const result = getAgentsByTrigger('chain', 'lead_qualification');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('drafter');
  });

  it('throws on duplicate registration', () => {
    registerAgent(makeAgent('dup'));
    expect(() => registerAgent(makeAgent('dup'))).toThrow();
  });
});
