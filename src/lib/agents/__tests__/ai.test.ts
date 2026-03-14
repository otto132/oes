import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env.ANTHROPIC_API_KEY;

describe('AI Client', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it('exports MODEL_SONNET and MODEL_HAIKU constants', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { MODEL_SONNET, MODEL_HAIKU } = await import('../ai');
    expect(MODEL_SONNET).toBe('claude-sonnet-4-6');
    expect(MODEL_HAIKU).toBe('claude-haiku-4-5');
  });

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { getAnthropicClient } = await import('../ai');
    expect(() => getAnthropicClient()).toThrow('ANTHROPIC_API_KEY not configured');
  });

  it('returns singleton client instance', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { getAnthropicClient } = await import('../ai');
    const client1 = getAnthropicClient();
    const client2 = getAnthropicClient();
    expect(client1).toBe(client2);
  });
});
