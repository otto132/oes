# Wire Settings Page Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded data in the Settings page with real API-backed state (E2-09, API-08, API-09).

**Architecture:** Three new API routes (GET agents, PATCH agents/[name], GET integrations) follow existing patterns (auth check, Prisma, error helpers). React Query hooks in a new settings.ts query file. Settings page wired to hooks with loading/error states. Agent drawer Pause button calls PATCH mutation.

**Tech Stack:** Next.js API Routes, Prisma, Zod, React Query, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-wire-settings-design.md`

---

## Chunk 1: API Layer (API-08 + API-09)

### Task 1: GET /api/settings/agents with auto-seed

**Files:**
- Create: `src/app/api/settings/agents/route.ts`
- Test: `src/app/api/__tests__/settings-agents.test.ts`

- [ ] **Step 1: Write tests for GET /api/settings/agents**

Create `src/app/api/__tests__/settings-agents.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      agentConfig: {
        findMany: fn(),
        count: fn(),
        createMany: fn(),
        findUnique: fn(),
        update: fn(),
      },
      user: { findUnique: fn() },
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import { GET } from '../settings/agents/route';

function mockAuth(userId = 'user-1') {
  mockAuthFn.mockResolvedValue({ user: { id: userId } });
}

describe('GET /api/settings/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns existing agent configs from DB', async () => {
    mockAuth();
    const agents = [
      { id: '1', name: 'signal_hunter', displayName: 'Signal Hunter', description: 'desc', status: 'active', parameters: {}, lastRunAt: null, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockDb.agentConfig.count.mockResolvedValue(1);
    mockDb.agentConfig.findMany.mockResolvedValue(agents);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe('signal_hunter');
  });

  it('seeds defaults when no agents exist', async () => {
    mockAuth();
    mockDb.agentConfig.count.mockResolvedValue(0);
    mockDb.agentConfig.createMany.mockResolvedValue({ count: 6 });
    mockDb.agentConfig.findMany.mockResolvedValue([
      { id: '1', name: 'signal_hunter', displayName: 'Signal Hunter', description: 'desc', status: 'active', parameters: {}, lastRunAt: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockDb.agentConfig.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'signal_hunter' }),
          expect.objectContaining({ name: 'lead_qualifier' }),
          expect.objectContaining({ name: 'account_enricher' }),
          expect.objectContaining({ name: 'outreach_drafter' }),
          expect.objectContaining({ name: 'pipeline_hygiene' }),
          expect.objectContaining({ name: 'inbox_classifier' }),
        ]),
      }),
    );
    expect(json.data).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/__tests__/settings-agents.test.ts`
Expected: FAIL — module `../settings/agents/route` not found

- [ ] **Step 3: Implement GET /api/settings/agents**

Create `src/app/api/settings/agents/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

const DEFAULT_AGENTS = [
  {
    name: 'signal_hunter',
    displayName: 'Signal Hunter',
    description: 'Monitors news, LinkedIn, registries for GoO market signals',
    status: 'active',
    parameters: {
      sources: 'Reuters, Bloomberg, LinkedIn, Montel, AIB, ENTSO-E',
      scan_frequency: 'Every 4 hours',
      min_relevance_threshold: '60/100',
      auto_dismiss_below: '30/100',
    },
  },
  {
    name: 'lead_qualifier',
    displayName: 'Lead Qualifier',
    description: 'Scores new leads using FIUAC dimensions',
    status: 'active',
    parameters: {
      auto_qualify_threshold: 'FIUAC ≥ 70',
      auto_disqualify: 'FIUAC ≤ 25',
      route_to_queue: '25 < FIUAC < 70',
    },
  },
  {
    name: 'account_enricher',
    displayName: 'Account Enricher',
    description: 'Updates account briefs with new intelligence',
    status: 'active',
    parameters: {
      refresh_cycle: 'Weekly',
      sources: 'Signals, email sync, LinkedIn',
      min_confidence_auto_update: '85%',
      below_85: 'Route to Queue',
    },
  },
  {
    name: 'outreach_drafter',
    displayName: 'Outreach Drafter',
    description: 'Generates personalized outreach using account context',
    status: 'active',
    parameters: {
      always_route_to_queue: 'Yes',
      template_style: 'Consultative',
      personalization_sources: 'Pain, WhyNow, Signals',
      max_sequence_length: '4 steps',
    },
  },
  {
    name: 'pipeline_hygiene',
    displayName: 'Pipeline Hygiene',
    description: 'Monitors deal health and flags stale opportunities',
    status: 'active',
    parameters: {
      stale_threshold: '7 days no activity',
      auto_decay: '5 pts/week engagement',
      alert_threshold: 'health < 40',
    },
  },
  {
    name: 'inbox_classifier',
    displayName: 'Inbox Classifier',
    description: 'Classifies incoming emails by intent',
    status: 'active',
    parameters: {
      classification_types: 'Positive, Question, Objection, Meeting, OOO, New Domain',
      auto_link_by_domain: 'Enabled',
      new_domain_detection: 'Enabled',
      min_classification_confidence: '70%',
    },
  },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const count = await db.agentConfig.count();
  if (count === 0) {
    await db.agentConfig.createMany({ data: DEFAULT_AGENTS });
  }

  const agents = await db.agentConfig.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ data: agents });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/__tests__/settings-agents.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/agents/route.ts src/app/api/__tests__/settings-agents.test.ts
git commit -m "feat(api): GET /settings/agents with auto-seed (API-08)"
```

---

### Task 2: PATCH /api/settings/agents/[name]

**Files:**
- Create: `src/app/api/settings/agents/[name]/route.ts`
- Modify: `src/app/api/__tests__/settings-agents.test.ts` (add PATCH tests)

- [ ] **Step 1: Add PATCH tests to settings-agents.test.ts**

The mocks from Task 1 already include `agentConfig.findUnique`, `agentConfig.update`, and `user.findUnique`. Add the PATCH import and tests:

```ts
// Add this import next to the existing GET import at the top of the file:
import { PATCH } from '../settings/agents/[name]/route';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/settings/agents/signal_hunter', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const mockParams = Promise.resolve({ name: 'signal_hunter' });

describe('PATCH /api/settings/agents/[name]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'MEMBER' });
    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown agent name', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    mockDb.agentConfig.findUnique.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it('updates agent status', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    mockDb.agentConfig.findUnique.mockResolvedValue({ id: '1', name: 'signal_hunter' });
    const updated = { id: '1', name: 'signal_hunter', status: 'paused', parameters: {} };
    mockDb.agentConfig.update.mockResolvedValue(updated);

    const res = await PATCH(makeRequest({ status: 'paused' }), { params: mockParams });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.status).toBe('paused');
    expect(mockDb.agentConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: 'signal_hunter' },
        data: expect.objectContaining({ status: 'paused' }),
      }),
    );
  });

  it('returns 400 for invalid status value', async () => {
    mockAuth();
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    const res = await PATCH(makeRequest({ status: 'deleted' }), { params: mockParams });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify PATCH tests fail**

Run: `npx vitest run src/app/api/__tests__/settings-agents.test.ts`
Expected: FAIL — module `../settings/agents/[name]/route` not found

- [ ] **Step 3: Implement PATCH /api/settings/agents/[name]**

Create `src/app/api/settings/agents/[name]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { unauthorized, forbidden, notFound, zodError } from '@/lib/api-errors';

const patchAgentSchema = z.object({
  status: z.enum(['active', 'paused']).optional(),
  parameters: z.record(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const dbUser = await db.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.role !== 'ADMIN') return forbidden('Admin access required');

  const { name } = await params;

  const raw = await req.json();
  const parsed = patchAgentSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const existing = await db.agentConfig.findUnique({ where: { name } });
  if (!existing) return notFound('Agent not found');

  const { status, parameters } = parsed.data;

  const updated = await db.agentConfig.update({
    where: { name },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
    },
  });

  return NextResponse.json({ data: updated });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/__tests__/settings-agents.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/agents/[name]/route.ts src/app/api/__tests__/settings-agents.test.ts
git commit -m "feat(api): PATCH /settings/agents/[name] (API-08)"
```

---

### Task 3: GET /api/settings/integrations

**Files:**
- Create: `src/app/api/settings/integrations/route.ts`
- Create: `src/app/api/__tests__/settings-integrations.test.ts`

- [ ] **Step 1: Write tests for GET /api/settings/integrations**

Create `src/app/api/__tests__/settings-integrations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockAuthFn } = vi.hoisted(() => {
  const fn = vi.fn;
  return {
    mockDb: {
      integrationToken: { findFirst: fn() },
    },
    mockAuthFn: fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: mockAuthFn }));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import { GET } from '../settings/integrations/route';

function mockAuth(userId = 'user-1') {
  mockAuthFn.mockResolvedValue({ user: { id: userId } });
}

describe('GET /api/settings/integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns Disconnected when no Microsoft token exists', async () => {
    mockAuth();
    mockDb.integrationToken.findFirst.mockResolvedValue(null);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(3);
    expect(json.data[0]).toMatchObject({ name: 'Microsoft 365 / Outlook', status: 'Disconnected', active: false });
    expect(json.data[1]).toMatchObject({ name: 'Calendar Sync', status: 'Disconnected', active: false });
    expect(json.data[2]).toMatchObject({ name: 'LinkedIn (manual)', status: 'Manual enrichment', active: false });
  });

  it('returns Disconnected when Microsoft token is expired', async () => {
    mockAuth();
    const token = {
      id: 't1',
      provider: 'microsoft',
      expiresAt: new Date(Date.now() - 3600_000), // expired 1 hour ago
      updatedAt: new Date('2026-03-13T10:00:00Z'),
    };
    mockDb.integrationToken.findFirst.mockResolvedValue(token);

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({ name: 'Microsoft 365 / Outlook', status: 'Disconnected', active: false });
    expect(json.data[1]).toMatchObject({ name: 'Calendar Sync', status: 'Disconnected', active: false });
  });

  it('returns Connected when valid Microsoft token exists', async () => {
    mockAuth();
    const token = {
      id: 't1',
      provider: 'microsoft',
      expiresAt: new Date(Date.now() + 3600_000),
      updatedAt: new Date('2026-03-13T10:00:00Z'),
    };
    mockDb.integrationToken.findFirst.mockResolvedValue(token);

    const res = await GET();
    const json = await res.json();

    expect(json.data[0]).toMatchObject({ name: 'Microsoft 365 / Outlook', status: 'Connected', active: true });
    expect(json.data[1]).toMatchObject({ name: 'Calendar Sync', status: 'Connected', active: true });
    expect(json.data[0].lastSyncAt).toBe(token.updatedAt.toISOString());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/__tests__/settings-integrations.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement GET /api/settings/integrations**

Create `src/app/api/settings/integrations/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { unauthorized } from '@/lib/api-errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const msToken = await db.integrationToken.findFirst({
    where: { provider: 'microsoft' },
    select: { expiresAt: true, updatedAt: true },
  });

  const msConnected = msToken !== null && msToken.expiresAt > new Date();
  const lastSyncAt = msConnected ? msToken.updatedAt.toISOString() : null;

  const integrations = [
    {
      name: 'Microsoft 365 / Outlook',
      status: msConnected ? 'Connected' : 'Disconnected',
      active: msConnected,
      lastSyncAt,
    },
    {
      name: 'Calendar Sync',
      status: msConnected ? 'Connected' : 'Disconnected',
      active: msConnected,
      lastSyncAt,
    },
    {
      name: 'LinkedIn (manual)',
      status: 'Manual enrichment',
      active: false,
      lastSyncAt: null,
    },
  ];

  return NextResponse.json({ data: integrations });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/__tests__/settings-integrations.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/integrations/route.ts src/app/api/__tests__/settings-integrations.test.ts
git commit -m "feat(api): GET /settings/integrations (API-09)"
```

---

### Task 4: Update team API to include initials and color

**Files:**
- Modify: `src/app/api/settings/team/route.ts`

- [ ] **Step 1: Update the select clause in GET /api/settings/team**

In `src/app/api/settings/team/route.ts`, add `initials` and `color` to the `select` object:

```ts
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      initials: true,
      email: true,
      role: true,
      color: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/team/route.ts
git commit -m "fix(api): include initials and color in team response"
```

---

## Chunk 2: Client Layer (API Client + React Query Hooks)

### Task 5: Add patch() helper and settings namespace to api-client

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add `patch()` helper function**

In `src/lib/api-client.ts`, add after the `post()` function (around line 51):

```ts
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
```

- [ ] **Step 2: Add settings namespace to the `api` object**

Add before the closing of the `api` object (before the final `};`):

```ts
  // ── Settings ────────────────────────────────────
  settings: {
    team: () => get<any>('/settings/team'),
    agents: () => get<any>('/settings/agents'),
    patchAgent: (name: string, data: { status?: string; parameters?: Record<string, string> }) =>
      patch<any>(`/settings/agents/${name}`, data),
    integrations: () => get<any>('/settings/integrations'),
  },
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat(client): add patch helper and settings namespace to api-client"
```

---

### Task 6: Create React Query hooks for settings

**Files:**
- Create: `src/lib/queries/settings.ts`

- [ ] **Step 1: Create the settings query hooks file**

Create `src/lib/queries/settings.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  agents: () => ['settings', 'agents'] as const,
  integrations: () => ['settings', 'integrations'] as const,
};

export function useTeamQuery() {
  return useQuery({
    queryKey: settingsKeys.team(),
    queryFn: () => api.settings.team(),
    retry: false,
  });
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: settingsKeys.agents(),
    queryFn: () => api.settings.agents(),
  });
}

export function useIntegrationsQuery() {
  return useQuery({
    queryKey: settingsKeys.integrations(),
    queryFn: () => api.settings.integrations(),
  });
}

export function usePatchAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: { status?: string; parameters?: Record<string, string> } }) =>
      api.settings.patchAgent(name, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.agents() });
    },
  });
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/settings.ts
git commit -m "feat(queries): add React Query hooks for settings"
```

---

## Chunk 3: Frontend Wiring (E2-09)

### Task 7: Wire Settings page to real data

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Rewrite Settings page to use hooks**

Replace the entire contents of `src/app/(dashboard)/settings/page.tsx` with:

```tsx
'use client';
import { useStore } from '@/lib/store';
import { Avatar, Badge } from '@/components/ui';
import { useTeamQuery, useAgentsQuery, useIntegrationsQuery, usePatchAgent } from '@/lib/queries/settings';
import { ApiError } from '@/lib/api-client';

const SHORTCUTS = [
  ['Command palette', '⌘K'], ['Home', '1'], ['Approval Queue', '2'], ['Signals', '3'],
  ['Leads', '4'], ['Accounts', '5'], ['Pipeline', '6'], ['Tasks', '7'],
];

export default function SettingsPage() {
  const { openDrawer, closeDrawer } = useStore();
  const team = useTeamQuery();
  const agents = useAgentsQuery();
  const integrations = useIntegrationsQuery();
  const patchAgent = usePatchAgent();

  function openAgentConfig(agent: { name: string; displayName: string; description: string; status: string; parameters: Record<string, string> }) {
    const isPaused = agent.status === 'paused';
    openDrawer({
      title: `${agent.displayName} — Configuration`,
      subtitle: 'AI Agent',
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">⚡ {agent.displayName}</div>
            <p className="text-[12.5px] text-sub">{agent.description}</p>
          </div>
          <div>
            <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2">Parameters</div>
            <div className="flex flex-col gap-1.5">
              {Object.entries(agent.parameters).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-1.5 px-2 border border-[var(--border)] rounded-md">
                  <span className="text-[11px] text-sub">{k.replace(/_/g, ' ')}</span>
                  <span className="text-[11px] font-medium text-[var(--text)]">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={isPaused ? 'default' : 'ok'}>{isPaused ? '⏸ Paused' : '● Active'}</Badge>
            <span className="text-[10px] text-muted">Last run: —</span>
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub hover:bg-[var(--hover)] rounded-md transition-colors" onClick={closeDrawer}>Close</button>
          <button
            className="px-3.5 py-1.5 text-sm font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={() => {
              patchAgent.mutate(
                { name: agent.name, data: { status: isPaused ? 'active' : 'paused' } },
                { onSuccess: () => closeDrawer() },
              );
            }}
          >
            {isPaused ? 'Resume Agent' : 'Pause Agent'}
          </button>
          <button className="px-3.5 py-1.5 text-sm font-medium bg-brand text-[#09090b] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Save</button>
        </>
      ),
    });
  }

  return (
    <div className="max-w-[700px] page-enter">
      <h1 className="text-[18px] font-semibold tracking-tight mb-3.5">Settings</h1>

      {/* Team (hidden for non-admin users who get 403) */}
      {team.isError && team.error instanceof ApiError && team.error.status === 403 ? null : (
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
          <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">Team</div>
          {team.isLoading ? (
            <div className="text-[11px] text-muted py-2">Loading team...</div>
          ) : team.isError ? (
            <div className="text-[11px] text-red-400 py-2">Failed to load team</div>
          ) : (
            team.data?.data?.map((u: any) => (
              <div key={u.id} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                <Avatar initials={u.initials} color={u.color} size="sm" />
                <div className="flex-1">
                  <div className="text-[12.5px] font-medium">{u.name}</div>
                  <div className="text-[10px] text-muted">{u.role}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* AI Agents */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">AI Agents</div>
        {agents.isLoading ? (
          <div className="text-[11px] text-muted py-2">Loading agents...</div>
        ) : agents.isError ? (
          <div className="text-[11px] text-red-400 py-2">Failed to load agents</div>
        ) : (
          agents.data?.data?.map((a: any) => (
            <div key={a.name} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-b-0">
              <div>
                <div className="text-[12.5px] font-medium">{a.displayName}</div>
                <div className={`text-[10px] ${a.status === 'paused' ? 'text-muted' : 'text-brand'}`}>
                  {a.status === 'paused' ? '⏸ Paused' : `Active`}
                </div>
              </div>
              <button className="px-2 py-1 text-[11px] text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={() => openAgentConfig(a)}>Configure</button>
            </div>
          ))
        )}
      </div>

      {/* Integrations */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 mb-2.5">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2.5">Integrations</div>
        {integrations.isLoading ? (
          <div className="text-[11px] text-muted py-2">Loading integrations...</div>
        ) : integrations.isError ? (
          <div className="text-[11px] text-red-400 py-2">Failed to load integrations</div>
        ) : (
          integrations.data?.data?.map((i: any) => (
            <div key={i.name} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-b-0">
              <span className="text-[12.5px]">{i.name}</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${i.active ? 'text-brand' : 'text-muted'}`}>{i.status}</span>
                <button className="px-2 py-1 text-[11px] text-sub hover:bg-[var(--hover)] rounded-md transition-colors">{i.active ? 'Disconnect' : 'Connect'}</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Shortcuts (desktop only) */}
      <div className="hidden md:block rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        <div className="text-[9px] font-semibold tracking-wide uppercase text-muted mb-2">Shortcuts</div>
        {SHORTCUTS.map(([label, key]) => (
          <div key={label} className="flex items-center justify-between py-1">
            <span className="text-[11px] text-sub">{label}</span>
            <kbd className="font-mono text-[10px] px-[5px] py-[1px] rounded bg-[var(--surface)] border border-[var(--border)] text-muted">{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/settings/page.tsx
git commit -m "feat(settings): wire page to real API data (E2-09)"
```

---

## Chunk 4: Verification

### Task 8: Final verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify lint passes**

Run: `npx next lint`
Expected: No errors

- [ ] **Step 4: Verify dev server starts**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds
