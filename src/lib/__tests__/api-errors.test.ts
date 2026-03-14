import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { badRequest, unauthorized, notFound, conflict, internalError, zodError } from '@/lib/api-errors';

describe('api-errors helpers', () => {
  it('badRequest returns 400 with BAD_REQUEST code', async () => {
    const res = badRequest('missing field');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'BAD_REQUEST', message: 'missing field' } });
  });

  it('unauthorized returns 401', async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
  });

  it('notFound returns 404', async () => {
    const res = notFound('item not found');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('conflict returns 409', async () => {
    const res = conflict('duplicate');
    expect(res.status).toBe(409);
  });

  it('internalError returns 500', async () => {
    const res = internalError();
    expect(res.status).toBe(500);
  });

  it('zodError returns 400 with VALIDATION_ERROR and field details', async () => {
    const err = new ZodError([
      { code: 'too_small', minimum: 1, type: 'string', inclusive: true, exact: false, message: 'Required', path: ['company'] } as any,
    ]);
    const res = zodError(err);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Validation failed');
    expect(body.error.details).toHaveProperty('company');
  });
});
