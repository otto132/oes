import { describe, it, expect } from 'vitest';
import { paginate, parsePagination } from '@/lib/schemas/pagination';

describe('paginate', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));

  it('returns all items when under limit', () => {
    const result = paginate(items(3), 5);
    expect(result.data).toHaveLength(3);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.cursor).toBeUndefined();
  });

  it('returns all items when exactly at limit', () => {
    const result = paginate(items(5), 5);
    expect(result.data).toHaveLength(5);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.cursor).toBeUndefined();
  });

  it('trims to limit and sets cursor when over limit', () => {
    const result = paginate(items(6), 5);
    expect(result.data).toHaveLength(5);
    expect(result.meta.hasMore).toBe(true);
    expect(result.meta.cursor).toBe('id-4');
  });

  it('handles empty array', () => {
    const result = paginate([], 5);
    expect(result.data).toHaveLength(0);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.cursor).toBeUndefined();
  });
});

describe('parsePagination', () => {
  function mockReq(params: Record<string, string>) {
    const url = new URL('http://localhost/api/test');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return { nextUrl: url } as any;
  }

  it('returns defaults when no params', () => {
    const p = parsePagination(mockReq({}));
    expect(p.cursor).toBeUndefined();
    expect(p.limit).toBe(50);
  });

  it('parses cursor and limit', () => {
    const p = parsePagination(mockReq({ cursor: 'abc', limit: '20' }));
    expect(p.cursor).toBe('abc');
    expect(p.limit).toBe(20);
  });

  it('clamps limit to max 100', () => {
    const p = parsePagination(mockReq({ limit: '500' }));
    expect(p.limit).toBe(100);
  });

  it('clamps limit to min 1', () => {
    const p = parsePagination(mockReq({ limit: '0' }));
    expect(p.limit).toBe(50); // falls back to default
  });
});
