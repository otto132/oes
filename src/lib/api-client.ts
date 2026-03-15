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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api';

function extractErrorMessage(err: any, fallback: string): string {
  return err.error?.message || err.error || err.message || fallback;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, extractErrorMessage(err, `API ${path}: ${res.status}`));
  }
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
    throw new ApiError(res.status, extractErrorMessage(err, `API ${path}: ${res.status}`));
  }
  return res.json();
}

async function patch<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, extractErrorMessage(err, `API ${path}: ${res.status}`));
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
    list: (type?: string, cursor?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (type && type !== 'all') params.set('type', type);
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return get<any>(`/signals${qs ? `?${qs}` : ''}`);
    },
    dismiss: (id: string) => post<any>('/signals', { action: 'dismiss', id }),
    convert: (id: string, company: string, type?: string, country?: string) =>
      post<any>('/signals', { action: 'convert', id, company, type, country }),
  },

  // ── Leads ──────────────────────────────────────
  leads: {
    list: (cursor?: string, limit?: number, paused?: boolean) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      if (paused) params.set('paused', 'true');
      const qs = params.toString();
      return get<any>(`/leads${qs ? `?${qs}` : ''}`);
    },
    create: (data: Record<string, unknown>) =>
      post<any>('/leads', { action: 'create', ...data }),
    advance: (id: string) => post<any>('/leads', { action: 'advance', id }),
    disqualify: (id: string, reason: string) => post<any>('/leads', { action: 'disqualify', id, reason }),
    convert: (id: string, data: { accountName: string; accountType?: string; oppName: string; oppAmount?: number; closeDate?: string; ownerId?: string }) =>
      post<any>('/leads', { action: 'convert', id, ...data }),
    pause: (id: string, pausedUntil: string) => post<any>('/leads', { action: 'pause', id, pausedUntil }),
    requalify: (id: string) => post<any>('/leads', { action: 'requalify', id }),
    bulkAdvance: (ids: string[]) => post<any>('/leads', { action: 'bulk_advance', ids }),
    bulkDisqualify: (ids: string[]) => post<any>('/leads', { action: 'bulk_disqualify', ids }),
    bulkAssign: (ids: string[], ownerId: string) => post<any>('/leads', { action: 'bulk_assign', ids, ownerId }),
  },

  // ── Accounts ───────────────────────────────────
  accounts: {
    list: (opts?: { q?: string; type?: string; cursor?: string; limit?: number; owner?: string }) => {
      const params = new URLSearchParams();
      if (opts?.q) params.set('q', opts.q);
      if (opts?.type) params.set('type', opts.type);
      if (opts?.cursor) params.set('cursor', opts.cursor);
      if (opts?.limit) params.set('limit', String(opts.limit));
      if (opts?.owner) params.set('owner', opts.owner);
      return get<any>(`/accounts?${params}`);
    },
    detail: (id: string) => get<any>(`/accounts?id=${id}`),
    create: (data: Record<string, unknown>) =>
      post<any>('/accounts', data),
    update: (id: string, data: Record<string, unknown>) =>
      patch<any>(`/accounts/${id}`, data),
    import: async (file: File, fieldMap?: Record<string, string>) => {
      const form = new FormData();
      form.append('file', file);
      if (fieldMap) form.append('fieldMap', JSON.stringify(fieldMap));
      const res = await fetch(`${BASE}/accounts/import`, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new ApiError(res.status, extractErrorMessage(err, `Import failed: ${res.status}`));
      }
      return res.json();
    },
  },

  // ── Opportunities ──────────────────────────────
  opportunities: {
    list: (cursor?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return get<any>(`/opportunities${qs ? `?${qs}` : ''}`);
    },
    detail: (id: string) => get<any>(`/opportunities?id=${id}`),
    create: (data: any) => post<any>('/opportunities', { action: 'create', ...data }),
    move: (id: string, stage: string) => post<any>('/opportunities', { action: 'move', id, stage }),
    closeWon: (id: string, data: any) => post<any>('/opportunities', { action: 'close_won', id, ...data }),
    closeLost: (id: string, data: any) => post<any>('/opportunities', { action: 'close_lost', id, ...data }),
    update: (id: string, data: Record<string, unknown>) =>
      patch<any>(`/opportunities/${id}`, data),
    bulkMove: (ids: string[], stage: string) => post<any>('/opportunities', { action: 'bulk_move', ids, stage }),
    bulkCloseLost: (ids: string[]) => post<any>('/opportunities', { action: 'bulk_close_lost', ids }),
    bulkAssign: (ids: string[], ownerId: string) => post<any>('/opportunities', { action: 'bulk_assign', ids, ownerId }),
  },

  // ── Inbox ──────────────────────────────────────
  inbox: {
    list: (cursor?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return get<any>(`/inbox${qs ? `?${qs}` : ''}`);
    },
    markRead: (id: string) => post<any>('/inbox', { action: 'read', id }),
    archive: (id: string) => post<any>('/inbox', { action: 'archive', id }),
    createTask: (id: string) => post<any>('/inbox', { action: 'create_task', id }),
    createAccount: (id: string) => post<any>('/inbox', { action: 'create_account', id }),
    snooze: (id: string, snoozedUntil: string) => post<any>('/inbox', { action: 'snooze', id, snoozedUntil }),
    threads: (filter?: string, accountId?: string) => {
      const params = new URLSearchParams();
      if (filter) params.set('filter', filter);
      if (accountId) params.set('accountId', accountId);
      const qs = params.toString();
      return get<any>(`/inbox/threads${qs ? `?${qs}` : ''}`);
    },
  },

  // ── Tasks ──────────────────────────────────────
  tasks: {
    list: (includeCompleted = false, cursor?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (includeCompleted) params.set('completed', 'true');
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return get<any>(`/tasks${qs ? `?${qs}` : ''}`);
    },
    create: (data: any) => post<any>('/tasks', { action: 'create', ...data }),
    complete: (id: string, data?: any) => post<any>('/tasks', { action: 'complete', id, ...data }),
    comment: (id: string, text: string, mentionedUserIds?: string[]) => post<any>('/tasks', { action: 'comment', id, text, mentionedUserIds }),
    sendForReview: (id: string) => post<any>('/tasks', { action: 'send_for_review', id }),
    checkDue: () => post<{ processed: number }>('/tasks/check-due', {}),
    update: (id: string, data: Record<string, unknown>) =>
      patch<any>(`/tasks/${id}`, data),
  },

  // ── Activities ─────────────────────────────────
  activities: {
    list: (accountId?: string, cursor?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (accountId) params.set('accountId', accountId);
      if (cursor) params.set('cursor', cursor);
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      return get<any>(`/activities${qs ? `?${qs}` : ''}`);
    },
    log: (data: { type?: string; summary: string; detail?: string; source?: string; noteType?: string; accountId?: string }) =>
      post<any>('/activities', data),
  },

  // ── Meetings ────────────────────────────────────
  meetings: {
    list: (opts?: { date?: string; range?: number; cursor?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (opts?.date) params.set('date', opts.date);
      if (opts?.range) params.set('range', String(opts.range));
      if (opts?.cursor) params.set('cursor', opts.cursor);
      if (opts?.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      return get<any>(`/meetings${qs ? `?${qs}` : ''}`);
    },
    detail: (id: string) => get<any>(`/meetings/${id}`),
    create: (data: { title: string; date: string; startTime: string; duration?: string; attendees?: string[]; accountId?: string }) =>
      post<any>('/meetings', data),
    update: (id: string, data: Record<string, unknown>) =>
      patch<any>(`/meetings/${id}`, data),
    outcome: (id: string, data: {
      summary: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      actionItems?: { description: string; assignee?: string; dueDate?: string }[];
      attendeeNotes?: { contactId: string; note: string }[];
      nextSteps?: string;
      createFollowUp?: boolean;
      followUpTitle?: string;
      followUpDue?: string;
    }) => post<any>(`/meetings/${id}/outcome`, data),
    processOutcome: (id: string, rawNotes: string) => post<any>(`/meetings/${id}/outcome`, { rawNotes }),
    prep: (id: string) => get<any>(`/meetings/${id}/prep`),
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

  // ── Import ──────────────────────────────────────
  import: {
    analyze: (headers: string[], sampleRows: string[][]) =>
      post<any>('/import/analyze', { headers, sampleRows }),
    execute: (data: {
      mappings: { sourceColumn: string; targetField: string | null }[];
      rows: string[][];
      headers: string[];
    }) => post<any>('/import/execute', data),
  },

  // ── Auth ───────────────────────────────────────
  auth: {
    connectOutlook: () => window.location.href = '/api/auth/connect',
  },

  // ── Badge Counts ──────────────────────────────
  badgeCounts: {
    get: () => get<{ queue: number; signals: number; leads: number; inbox: number; tasks: number; notifications: number }>('/badge-counts'),
  },

  // ── Settings ───────────────────────────────────
  settings: {
    team: () => get<any>('/settings/team'),
    agents: () => get<any>('/settings/agents'),
    patchAgent: (name: string, data: { status?: string; parameters?: Record<string, unknown> }) =>
      patch<any>(`/settings/agents/${name}`, data),
    agentAnalytics: (period = 30) => get<any>(`/agents/analytics?period=${period}d`),
    agentUsage: (range: 'today' | '7d' | '30d' = 'today') => get<any>(`/settings/agents/usage?range=${range}`),
    integrations: () => get<any>('/settings/integrations'),
    invitations: () => get<any>('/settings/team/invitations'),
    invite: (data: { email: string; role?: string }) => post<any>('/settings/team/invite', data),
    revokeInvite: (id: string) => patch<any>(`/settings/team/invite/${id}`, { status: 'REVOKED' }),
    updateUser: (id: string, data: { role?: string; isActive?: boolean }) => patch<any>(`/settings/team/${id}`, data),
    profile: () => get<any>('/settings/profile'),
    updateProfile: (data: { name?: string; initials?: string; notificationPrefs?: { emailAlerts: boolean; queueAlerts: boolean } }) =>
      patch<any>('/settings/profile', data),
    contactRoles: () => get<any>('/settings/contact-roles'),
    createContactRole: (data: { label: string; sortOrder?: number }) =>
      post<any>('/settings/contact-roles', data),
    updateContactRole: (data: { id: string; label?: string; sortOrder?: number; isArchived?: boolean }) =>
      patch<any>('/settings/contact-roles', data),
  },

  // ── Digest ──────────────────────────────────────
  digest: {
    list: () => get<any>('/digest'),
  },

  // ── Admin ───────────────────────────────────────
  admin: {
    stats: () => get<any>('/admin/stats'),
  },

  // ── Notifications ───────────────────────────────────
  notifications: {
    list: (opts?: { cursor?: string; readStatus?: string; type?: string }) => {
      const params = new URLSearchParams();
      if (opts?.cursor) params.set('cursor', opts.cursor);
      if (opts?.readStatus) params.set('readStatus', opts.readStatus);
      if (opts?.type) params.set('type', opts.type);
      const qs = params.toString();
      return get<any>(`/notifications${qs ? `?${qs}` : ''}`);
    },
    markRead: (ids: string[]) => patch<any>('/notifications/mark-read', { ids }),
    markAllRead: (types?: string[]) =>
      patch<any>('/notifications/mark-read', { all: true, ...(types ? { types } : {}) }),
  },
};
