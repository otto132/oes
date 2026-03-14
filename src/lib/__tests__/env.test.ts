import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('env', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('warns if DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('@/lib/env');
    const warnedAboutDb = warnSpy.mock.calls.some(
      (args) => String(args[1] ?? args[0]).includes('DATABASE_URL'),
    );
    expect(warnedAboutDb).toBe(true);
    expect(mod.env.DATABASE_URL).toBe('');
    warnSpy.mockRestore();
  });

  it('exports Google vars as optional', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret');
    const mod = await import('@/lib/env');
    expect(mod.env.GOOGLE_CLIENT_ID).toBe('gid');
    expect(mod.env.GOOGLE_CLIENT_SECRET).toBe('gsecret');
  });

  it('availableProviders returns google=true when Google vars set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret');
    const mod = await import('@/lib/env');
    expect(mod.availableProviders()).toEqual({ google: true });
  });
});
