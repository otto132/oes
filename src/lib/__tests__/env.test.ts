import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('env', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws if DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    await expect(import('@/lib/env')).rejects.toThrow('DATABASE_URL');
  });

  it('does NOT throw when Azure AD vars are missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    const mod = await import('@/lib/env');
    expect(mod.env.DATABASE_URL).toBe('postgresql://localhost/test');
    expect(mod.env.AZURE_AD_CLIENT_ID).toBeUndefined();
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
    expect(mod.availableProviders()).toEqual({ google: true, microsoft: false });
  });

  it('availableProviders returns microsoft=true when all Azure vars set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    vi.stubEnv('AZURE_AD_CLIENT_ID', 'aid');
    vi.stubEnv('AZURE_AD_CLIENT_SECRET', 'asecret');
    vi.stubEnv('AZURE_AD_TENANT_ID', 'tid');
    const mod = await import('@/lib/env');
    expect(mod.availableProviders()).toEqual({ google: false, microsoft: true });
  });
});
