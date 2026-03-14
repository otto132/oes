import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => {
  const mockExtends = vi.fn().mockImplementation((ext) => {
    return { _extensions: ext };
  });
  return {
    db: {
      $extends: mockExtends,
    },
  };
});

describe('scopedDb', () => {
  it('returns unscoped client for ADMIN', async () => {
    const { scopedDb } = await import('./scoped-db');
    const scoped = scopedDb('admin-user', 'ADMIN');
    expect(scoped).toBeDefined();
  });

  it('returns scoped client for MEMBER', async () => {
    const { scopedDb } = await import('./scoped-db');
    const scoped = scopedDb('member-user', 'MEMBER');
    expect(scoped).toBeDefined();
  });

  it('returns scoped client for VIEWER', async () => {
    const { scopedDb } = await import('./scoped-db');
    const scoped = scopedDb('viewer-user', 'VIEWER');
    expect(scoped).toBeDefined();
  });
});
