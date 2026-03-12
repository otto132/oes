// ═══════════════════════════════════════════════════════════════
// Frontend API Client
// ═══════════════════════════════════════════════════════════════
// Drop-in replacement for direct store access.
// Usage: const { data } = await api.home.summary();

import type { QueueItem } from './types';

interface QueueResponse {
  data: QueueItem[];
  meta: { pendingCount: number; completedCount: number; typeCounts: Record<string, number> };
}

interface QueueMutationResponse {
  data: QueueItem;
}

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API ${path}: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ── Home ───────────────────────────────────────
  home: {
    summary: () => get<any>('/home'),
  },

  // ── Queue ──────────────────────────────────────
  queue: {
    list: (status = 'pending', type?: string): Promise<QueueResponse> =>
      get<QueueResponse>(`/queue?status=${status}${type && type !== 'all' ? `&type=${type}` : ''}`),
    approve: (id: string, editedPayload?: Record<string, unknown>): Promise<QueueMutationResponse> =>
      post<QueueMutationResponse>('/queue', { action: 'approve', id, editedPayload }),
    reject: (id: string, reason: string): Promise<QueueMutationResponse> =>
      post<QueueMutationResponse>('/queue', { action: 'reject', id, reason }),
  },

  // ── Signals ────────────────────────────────────
  signals: {
    list: (type?: string) => get<any>(`/signals${type && type !== 'all' ? `?type=${type}` : ''}`),
    dismiss: (id: string) => post<any>('/signals', { action: 'dismiss', id }),
    convert: (id: string, company: string, type?: string, country?: string) =>
      post<any>('/signals', { action: 'convert', id, company, type, country }),
  },

  // ── Leads ──────────────────────────────────────
  leads: {
    list: () => get<any>('/leads'),
    create: (data: { company: string; type?: string; country?: string; pain?: string }) =>
      post<any>('/leads', data),
    advance: (id: string) => post<any>('/leads', { action: 'advance', id }),
    disqualify: (id: string) => post<any>('/leads', { action: 'disqualify', id }),
    convert: (id: string, data: any) => post<any>('/leads', { action: 'convert', id, ...data }),
  },

  // ── Accounts ───────────────────────────────────
  accounts: {
    list: (opts?: { q?: string; type?: string }) => {
      const params = new URLSearchParams();
      if (opts?.q) params.set('q', opts.q);
      if (opts?.type) params.set('type', opts.type);
      return get<any>(`/accounts?${params}`);
    },
    detail: (id: string) => get<any>(`/accounts?id=${id}`),
    create: (data: { name: string; type?: string; country?: string; notes?: string }) =>
      post<any>('/accounts', data),
  },

  // ── Opportunities ──────────────────────────────
  opportunities: {
    list: () => get<any>('/opportunities'),
    detail: (id: string) => get<any>(`/opportunities?id=${id}`),
    create: (data: any) => post<any>('/opportunities', data),
    move: (id: string, stage: string) => post<any>('/opportunities', { action: 'move', id, stage }),
    closeWon: (id: string, data: any) => post<any>('/opportunities', { action: 'close_won', id, ...data }),
    closeLost: (id: string, data: any) => post<any>('/opportunities', { action: 'close_lost', id, ...data }),
  },

  // ── Inbox ──────────────────────────────────────
  inbox: {
    list: () => get<any>('/inbox'),
    markRead: (id: string) => post<any>('/inbox', { action: 'read', id }),
    archive: (id: string) => post<any>('/inbox', { action: 'archive', id }),
    createTask: (id: string) => post<any>('/inbox', { action: 'create_task', id }),
    createAccount: (id: string) => post<any>('/inbox', { action: 'create_account', id }),
  },

  // ── Tasks ──────────────────────────────────────
  tasks: {
    list: (includeCompleted = false) => get<any>(`/tasks${includeCompleted ? '?completed=true' : ''}`),
    create: (data: any) => post<any>('/tasks', data),
    complete: (id: string, data?: any) => post<any>('/tasks', { action: 'complete', id, ...data }),
    comment: (id: string, text: string) => post<any>('/tasks', { action: 'comment', id, text }),
    sendForReview: (id: string) => post<any>('/tasks', { action: 'send_for_review', id }),
  },

  // ── Activities ─────────────────────────────────
  activities: {
    list: (accountId?: string) => get<any>(`/activities${accountId ? `?accountId=${accountId}` : ''}`),
    log: (data: { type?: string; summary: string; detail?: string; source?: string; noteType?: string; accountId?: string }) =>
      post<any>('/activities', data),
  },

  // ── Search ─────────────────────────────────────
  search: {
    query: (q: string) => get<any>(`/search?q=${encodeURIComponent(q)}`),
  },

  // ── Sync ───────────────────────────────────────
  sync: {
    trigger: (type: 'all' | 'emails' | 'calendar' = 'all') =>
      post<any>('/sync', { type }),
    status: () => get<any>('/sync'),
  },

  // ── Auth ───────────────────────────────────────
  auth: {
    connectOutlook: () => window.location.href = '/api/auth/connect',
  },
};
