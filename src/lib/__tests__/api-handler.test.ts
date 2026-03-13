import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/lib/auth';
import { withHandler } from '@/lib/api-handler';

const mockedAuth = vi.mocked(auth);

function makeReq(body?: any, method = 'POST') {
  const req = new NextRequest('http://localhost/api/test', {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
  return req;
}

describe('withHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as any);
    const handler = withHandler(null, async () => NextResponse.json({ ok: true }));
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
  });

  it('passes body and session to handler when authenticated', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'u1', name: 'Test' } } as any);
    const schema = z.object({ name: z.string() });
    const handler = withHandler(schema, async (_req, ctx) => {
      return NextResponse.json({ name: ctx.body.name, userId: ctx.session.user.id });
    });
    const res = await handler(makeReq({ name: 'hello' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ name: 'hello', userId: 'u1' });
  });

  it('returns 400 VALIDATION_ERROR on invalid body', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'u1' } } as any);
    const schema = z.object({ name: z.string().min(1) });
    const handler = withHandler(schema, async () => NextResponse.json({ ok: true }));
    const res = await handler(makeReq({ name: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveProperty('name');
  });

  it('skips body parsing when schema is null', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'u1' } } as any);
    const handler = withHandler(null, async (_req, ctx) => {
      return NextResponse.json({ hasBody: ctx.body !== undefined });
    });
    const res = await handler(makeReq(undefined, 'GET'));
    expect(res.status).toBe(200);
  });

  it('extracts pagination params', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'u1' } } as any);
    const handler = withHandler(null, async (_req, ctx) => {
      return NextResponse.json(ctx.pagination);
    });
    const req = new NextRequest('http://localhost/api/test?cursor=abc&limit=25');
    const res = await handler(req);
    const body = await res.json();
    expect(body).toEqual({ cursor: 'abc', limit: 25 });
  });
});
