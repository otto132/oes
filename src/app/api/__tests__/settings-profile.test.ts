import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuth } = vi.hoisted(() => ({
  mockDb: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
  mockAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

function makeRequest(body?: object): NextRequest {
  return new NextRequest('http://localhost/api/settings/profile', {
    method: body ? 'PATCH' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/settings/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'MEMBER' } });
  });

  it('returns current user profile', async () => {
    const user = { id: 'u1', name: 'Test', email: 'test@co.com', initials: 'T', role: 'MEMBER', notificationPrefs: null, lastLoginAt: null };
    mockDb.user.findUnique.mockResolvedValue(user);

    const { GET } = await import('@/app/api/settings/profile/route');
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.email).toBe('test@co.com');
    expect(json.data.notificationPrefs).toEqual({ emailAlerts: true, queueAlerts: true });
  });

  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import('@/app/api/settings/profile/route');
    const res = await GET();

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/settings/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'MEMBER' } });
  });

  it('updates name and initials', async () => {
    const updated = { id: 'u1', name: 'New Name', initials: 'NN', email: 'test@co.com', role: 'MEMBER', notificationPrefs: null, lastLoginAt: null };
    mockDb.user.update.mockResolvedValue(updated);

    const { PATCH } = await import('@/app/api/settings/profile/route');
    const res = await PATCH(makeRequest({ name: 'New Name', initials: 'NN' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.name).toBe('New Name');
  });

  it('rejects invalid initials (too long)', async () => {
    const { PATCH } = await import('@/app/api/settings/profile/route');
    const res = await PATCH(makeRequest({ initials: 'ABCD' }));

    expect(res.status).toBe(400);
  });

  it('updates notification preferences', async () => {
    const updated = { id: 'u1', name: 'Test', initials: 'T', email: 'test@co.com', role: 'MEMBER', notificationPrefs: { emailAlerts: false, queueAlerts: true }, lastLoginAt: null };
    mockDb.user.update.mockResolvedValue(updated);

    const { PATCH } = await import('@/app/api/settings/profile/route');
    const res = await PATCH(makeRequest({ notificationPrefs: { emailAlerts: false, queueAlerts: true } }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.notificationPrefs).toEqual({ emailAlerts: false, queueAlerts: true });
  });
});
