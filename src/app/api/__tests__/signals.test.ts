import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock db & auth (hoisted so vi.mock factories can reference them) ──
const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      signal: { findMany: fn(), update: fn() },
      lead: { create: fn(), findFirst: fn() },
      account: { findFirst: fn() },
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import { POST } from '../signals/route';

// ── Helpers ──────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/signals', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const USER_ID = 'user-1';

function mockAuth(userId = USER_ID) {
  mockAuthFn.mockResolvedValue({ user: { id: userId } });
}

function makeSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sig-1',
    type: 'ppa_announcement',
    title: 'New PPA in Germany',
    summary: 'Large utility seeking renewable PPA',
    reasoning: 'Strong market signal',
    source: 'Reuters Energy',
    sourceUrl: 'https://example.com/article',
    relevance: 85,
    confidence: 0.9,
    agent: 'Signal Hunter',
    status: 'new_signal',
    detectedAt: new Date('2024-01-15'),
    companies: ['Acme Corp'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────
describe('POST /api/signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  // ── Convert signal ───────────────────────────────────────
  it('converting a signal creates a Lead and updates signal status to converted', async () => {
    const signal = makeSignal();
    const convertedSignal = { ...signal, status: 'converted' };

    // No duplicates
    mockDb.lead.findFirst.mockResolvedValue(null);
    mockDb.account.findFirst.mockResolvedValue(null);
    mockDb.signal.update.mockResolvedValue(convertedSignal);
    mockDb.lead.create.mockResolvedValue({ id: 'lead-1', company: 'Acme Corp' });

    const res = await POST(
      makeRequest({
        action: 'convert',
        id: 'sig-1',
        company: 'Acme Corp',
        type: 'Utility',
        country: 'DE',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.signal).toBeDefined();
    expect(json.data.lead).toBeDefined();

    // Signal was updated to converted
    expect(mockDb.signal.update).toHaveBeenCalledWith({
      where: { id: 'sig-1' },
      data: { status: 'converted' },
    });

    // Lead was created with correct data
    expect(mockDb.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          company: 'Acme Corp',
          source: 'Signal',
          signalId: 'sig-1',
          type: 'Utility',
          country: 'DE',
          stage: 'New',
          ownerId: USER_ID,
        }),
      }),
    );
  });

  // ── Dismiss signal ───────────────────────────────────────
  it('dismissing a signal updates status to dismissed', async () => {
    const dismissedSignal = makeSignal({ status: 'dismissed' });
    mockDb.signal.update.mockResolvedValue(dismissedSignal);

    const res = await POST(makeRequest({ action: 'dismiss', id: 'sig-1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('dismissed');

    expect(mockDb.signal.update).toHaveBeenCalledWith({
      where: { id: 'sig-1' },
      data: { status: 'dismissed' },
    });
  });

  // ── Convert already-converted signal (duplicate lead) ────
  it('converting already-converted signal returns error when lead exists', async () => {
    // Simulate duplicate lead found
    mockDb.lead.findFirst.mockResolvedValue({ id: 'lead-1', company: 'Acme Corp' });

    const res = await POST(
      makeRequest({
        action: 'convert',
        id: 'sig-1',
        company: 'Acme Corp',
        type: 'Utility',
        country: 'DE',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.message).toContain('already exists');

    // Signal should NOT have been updated
    expect(mockDb.signal.update).not.toHaveBeenCalled();
    // Lead should NOT have been created
    expect(mockDb.lead.create).not.toHaveBeenCalled();
  });

  // ── Convert when account already exists ──────────────────
  it('converting returns error when account with same name exists', async () => {
    mockDb.lead.findFirst.mockResolvedValue(null);
    mockDb.account.findFirst.mockResolvedValue({ id: 'acc-1', name: 'Acme Corp' });

    const res = await POST(
      makeRequest({
        action: 'convert',
        id: 'sig-1',
        company: 'Acme Corp',
        type: 'Utility',
        country: 'DE',
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.message).toContain('already exists');
  });

  // ── Unauthorized ─────────────────────────────────────────
  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);

    const res = await POST(makeRequest({ action: 'convert', id: 'sig-1', company: 'X' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toEqual({ code: 'UNAUTHORIZED', message: 'Unauthorized' });
  });
});
