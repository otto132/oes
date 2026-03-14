import { describe, it, expect } from 'vitest';

describe('redact', () => {
  it('redacts keys matching sensitive patterns', async () => {
    const { redact } = await import('./logger');
    const input = {
      userId: 'u123',
      accessToken: 'secret-token-value',
      refreshToken: 'refresh-secret',
      password: 'hunter2',
      name: 'Alice',
    };
    const result = redact(input);
    expect(result.userId).toBe('u123');
    expect(result.name).toBe('Alice');
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
  });

  it('redacts nested objects', async () => {
    const { redact } = await import('./logger');
    const input = {
      data: { authorization: 'Bearer xyz', user: 'bob' },
    };
    const result = redact(input) as any;
    expect(result.data.authorization).toBe('[REDACTED]');
    expect(result.data.user).toBe('bob');
  });

  it('handles null and undefined values', async () => {
    const { redact } = await import('./logger');
    const input = { token: null, secret: undefined, name: 'test' };
    const result = redact(input);
    expect(result.token).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('does not mutate the original object', async () => {
    const { redact } = await import('./logger');
    const input = { apiKey: 'my-key', safe: 'value' };
    const result = redact(input);
    expect(input.apiKey).toBe('my-key');
    expect(result.apiKey).toBe('[REDACTED]');
  });
});
