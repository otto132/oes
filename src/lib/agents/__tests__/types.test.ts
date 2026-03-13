import { describe, it, expect } from 'vitest';
import type {
  Agent,
  AgentContext,
  AgentResult,
  AgentError,
  AgentTrigger,
  AgentEventData,
  NewQueueItem,
} from '../types';

describe('Agent types', () => {
  it('allows creating a valid Agent implementation', () => {
    const agent: Agent = {
      name: 'test_agent',
      triggers: [{ type: 'cron', schedule: '0 * * * *' }],
      analyze: async (_ctx: AgentContext): Promise<AgentResult> => ({
        items: [],
        metrics: { scanned: 0, matched: 0, skipped: 0 },
        errors: [],
      }),
    };
    expect(agent.name).toBe('test_agent');
    expect(agent.triggers).toHaveLength(1);
  });

  it('supports all trigger types', () => {
    const triggers: AgentTrigger[] = [
      { type: 'cron', schedule: '0 */4 * * *' },
      { type: 'event', event: 'emails_synced' },
      { type: 'chain', afterApproval: 'lead_qualification' },
    ];
    expect(triggers).toHaveLength(3);
  });

  it('supports AgentEventData shape', () => {
    const event: AgentEventData = {
      id: 'evt1',
      event: 'emails_synced',
      payload: { count: 5 },
    };
    expect(event.event).toBe('emails_synced');
  });
});
