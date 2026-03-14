import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const TEST_KEY = Buffer.from('a]3Fj!kL9#mN2pQ5rS8tU1vW4xY7zA0b').toString('base64');

describe('crypto', () => {
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY_V2;
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.TOKEN_ENCRYPTION_KEY_V2;
    vi.resetModules();
  });

  it('encrypts and decrypts a string', async () => {
    const { encrypt, decrypt } = await import('./crypto');
    const plaintext = 'my-secret-token-value';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith('v1:')).toBe(true);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const { encrypt } = await import('./crypto');
    const a = encrypt('same-input');
    const b = encrypt('same-input');
    expect(a).not.toBe(b);
  });

  it('throws on tampered ciphertext', async () => {
    const { encrypt, decrypt } = await import('./crypto');
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    parts[3] = parts[3].slice(0, -2) + 'XX';
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('returns plaintext unchanged if not in v1: format (migration compat)', async () => {
    const { decrypt } = await import('./crypto');
    const plaintext = 'not-encrypted-legacy-token';
    expect(decrypt(plaintext)).toBe(plaintext);
  });

  it('handles empty string', async () => {
    const { encrypt, decrypt } = await import('./crypto');
    const encrypted = encrypt('');
    expect(decrypt(encrypted)).toBe('');
  });
});
