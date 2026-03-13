# Agent Framework & All 6 Agents — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight agent runtime with 6 AI agents that generate QueueItems for human review, triggered by cron, events, or approval chains.

**Architecture:** Agent registry pattern with DB-backed event bus. Each agent implements an `Agent` interface with `analyze()`. A runner handles execution lifecycle with concurrency guards. Chain coordinator enables parallel fan-out when queue items are approved.

**Tech Stack:** Next.js 14 App Router, Prisma ORM, Vitest, Zod, `rss-parser`, `@anthropic-ai/sdk`, React Query

**Spec:** `docs/superpowers/specs/2026-03-13-agent-framework-design.md`

---

## Chunk 1: Schema Changes + Agent Framework Core

### Task 1: Add AgentRun and AgentEvent models to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `signal_review` to QueueItemType enum**

In `prisma/schema.prisma`, find the `QueueItemType` enum and add `signal_review`:

```prisma
enum QueueItemType {
  outreach_draft
  lead_qualification
  enrichment
  task_creation
  signal_review
}
```

- [ ] **Step 2: Add AgentRun model**

Add after the `AgentConfig` model:

```prisma
model AgentRun {
  id           String    @id @default(cuid())
  agentName    String
  status       String    @default("running")
  trigger      String
  itemsCreated Int       @default(0)
  itemsScanned Int       @default(0)
  itemsMatched Int       @default(0)
  errors       Json      @default("[]")
  startedAt    DateTime  @default(now())
  completedAt  DateTime?
  durationMs   Int?
  updatedAt    DateTime  @updatedAt

  @@index([agentName, startedAt(sort: Desc)])
  @@map("agent_runs")
}
```

- [ ] **Step 3: Add AgentEvent model**

```prisma
model AgentEvent {
  id          String   @id @default(cuid())
  event       String
  payload     Json     @default("{}")
  processed   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([processed, event])
  @@map("agent_events")
}
```

- [ ] **Step 4: Push schema changes**

Run: `npx prisma db push`
Expected: Schema synced, no errors.

Run: `npx prisma generate`
Expected: Prisma client regenerated.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add AgentRun, AgentEvent models and signal_review type"
```

---

### Task 2: Create agent type definitions

**Files:**
- Create: `src/lib/agents/types.ts`
- Test: `src/lib/agents/__tests__/types.test.ts`

- [ ] **Step 1: Write type test**

```typescript
// src/lib/agents/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type {
  Agent,
  AgentContext,
  AgentResult,
  AgentError,
  AgentTrigger,
  AgentEventData,
  NewQueueItem,
} from '../types';

describe('Agent types', () => {
  it('allows creating a valid Agent implementation', () => {
    const agent: Agent = {
      name: 'test_agent',
      triggers: [{ type: 'cron', schedule: '0 * * * *' }],
      analyze: async (_ctx: AgentContext): Promise<AgentResult> => ({
        items: [],
        metrics: { scanned: 0, matched: 0, skipped: 0 },
        errors: [],
      }),
    };
    expect(agent.name).toBe('test_agent');
    expect(agent.triggers).toHaveLength(1);
  });

  it('supports all trigger types', () => {
    const triggers: AgentTrigger[] = [
      { type: 'cron', schedule: '0 */4 * * *' },
      { type: 'event', event: 'emails_synced' },
      { type: 'chain', afterApproval: 'lead_qualification' },
    ];
    expect(triggers).toHaveLength(3);
  });

  it('supports AgentEventData shape', () => {
    const event: AgentEventData = {
      id: 'evt1',
      event: 'emails_synced',
      payload: { count: 5 },
    };
    expect(event.event).toBe('emails_synced');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write types module**

```typescript
// src/lib/agents/types.ts
import type { QueueItemType, QueuePriority } from '@prisma/client';
import type { AgentConfig } from '@prisma/client';

export interface Agent {
  name: string;
  triggers: AgentTrigger[];
  analyze(context: AgentContext): Promise<AgentResult>;
}

export interface AgentContext {
  config: AgentConfig;
  userId: string;
  triggerEvent?: AgentEventData;
}

export interface AgentEventData {
  id: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface AgentResult {
  items: NewQueueItem[];
  metrics: { scanned: number; matched: number; skipped: number };
  errors: AgentError[];
}

export interface AgentError {
  message: string;
  source?: string;
  recoverable: boolean;
}

export type AgentTrigger =
  | { type: 'cron'; schedule: string }
  | { type: 'event'; event: string }
  | { type: 'chain'; afterApproval: QueueItemType | string };

export interface NewQueueItem {
  type: QueueItemType;
  title: string;
  accName: string;
  accId: string | null;
  agent: string;
  confidence: number;
  confidenceBreakdown: Record<string, number>;
  sources: { name: string; url: string | null }[];
  payload: Record<string, unknown>;
  reasoning: string;
  priority: QueuePriority;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/__tests__/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/types.ts src/lib/agents/__tests__/types.test.ts
git commit -m "feat(agents): add core type definitions"
```

---

### Task 3: Create agent registry

**Files:**
- Create: `src/lib/agents/registry.ts`
- Test: `src/lib/agents/__tests__/registry.test.ts`

- [ ] **Step 1: Write registry tests**

```typescript
// src/lib/agents/__tests__/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAgent,
  getAgent,
  getAllAgents,
  getAgentsByTrigger,
  clearRegistry,
} from '../registry';
import type { Agent, AgentContext, AgentResult } from '../types';

const makeAgent = (name: string, triggers: Agent['triggers'] = []): Agent => ({
  name,
  triggers,
  analyze: async (_ctx: AgentContext): Promise<AgentResult> => ({
    items: [],
    metrics: { scanned: 0, matched: 0, skipped: 0 },
    errors: [],
  }),
});

describe('Agent Registry', () => {
  beforeEach(() => clearRegistry());

  it('registers and retrieves an agent by name', () => {
    const agent = makeAgent('test_agent');
    registerAgent(agent);
    expect(getAgent('test_agent')).toBe(agent);
  });

  it('returns undefined for unknown agent', () => {
    expect(getAgent('nonexistent')).toBeUndefined();
  });

  it('lists all registered agents', () => {
    registerAgent(makeAgent('a'));
    registerAgent(makeAgent('b'));
    expect(getAllAgents()).toHaveLength(2);
  });

  it('filters by cron trigger type', () => {
    registerAgent(makeAgent('cron_agent', [{ type: 'cron', schedule: '0 * * * *' }]));
    registerAgent(makeAgent('event_agent', [{ type: 'event', event: 'emails_synced' }]));
    const result = getAgentsByTrigger('cron');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('cron_agent');
  });

  it('filters by event trigger type and match', () => {
    registerAgent(makeAgent('classifier', [{ type: 'event', event: 'emails_synced' }]));
    registerAgent(makeAgent('other', [{ type: 'event', event: 'calendar_synced' }]));
    const result = getAgentsByTrigger('event', 'emails_synced');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('classifier');
  });

  it('filters by chain trigger type and match', () => {
    registerAgent(makeAgent('drafter', [{ type: 'chain', afterApproval: 'lead_qualification' }]));
    registerAgent(makeAgent('enricher', [{ type: 'chain', afterApproval: 'signal_review' }]));
    const result = getAgentsByTrigger('chain', 'lead_qualification');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('drafter');
  });

  it('throws on duplicate registration', () => {
    registerAgent(makeAgent('dup'));
    expect(() => registerAgent(makeAgent('dup'))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Write registry implementation**

```typescript
// src/lib/agents/registry.ts
import type { Agent, AgentTrigger } from './types';

const registry = new Map<string, Agent>();

export function registerAgent(agent: Agent): void {
  if (registry.has(agent.name)) {
    throw new Error(`Agent "${agent.name}" is already registered`);
  }
  registry.set(agent.name, agent);
}

export function getAgent(name: string): Agent | undefined {
  return registry.get(name);
}

export function getAllAgents(): Agent[] {
  return Array.from(registry.values());
}

export function getAgentsByTrigger(
  triggerType: AgentTrigger['type'],
  match?: string
): Agent[] {
  return getAllAgents().filter((agent) =>
    agent.triggers.some((t) => {
      if (t.type !== triggerType) return false;
      if (triggerType === 'cron') return true;
      if (triggerType === 'event' && t.type === 'event') {
        return match ? t.event === match : true;
      }
      if (triggerType === 'chain' && t.type === 'chain') {
        return match ? t.afterApproval === match : true;
      }
      return false;
    })
  );
}

export function clearRegistry(): void {
  registry.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/registry.ts src/lib/agents/__tests__/registry.test.ts
git commit -m "feat(agents): add agent registry with trigger filtering"
```

---

### Task 4: Create event bus

**Files:**
- Create: `src/lib/agents/events.ts`
- Test: `src/lib/agents/__tests__/events.test.ts`

- [ ] **Step 1: Write event bus tests**

```typescript
// src/lib/agents/__tests__/events.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitEvent, consumePendingEvents, markProcessed, expireOldEvents } from '../events';

// Mock Prisma client
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    agentEvent: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

describe('Event Bus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emitEvent creates a DB row', async () => {
    mockCreate.mockResolvedValue({ id: 'evt1' });
    await emitEvent('emails_synced', { count: 5 });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        event: 'emails_synced',
        payload: { count: 5 },
      },
    });
  });

  it('emitEvent defaults payload to empty object', async () => {
    mockCreate.mockResolvedValue({ id: 'evt2' });
    await emitEvent('calendar_synced');
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        event: 'calendar_synced',
        payload: {},
      },
    });
  });

  it('consumePendingEvents returns unprocessed events', async () => {
    const events = [{ id: 'e1', event: 'emails_synced', payload: {}, processed: false }];
    mockFindMany.mockResolvedValue(events);
    const result = await consumePendingEvents();
    expect(result).toEqual(events);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('markProcessed updates the event', async () => {
    mockUpdate.mockResolvedValue({});
    await markProcessed('evt1');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'evt1' },
      data: { processed: true },
    });
  });

  it('expireOldEvents deletes old unprocessed events', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });
    const count = await expireOldEvents(6 * 60 * 60 * 1000);
    expect(count).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/events.test.ts`
Expected: FAIL

- [ ] **Step 3: Write event bus implementation**

```typescript
// src/lib/agents/events.ts
import prisma from '@/lib/prisma';
import type { AgentEvent } from '@prisma/client';

const DEFAULT_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function emitEvent(
  event: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await prisma.agentEvent.create({
    data: { event, payload },
  });
}

export async function consumePendingEvents(): Promise<AgentEvent[]> {
  return prisma.agentEvent.findMany({
    where: { processed: false },
    orderBy: { createdAt: 'asc' },
  });
}

export async function markProcessed(eventId: string): Promise<void> {
  await prisma.agentEvent.update({
    where: { id: eventId },
    data: { processed: true },
  });
}

export async function expireOldEvents(
  maxAgeMs: number = DEFAULT_EXPIRY_MS
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await prisma.agentEvent.updateMany({
    where: {
      processed: false,
      createdAt: { lt: cutoff },
    },
    data: { processed: true },
  });
  return result.count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/__tests__/events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/events.ts src/lib/agents/__tests__/events.test.ts
git commit -m "feat(agents): add DB-backed event bus"
```

---

### Task 5: Create agent runner

**Files:**
- Create: `src/lib/agents/runner.ts`
- Test: `src/lib/agents/__tests__/runner.test.ts`

- [ ] **Step 1: Write runner tests**

```typescript
// src/lib/agents/__tests__/runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgent } from '../runner';
import type { Agent, AgentResult } from '../types';

const mockAgentRunCreate = vi.fn();
const mockAgentRunUpdate = vi.fn();
const mockAgentRunFindFirst = vi.fn();
const mockAgentConfigUpdate = vi.fn();
const mockAgentConfigFindUnique = vi.fn();
const mockQueueItemCreateMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    agentRun: {
      create: (...args: unknown[]) => mockAgentRunCreate(...args),
      update: (...args: unknown[]) => mockAgentRunUpdate(...args),
      findFirst: (...args: unknown[]) => mockAgentRunFindFirst(...args),
    },
    agentConfig: {
      update: (...args: unknown[]) => mockAgentConfigUpdate(...args),
      findUnique: (...args: unknown[]) => mockAgentConfigFindUnique(...args),
    },
    queueItem: {
      createMany: (...args: unknown[]) => mockQueueItemCreateMany(...args),
    },
  },
}));

const successResult: AgentResult = {
  items: [
    {
      type: 'task_creation',
      title: 'Follow up on stale deal',
      accName: 'Acme',
      accId: 'acc1',
      agent: 'pipeline_hygiene',
      confidence: 0.8,
      confidenceBreakdown: { staleness: 0.9 },
      sources: [],
      payload: { opportunityId: 'opp1' },
      reasoning: 'No activity in 10 days',
      priority: 'Normal',
    },
  ],
  metrics: { scanned: 5, matched: 1, skipped: 4 },
  errors: [],
};

const makeAgent = (result: AgentResult = successResult): Agent => ({
  name: 'pipeline_hygiene',
  triggers: [{ type: 'cron', schedule: '0 8 * * *' }],
  analyze: vi.fn().mockResolvedValue(result),
});

describe('Agent Runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRunFindFirst.mockResolvedValue(null); // no running agent
    mockAgentConfigFindUnique.mockResolvedValue({
      name: 'pipeline_hygiene',
      status: 'active',
      parameters: {},
    });
    mockAgentRunCreate.mockResolvedValue({ id: 'run1' });
    mockAgentRunUpdate.mockResolvedValue({});
    mockAgentConfigUpdate.mockResolvedValue({});
    mockQueueItemCreateMany.mockResolvedValue({ count: 1 });
  });

  it('runs an agent and creates queue items', async () => {
    const agent = makeAgent();
    const run = await runAgent(agent, 'cron');
    expect(agent.analyze).toHaveBeenCalled();
    expect(mockQueueItemCreateMany).toHaveBeenCalled();
    expect(mockAgentRunUpdate).toHaveBeenCalled();
    expect(mockAgentConfigUpdate).toHaveBeenCalled();
  });

  it('skips if agent config is paused', async () => {
    mockAgentConfigFindUnique.mockResolvedValue({
      name: 'pipeline_hygiene',
      status: 'paused',
      parameters: {},
    });
    const agent = makeAgent();
    const run = await runAgent(agent, 'cron');
    expect(run).toBeNull();
    expect(agent.analyze).not.toHaveBeenCalled();
  });

  it('skips if agent is already running (< 10 min)', async () => {
    mockAgentRunFindFirst.mockResolvedValue({
      id: 'existing',
      status: 'running',
      startedAt: new Date(), // just started
    });
    const agent = makeAgent();
    const run = await runAgent(agent, 'cron');
    expect(run).toBeNull();
    expect(agent.analyze).not.toHaveBeenCalled();
  });

  it('marks stale run as failed and proceeds (>= 10 min)', async () => {
    mockAgentRunFindFirst.mockResolvedValue({
      id: 'stale',
      status: 'running',
      startedAt: new Date(Date.now() - 11 * 60 * 1000), // 11 min ago
    });
    const agent = makeAgent();
    await runAgent(agent, 'cron');
    // Should have updated stale run to failed
    expect(mockAgentRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stale' },
        data: expect.objectContaining({ status: 'failed' }),
      })
    );
    expect(agent.analyze).toHaveBeenCalled();
  });

  it('captures errors from agent result without failing run', async () => {
    const result: AgentResult = {
      items: [],
      metrics: { scanned: 1, matched: 0, skipped: 1 },
      errors: [{ message: 'RSS timeout', source: 'feed1', recoverable: true }],
    };
    const agent = makeAgent(result);
    await runAgent(agent, 'cron');
    const updateCall = mockAgentRunUpdate.mock.calls.find(
      (c: any) => c[0]?.data?.status === 'completed'
    );
    expect(updateCall).toBeTruthy();
  });

  it('marks run as failed on uncaught exception', async () => {
    const agent: Agent = {
      name: 'pipeline_hygiene',
      triggers: [],
      analyze: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    };
    await runAgent(agent, 'cron');
    const updateCall = mockAgentRunUpdate.mock.calls.find(
      (c: any) => c[0]?.data?.status === 'failed'
    );
    expect(updateCall).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/runner.test.ts`
Expected: FAIL

- [ ] **Step 3: Write runner implementation**

```typescript
// src/lib/agents/runner.ts
import prisma from '@/lib/prisma';
import type { AgentRun } from '@prisma/client';
import type { Agent, AgentEventData } from './types';

const STALE_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function runAgent(
  agent: Agent,
  trigger: string,
  event?: AgentEventData
): Promise<AgentRun | null> {
  // 1. Check config status
  const config = await prisma.agentConfig.findUnique({
    where: { name: agent.name },
  });
  if (!config || config.status === 'paused' || config.status === 'disabled') {
    return null;
  }

  // 2. Concurrency guard
  const existingRun = await prisma.agentRun.findFirst({
    where: { agentName: agent.name, status: 'running' },
    orderBy: { startedAt: 'desc' },
  });

  if (existingRun) {
    const elapsed = Date.now() - existingRun.startedAt.getTime();
    if (elapsed < STALE_RUN_TIMEOUT_MS) {
      return null; // still running
    }
    // Mark stale run as failed
    await prisma.agentRun.update({
      where: { id: existingRun.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs: elapsed,
        errors: [{ message: 'Run timed out (stale)', recoverable: true }],
      },
    });
  }

  // 3. Create run record
  const run = await prisma.agentRun.create({
    data: {
      agentName: agent.name,
      status: 'running',
      trigger,
    },
  });

  const startTime = Date.now();

  try {
    // 4. Execute agent
    const result = await agent.analyze({
      config,
      userId: 'system',
      triggerEvent: event,
    });

    // 5. Create queue items
    if (result.items.length > 0) {
      await prisma.queueItem.createMany({
        data: result.items.map((item) => ({
          type: item.type,
          title: item.title,
          accName: item.accName,
          accId: item.accId,
          agent: item.agent,
          confidence: item.confidence,
          confidenceBreakdown: item.confidenceBreakdown,
          sources: item.sources,
          payload: item.payload,
          reasoning: item.reasoning,
          priority: item.priority,
        })),
      });
    }

    // 6. Update run record
    const durationMs = Date.now() - startTime;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        durationMs,
        itemsCreated: result.items.length,
        itemsScanned: result.metrics.scanned,
        itemsMatched: result.metrics.matched,
        errors: result.errors,
      },
    });

    // 7. Update lastRunAt
    await prisma.agentConfig.update({
      where: { name: agent.name },
      data: { lastRunAt: new Date() },
    });

    return run;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        durationMs,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
            recoverable: false,
          },
        ],
      },
    });
    return run;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/__tests__/runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/__tests__/runner.test.ts
git commit -m "feat(agents): add agent runner with concurrency guard"
```

---

### Task 6: Create chain coordinator

**Files:**
- Create: `src/lib/agents/chain.ts`
- Test: `src/lib/agents/__tests__/chain.test.ts`

- [ ] **Step 1: Write chain coordinator tests**

```typescript
// src/lib/agents/__tests__/chain.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApproval } from '../chain';
import * as events from '../events';
import * as registry from '../registry';
import * as runner from '../runner';
import type { Agent } from '../types';

vi.mock('../events', () => ({
  emitEvent: vi.fn(),
}));

vi.mock('../runner', () => ({
  runAgent: vi.fn(),
}));

vi.mock('../registry', () => ({
  getAgentsByTrigger: vi.fn(),
}));

const makeAgent = (name: string): Agent => ({
  name,
  triggers: [{ type: 'chain', afterApproval: 'lead_qualification' }],
  analyze: vi.fn().mockResolvedValue({
    items: [],
    metrics: { scanned: 0, matched: 0, skipped: 0 },
    errors: [],
  }),
});

describe('Chain Coordinator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits queue_item_approved event', async () => {
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([]);
    await handleApproval(
      { id: 'q1', type: 'lead_qualification', accId: 'a1', payload: { leadId: 'l1' } } as any,
      { leadId: 'l1' }
    );
    expect(events.emitEvent).toHaveBeenCalledWith('queue_item_approved', {
      type: 'lead_qualification',
      id: 'q1',
      accId: 'a1',
      payload: { leadId: 'l1' },
    });
  });

  it('triggers matching chain agents in parallel', async () => {
    const drafter = makeAgent('outreach_drafter');
    const enricher = makeAgent('account_enricher');
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([drafter, enricher]);
    vi.mocked(runner.runAgent).mockResolvedValue(null);

    await handleApproval(
      { id: 'q1', type: 'lead_qualification', accId: 'a1', payload: {} } as any,
      {}
    );

    expect(runner.runAgent).toHaveBeenCalledTimes(2);
    expect(runner.runAgent).toHaveBeenCalledWith(
      drafter,
      'chain:lead_qualification',
      expect.objectContaining({ event: 'queue_item_approved' })
    );
  });

  it('does not throw if chain agents fail', async () => {
    const agent = makeAgent('failing');
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([agent]);
    vi.mocked(runner.runAgent).mockRejectedValue(new Error('fail'));

    // Should not throw
    await expect(
      handleApproval(
        { id: 'q1', type: 'lead_qualification', accId: 'a1', payload: {} } as any,
        {}
      )
    ).resolves.not.toThrow();
  });

  it('does nothing when no chain agents match', async () => {
    vi.mocked(registry.getAgentsByTrigger).mockReturnValue([]);
    await handleApproval(
      { id: 'q1', type: 'enrichment', accId: 'a1', payload: {} } as any,
      {}
    );
    expect(runner.runAgent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/chain.test.ts`
Expected: FAIL

- [ ] **Step 3: Write chain coordinator implementation**

```typescript
// src/lib/agents/chain.ts
import type { QueueItem } from '@prisma/client';
import { emitEvent } from './events';
import { getAgentsByTrigger } from './registry';
import { runAgent } from './runner';
import type { AgentEventData } from './types';

export async function handleApproval(
  approvedItem: QueueItem,
  _approvalPayload: Record<string, unknown>
): Promise<void> {
  // 1. Emit event for audit trail + fallback
  await emitEvent('queue_item_approved', {
    type: approvedItem.type,
    id: approvedItem.id,
    accId: approvedItem.accId,
    payload: approvedItem.payload as Record<string, unknown>,
  });

  // 2. Find agents with matching chain triggers
  const chainAgents = getAgentsByTrigger('chain', approvedItem.type);
  if (chainAgents.length === 0) return;

  // 3. Build event data for downstream agents
  const eventData: AgentEventData = {
    id: approvedItem.id,
    event: 'queue_item_approved',
    payload: {
      type: approvedItem.type,
      accId: approvedItem.accId,
      payload: approvedItem.payload as Record<string, unknown>,
    },
  };

  // 4. Execute all matching agents in parallel (fan-out)
  const triggerName = `chain:${approvedItem.type}`;
  await Promise.allSettled(
    chainAgents.map((agent) => runAgent(agent, triggerName, eventData))
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/__tests__/chain.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/chain.ts src/lib/agents/__tests__/chain.test.ts
git commit -m "feat(agents): add chain coordinator with parallel fan-out"
```

---

## Chunk 2: Zod Schemas + API Routes

### Task 7: Create agent Zod schemas

**Files:**
- Create: `src/lib/schemas/agents.ts`

- [ ] **Step 1: Write schemas**

```typescript
// src/lib/schemas/agents.ts
import { z } from 'zod';

export const updateAgentConfigSchema = z.object({
  status: z.enum(['active', 'paused', 'disabled']).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const runAgentSchema = z.object({
  // No body required — agent name comes from URL param
}).optional();

export const analyticsQuerySchema = z.object({
  period: z.string().regex(/^\d+d$/).default('30d'),
});

export type UpdateAgentConfig = z.infer<typeof updateAgentConfigSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/schemas/agents.ts
git commit -m "feat(agents): add Zod schemas for agent API"
```

---

### Task 8: Create agent list + analytics API routes

**Files:**
- Create: `src/app/api/agents/route.ts`
- Create: `src/app/api/agents/analytics/route.ts`
- Create: `src/app/api/agents/events/route.ts`
- Create: `src/lib/agents/analytics.ts`

- [ ] **Step 1: Write analytics query module**

```typescript
// src/lib/agents/analytics.ts
import prisma from '@/lib/prisma';

export async function getAgentAnalytics(periodDays: number = 30) {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [runs, queueItems, pendingCount] = await Promise.all([
    prisma.agentRun.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.queueItem.findMany({
      where: { createdAt: { gte: since } },
      select: {
        agent: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        rejReason: true,
      },
    }),
    prisma.queueItem.count({ where: { status: 'pending' } }),
  ]);

  // Group runs by agent
  const agentMetrics: Record<string, {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalItemsCreated: number;
    approvalRate: number;
    avgReviewTimeMs: number;
    itemsByDay: { date: string; count: number }[];
  }> = {};

  const agentNames = [...new Set(runs.map((r) => r.agentName))];

  for (const name of agentNames) {
    const agentRuns = runs.filter((r) => r.agentName === name);
    const agentItems = queueItems.filter((q) => q.agent === name);
    const reviewed = agentItems.filter((q) => q.status !== 'pending');
    const approved = agentItems.filter((q) => q.status === 'approved');

    // Review time calculation
    const reviewTimes = reviewed
      .filter((q) => q.reviewedAt)
      .map((q) => q.reviewedAt!.getTime() - q.createdAt.getTime());
    const avgReviewTimeMs = reviewTimes.length > 0
      ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length
      : 0;

    // Items by day
    const dayMap = new Map<string, number>();
    for (const item of agentItems) {
      const day = item.createdAt.toISOString().split('T')[0];
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }

    agentMetrics[name] = {
      totalRuns: agentRuns.length,
      successfulRuns: agentRuns.filter((r) => r.status === 'completed').length,
      failedRuns: agentRuns.filter((r) => r.status === 'failed').length,
      totalItemsCreated: agentRuns.reduce((s, r) => s + r.itemsCreated, 0),
      approvalRate: reviewed.length > 0 ? approved.length / reviewed.length : 0,
      avgReviewTimeMs,
      itemsByDay: Array.from(dayMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  // Rejection reasons
  const rejReasons = queueItems
    .filter((q) => q.status === 'rejected' && q.rejReason)
    .reduce((acc, q) => {
      acc[q.rejReason!] = (acc[q.rejReason!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return {
    period: { start: since.toISOString(), end: new Date().toISOString() },
    agents: agentMetrics,
    overall: {
      totalItemsCreated: queueItems.length,
      totalItemsReviewed: queueItems.filter((q) => q.status !== 'pending').length,
      pendingBacklog: pendingCount,
      chainCompletionRate: 0, // TODO: implement chain tracking
      topRejectionReasons: Object.entries(rejReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
  };
}
```

- [ ] **Step 2: Write agent list route**

```typescript
// src/app/api/agents/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async () => {
  const configs = await prisma.agentConfig.findMany({
    orderBy: { name: 'asc' },
  });

  // Get last run for each agent
  const lastRuns = await prisma.agentRun.findMany({
    where: {
      agentName: { in: configs.map((c) => c.name) },
    },
    orderBy: { startedAt: 'desc' },
    distinct: ['agentName'],
  });

  const lastRunMap = new Map(lastRuns.map((r) => [r.agentName, r]));

  const agents = configs.map((config) => ({
    ...config,
    lastRun: lastRunMap.get(config.name) || null,
  }));

  return NextResponse.json({ data: agents });
});
```

- [ ] **Step 3: Write analytics route**

```typescript
// src/app/api/agents/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAgentAnalytics } from '@/lib/agents/analytics';

export const GET = withAuth(async (req: NextRequest) => {
  const period = req.nextUrl.searchParams.get('period') || '30d';
  const days = parseInt(period.replace('d', ''), 10) || 30;
  const analytics = await getAgentAnalytics(days);
  return NextResponse.json(analytics);
});
```

- [ ] **Step 4: Write events route**

```typescript
// src/app/api/agents/events/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

export const GET = withAuth(async () => {
  const events = await prisma.agentEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json({ data: events });
});
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/analytics.ts src/app/api/agents/route.ts src/app/api/agents/analytics/route.ts src/app/api/agents/events/route.ts
git commit -m "feat(agents): add agent list, analytics, and events API routes"
```

---

### Task 9: Create per-agent API routes

**Files:**
- Create: `src/app/api/agents/[name]/route.ts`
- Create: `src/app/api/agents/[name]/analytics/route.ts`
- Create: `src/app/api/agents/[name]/runs/route.ts`

- [ ] **Step 1: Write per-agent CRUD route**

```typescript
// src/app/api/agents/[name]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { updateAgentConfigSchema } from '@/lib/schemas/agents';
import { getAgent } from '@/lib/agents/registry';
import { runAgent } from '@/lib/agents/runner';

type RouteContext = { params: Promise<{ name: string }> };

export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext) => {
  const { name } = await ctx.params;
  const config = await prisma.agentConfig.findUnique({ where: { name } });
  if (!config) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Agent not found' } }, { status: 404 });
  }
  const recentRuns = await prisma.agentRun.findMany({
    where: { agentName: name },
    orderBy: { startedAt: 'desc' },
    take: 10,
  });
  return NextResponse.json({ data: { ...config, recentRuns } });
});

export const PATCH = withAuth(async (req: NextRequest, ctx: RouteContext) => {
  const { name } = await ctx.params;
  const body = await req.json();
  const parsed = updateAgentConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues } },
      { status: 400 }
    );
  }
  const updated = await prisma.agentConfig.update({
    where: { name },
    data: parsed.data,
  });
  return NextResponse.json({ data: updated });
});

export const POST = withAuth(async (_req: NextRequest, ctx: RouteContext) => {
  const { name } = await ctx.params;
  const agent = getAgent(name);
  if (!agent) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Agent "${name}" not registered` } },
      { status: 404 }
    );
  }
  const run = await runAgent(agent, 'manual');
  if (!run) {
    return NextResponse.json(
      { error: { code: 'SKIPPED', message: 'Agent is paused or already running' } },
      { status: 409 }
    );
  }
  return NextResponse.json({ data: run });
});
```

- [ ] **Step 2: Write per-agent analytics route**

```typescript
// src/app/api/agents/[name]/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth } from '@/lib/auth';

type RouteContext = { params: Promise<{ name: string }> };

export const GET = withAuth(async (req: NextRequest, ctx: RouteContext) => {
  const { name } = await ctx.params;
  const period = req.nextUrl.searchParams.get('period') || '30d';
  const days = parseInt(period.replace('d', ''), 10) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [runs, items] = await Promise.all([
    prisma.agentRun.findMany({
      where: { agentName: name, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.queueItem.findMany({
      where: { agent: name, createdAt: { gte: since } },
      select: { status: true, createdAt: true, reviewedAt: true, rejReason: true },
    }),
  ]);

  const reviewed = items.filter((q) => q.status !== 'pending');
  const approved = items.filter((q) => q.status === 'approved');

  return NextResponse.json({
    data: {
      totalRuns: runs.length,
      successfulRuns: runs.filter((r) => r.status === 'completed').length,
      failedRuns: runs.filter((r) => r.status === 'failed').length,
      totalItemsCreated: runs.reduce((s, r) => s + r.itemsCreated, 0),
      approvalRate: reviewed.length > 0 ? approved.length / reviewed.length : 0,
    },
  });
});
```

- [ ] **Step 3: Write runs history route**

```typescript
// src/app/api/agents/[name]/runs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { parsePagination } from '@/lib/schemas/pagination';

type RouteContext = { params: Promise<{ name: string }> };

export const GET = withAuth(async (req: NextRequest, ctx: RouteContext) => {
  const { name } = await ctx.params;
  const { cursor, limit } = parsePagination(req.nextUrl.searchParams);

  const runs = await prisma.agentRun.findMany({
    where: { agentName: name },
    orderBy: { startedAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = runs.length > limit;
  const data = hasMore ? runs.slice(0, limit) : runs;

  return NextResponse.json({
    data,
    meta: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
    },
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agents/[name]/route.ts src/app/api/agents/[name]/analytics/route.ts src/app/api/agents/[name]/runs/route.ts
git commit -m "feat(agents): add per-agent CRUD, analytics, and runs API routes"
```

---

### Task 10: Integrate events into existing sync + queue routes

**Files:**
- Modify: `src/app/api/sync/route.ts`
- Modify: `src/app/api/queue/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Update sync route to emit events and run agents**

In `src/app/api/sync/route.ts`, add imports at the top:

```typescript
import { emitEvent } from '@/lib/agents/events';
import { runDueAgents } from '@/lib/agents/runner';
```

After the existing email sync call, add:
```typescript
await emitEvent('emails_synced', { count: emailResult.synced, timestamp: new Date().toISOString() });
```

After the existing calendar sync call, add:
```typescript
await emitEvent('calendar_synced', { count: calendarResult.synced, timestamp: new Date().toISOString() });
```

Add a new branch for `type === 'agents'`:
```typescript
if (type === 'agents' || type === 'all') {
  const agentRuns = await runDueAgents();
  // Include in response
}
```

- [ ] **Step 2: Add `runDueAgents` to runner**

In `src/lib/agents/runner.ts`, add:

```typescript
import { consumePendingEvents, markProcessed, expireOldEvents } from './events';
import { getAllAgents, getAgentsByTrigger } from './registry';

export async function runDueAgents(): Promise<AgentRun[]> {
  const results: AgentRun[] = [];

  // 1. Expire old events
  await expireOldEvents();

  // 2. Process pending events
  const events = await consumePendingEvents();
  for (const evt of events) {
    const eventData: AgentEventData = {
      id: evt.id,
      event: evt.event,
      payload: evt.payload as Record<string, unknown>,
    };

    let agents: Agent[] = [];
    if (evt.event === 'queue_item_approved') {
      const itemType = (evt.payload as Record<string, unknown>).type as string;
      agents = getAgentsByTrigger('chain', itemType);
    } else {
      agents = getAgentsByTrigger('event', evt.event);
    }

    for (const agent of agents) {
      const run = await runAgent(agent, `event:${evt.event}`, eventData);
      if (run) results.push(run);
    }

    await markProcessed(evt.id);
  }

  // 3. Check cron-triggered agents
  const cronAgents = getAgentsByTrigger('cron');
  for (const agent of cronAgents) {
    const config = await prisma.agentConfig.findUnique({
      where: { name: agent.name },
    });
    if (!config || !isDue(config, agent)) continue;
    const run = await runAgent(agent, 'cron');
    if (run) results.push(run);
  }

  return results;
}

function isDue(config: { lastRunAt: Date | null }, agent: Agent): boolean {
  if (!config.lastRunAt) return true;
  const cronTrigger = agent.triggers.find((t) => t.type === 'cron');
  if (!cronTrigger || cronTrigger.type !== 'cron') return false;
  // Simple interval check: parse cron schedule for minimum interval
  const intervalMs = parseCronIntervalMs(cronTrigger.schedule);
  return Date.now() - config.lastRunAt.getTime() >= intervalMs;
}

function parseCronIntervalMs(schedule: string): number {
  // Simplified: extract interval from common patterns
  const parts = schedule.split(' ');
  const minute = parts[0];
  const hour = parts[1];

  if (minute.startsWith('*/')) {
    return parseInt(minute.slice(2), 10) * 60 * 1000;
  }
  if (hour.startsWith('*/')) {
    return parseInt(hour.slice(2), 10) * 60 * 60 * 1000;
  }
  // Daily or weekly: default to 24h
  return 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 3: Update queue route to call chain coordinator**

In `src/app/api/queue/route.ts`, add import:
```typescript
import { handleApproval } from '@/lib/agents/chain';
```

At the end of the approve branch (after all side-effects and the activity log), add:
```typescript
// Trigger chain agents
await handleApproval(item, editedPayload || (item.payload as Record<string, unknown>));
```

- [ ] **Step 4: Add signal_review branch to queue approval handler**

In the approve switch/if-else block, add:
```typescript
if (item.type === 'signal_review') {
  const p = payload as Record<string, unknown>;
  await prisma.signal.create({
    data: {
      type: String(p.signalType || 'market'),
      title: String(p.headline || item.title),
      summary: String(p.summary || ''),
      source: String(p.sourceName || ''),
      sourceUrl: p.sourceUrl ? String(p.sourceUrl) : null,
      relevance: Number(p.relevanceScore || item.confidence * 100),
      status: 'active',
      companies: p.matchedAccounts || [],
    },
  });
}
```

- [ ] **Step 5: Update vercel.json**

Add the agents cron entry:
```json
{
  "crons": [
    { "path": "/api/sync", "schedule": "*/15 * * * *" },
    { "path": "/api/sync?type=agents", "schedule": "*/5 * * * *" }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sync/route.ts src/app/api/queue/route.ts src/lib/agents/runner.ts vercel.json
git commit -m "feat(agents): integrate event bus and chain coordinator into sync/queue routes"
```

---

## Chunk 3: Pipeline Hygiene + Inbox Classifier Agents

### Task 11: Implement Pipeline Hygiene agent

**Files:**
- Create: `src/lib/agents/pipeline-hygiene.ts`
- Test: `src/lib/agents/__tests__/pipeline-hygiene.test.ts`

- [ ] **Step 1: Write Pipeline Hygiene tests**

```typescript
// src/lib/agents/__tests__/pipeline-hygiene.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pipelineHygieneAgent } from '../pipeline-hygiene';
import type { AgentContext } from '../types';

const mockFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    opportunity: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  },
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'pipeline_hygiene', displayName: 'Pipeline Hygiene',
    description: '', status: 'active',
    parameters: { staleThresholdDays: 7, healthAlertThreshold: 40, decayPointsPerWeek: 5 },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Pipeline Hygiene Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', () => {
    expect(pipelineHygieneAgent.name).toBe('pipeline_hygiene');
    expect(pipelineHygieneAgent.triggers).toContainEqual({
      type: 'cron', schedule: '0 8 * * *',
    });
  });

  it('flags stale opportunities with no recent activity', async () => {
    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([
      {
        id: 'opp1', name: 'Stale Deal', stage: 'Discovery',
        healthEngagement: 60, healthStakeholders: 50,
        healthCompetition: 70, healthTimeline: 40,
        closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        account: { id: 'acc1', name: 'Acme Corp' },
        activities: [], // no recent activities
      },
    ]);

    const result = await pipelineHygieneAgent.analyze(ctx);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].type).toBe('task_creation');
    expect(result.items[0].agent).toBe('pipeline_hygiene');
  });

  it('returns empty when no issues found', async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await pipelineHygieneAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
    expect(result.metrics.scanned).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/pipeline-hygiene.test.ts`
Expected: FAIL

- [ ] **Step 3: Write Pipeline Hygiene implementation**

```typescript
// src/lib/agents/pipeline-hygiene.ts
import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  staleThresholdDays: 7,
  healthAlertThreshold: 40,
  decayPointsPerWeek: 5,
  stuckStageThresholds: { Discovery: 14, Proposal: 21, Negotiation: 14 },
};

export const pipelineHygieneAgent: Agent = {
  name: 'pipeline_hygiene',
  triggers: [{ type: 'cron', schedule: '0 8 * * *' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const staleThreshold = Number(params.staleThresholdDays) || 7;
    const healthThreshold = Number(params.healthAlertThreshold) || 40;
    const staleCutoff = new Date(Date.now() - staleThreshold * 24 * 60 * 60 * 1000);

    // Fetch open opportunities with account and recent activities
    const opportunities = await prisma.opportunity.findMany({
      where: {
        stage: { notIn: ['Closed Won', 'Closed Lost'] },
      },
      include: {
        account: { select: { id: true, name: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const opp of opportunities) {
      const lastActivity = opp.activities[0];
      const daysSinceActivity = lastActivity
        ? Math.floor((Date.now() - lastActivity.createdAt.getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      const avgHealth = Math.round(
        (opp.healthEngagement + opp.healthStakeholders + opp.healthCompetition + opp.healthTimeline) / 4
      );

      // Check: stale (no activity)
      if (daysSinceActivity > staleThreshold) {
        matched++;
        items.push({
          type: 'task_creation',
          title: `Stale deal: ${opp.name} (${daysSinceActivity}d inactive)`,
          accName: opp.account?.name || '',
          accId: opp.account?.id || null,
          agent: 'pipeline_hygiene',
          confidence: Math.min(0.5 + daysSinceActivity * 0.05, 0.95),
          confidenceBreakdown: { staleness: daysSinceActivity / (staleThreshold * 2) },
          sources: [],
          payload: {
            opportunityId: opp.id,
            reason: 'stale',
            daysSinceActivity,
            currentHealth: avgHealth,
            suggestedAction: getSuggestedAction(opp.stage, 'stale'),
          },
          reasoning: `No activity for ${daysSinceActivity} days (threshold: ${staleThreshold}). Stage: ${opp.stage}.`,
          priority: daysSinceActivity > staleThreshold * 2 ? 'High' : 'Normal',
        });
        continue; // Only flag once per opp
      }

      // Check: low health
      if (avgHealth < healthThreshold) {
        matched++;
        items.push({
          type: 'task_creation',
          title: `Low health: ${opp.name} (health: ${avgHealth}%)`,
          accName: opp.account?.name || '',
          accId: opp.account?.id || null,
          agent: 'pipeline_hygiene',
          confidence: 0.7,
          confidenceBreakdown: { health: avgHealth / 100 },
          sources: [],
          payload: {
            opportunityId: opp.id,
            reason: 'low_health',
            daysSinceActivity,
            currentHealth: avgHealth,
            suggestedAction: getSuggestedAction(opp.stage, 'low_health'),
          },
          reasoning: `Deal health at ${avgHealth}% (threshold: ${healthThreshold}%). Needs attention.`,
          priority: avgHealth < healthThreshold / 2 ? 'High' : 'Normal',
        });
        continue;
      }

      // Check: overdue close date
      if (opp.closeDate && opp.closeDate < new Date()) {
        matched++;
        const daysOverdue = Math.floor((Date.now() - opp.closeDate.getTime()) / (24 * 60 * 60 * 1000));
        items.push({
          type: 'task_creation',
          title: `Overdue close: ${opp.name} (${daysOverdue}d past)`,
          accName: opp.account?.name || '',
          accId: opp.account?.id || null,
          agent: 'pipeline_hygiene',
          confidence: 0.85,
          confidenceBreakdown: { overdue: Math.min(daysOverdue / 30, 1) },
          sources: [],
          payload: {
            opportunityId: opp.id,
            reason: 'overdue_close',
            daysSinceActivity,
            currentHealth: avgHealth,
            suggestedAction: 'Update close date or mark as Closed Lost',
          },
          reasoning: `Close date was ${daysOverdue} days ago. Update or close the deal.`,
          priority: 'High',
        });
      }
    }

    return {
      items,
      metrics: { scanned: opportunities.length, matched, skipped: opportunities.length - matched },
      errors: [],
    };
  },
};

function getSuggestedAction(stage: string, reason: string): string {
  if (reason === 'stale') {
    const actions: Record<string, string> = {
      Discovery: 'Schedule discovery call or send check-in email',
      Proposal: 'Follow up on proposal — ask if they have questions',
      Negotiation: 'Reach out about pricing/terms concerns',
    };
    return actions[stage] || 'Schedule check-in call';
  }
  if (reason === 'low_health') {
    return 'Review deal health — identify which areas need improvement';
  }
  return 'Review and take action';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/__tests__/pipeline-hygiene.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/pipeline-hygiene.ts src/lib/agents/__tests__/pipeline-hygiene.test.ts
git commit -m "feat(agents): implement Pipeline Hygiene agent"
```

---

### Task 12: Implement Inbox Classifier agent

**Files:**
- Create: `src/lib/agents/inbox-classifier.ts`
- Test: `src/lib/agents/__tests__/inbox-classifier.test.ts`

- [ ] **Step 1: Write Inbox Classifier tests**

```typescript
// src/lib/agents/__tests__/inbox-classifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inboxClassifierAgent } from '../inbox-classifier';
import type { AgentContext } from '../types';

const mockEmailFindMany = vi.fn();
const mockContactFindFirst = vi.fn();
const mockAccountFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    inboxEmail: { findMany: (...args: unknown[]) => mockEmailFindMany(...args) },
    contact: { findFirst: (...args: unknown[]) => mockContactFindFirst(...args) },
    account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) },
  },
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'inbox_classifier', displayName: 'Inbox Classifier',
    description: '', status: 'active',
    parameters: { urgencyKeywords: ['urgent', 'deadline', 'asap'] },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
  triggerEvent: { id: 'evt1', event: 'emails_synced', payload: { count: 3 } },
};

describe('Inbox Classifier Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and event trigger', () => {
    expect(inboxClassifierAgent.name).toBe('inbox_classifier');
    expect(inboxClassifierAgent.triggers).toContainEqual({
      type: 'event', event: 'emails_synced',
    });
  });

  it('creates task_creation items for urgent emails', async () => {
    mockEmailFindMany.mockResolvedValue([
      {
        id: 'em1', subject: 'URGENT: Need response today',
        from: 'john@acme.com', body: 'Please respond ASAP',
        classification: 'question', accountId: 'acc1',
        createdAt: new Date(),
      },
    ]);
    mockAccountFindFirst.mockResolvedValue({ id: 'acc1', name: 'Acme' });

    const result = await inboxClassifierAgent.analyze(ctx);
    expect(result.items.some((i) => i.type === 'task_creation')).toBe(true);
  });

  it('creates enrichment items for unlinked emails from new domains', async () => {
    mockEmailFindMany.mockResolvedValue([
      {
        id: 'em2', subject: 'Partnership inquiry',
        from: 'jane@newcorp.com', body: 'Interested in your product',
        classification: 'positive_reply', accountId: null,
        createdAt: new Date(),
      },
    ]);
    mockAccountFindFirst.mockResolvedValue(null);

    const result = await inboxClassifierAgent.analyze(ctx);
    expect(result.items.some((i) => i.type === 'enrichment')).toBe(true);
  });

  it('returns empty when no actionable emails', async () => {
    mockEmailFindMany.mockResolvedValue([
      {
        id: 'em3', subject: 'Newsletter',
        from: 'noreply@news.com', body: 'Weekly update',
        classification: 'auto_reply', accountId: null,
        createdAt: new Date(),
      },
    ]);

    const result = await inboxClassifierAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/inbox-classifier.test.ts`
Expected: FAIL

- [ ] **Step 3: Write Inbox Classifier implementation**

```typescript
// src/lib/agents/inbox-classifier.ts
import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  urgencyKeywords: ['urgent', 'deadline', 'asap', 'critical', 'immediately', 'time-sensitive'],
  minClassificationConfidence: 0.7,
};

export const inboxClassifierAgent: Agent = {
  name: 'inbox_classifier',
  triggers: [{ type: 'event', event: 'emails_synced' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const urgencyKeywords = (params.urgencyKeywords as string[]) || DEFAULT_PARAMS.urgencyKeywords;

    // Fetch recent unprocessed emails (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const emails = await prisma.inboxEmail.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const email of emails) {
      const text = `${email.subject} ${email.body || ''}`.toLowerCase();
      const isUrgent = urgencyKeywords.some((kw) => text.includes(kw.toLowerCase()));
      const domain = email.from.split('@')[1] || '';
      const classification = email.classification as string;

      // Skip auto-replies and bounces
      if (['auto_reply', 'bounce'].includes(classification)) continue;

      // Urgent email with account → create task
      if (isUrgent && email.accountId) {
        matched++;
        const account = await prisma.account.findFirst({
          where: { id: email.accountId },
          select: { name: true },
        });
        items.push({
          type: 'task_creation',
          title: `Respond to urgent email: ${email.subject}`,
          accName: account?.name || '',
          accId: email.accountId,
          agent: 'inbox_classifier',
          confidence: 0.8,
          confidenceBreakdown: { urgency: 0.9, hasAccount: 1.0 },
          sources: [{ name: 'Email', url: null }],
          payload: {
            emailId: email.id,
            suggestedTitle: `Respond: ${email.subject}`,
            suggestedDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            accountId: email.accountId,
          },
          reasoning: `Urgent keywords detected in email from ${email.from}. Classification: ${classification}.`,
          priority: 'High',
        });
        continue;
      }

      // Unlinked email from unknown domain → suggest account linking
      if (!email.accountId && classification !== 'auto_reply') {
        const existingAccount = await prisma.account.findFirst({
          where: { website: { contains: domain } },
          select: { id: true, name: true },
        });

        if (!existingAccount && ['positive_reply', 'question', 'meeting_request'].includes(classification)) {
          matched++;
          items.push({
            type: 'enrichment',
            title: `New domain detected: ${domain}`,
            accName: domain,
            accId: null,
            agent: 'inbox_classifier',
            confidence: 0.6,
            confidenceBreakdown: { newDomain: 1.0, intentSignal: 0.7 },
            sources: [{ name: 'Email', url: null }],
            payload: {
              emailId: email.id,
              senderDomain: domain,
              suggestedAccountName: domain.split('.')[0],
              confidence: 0.6,
            },
            reasoning: `Email from unknown domain ${domain} with ${classification} intent. May be a new prospect.`,
            priority: 'Normal',
          });
        }
      }
    }

    return {
      items,
      metrics: { scanned: emails.length, matched, skipped: emails.length - matched },
      errors: [],
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/__tests__/inbox-classifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/inbox-classifier.ts src/lib/agents/__tests__/inbox-classifier.test.ts
git commit -m "feat(agents): implement Inbox Classifier agent"
```

---

## Chunk 4: Lead Qualifier + Signal Hunter Agents

### Task 13: Implement Lead Qualifier agent

**Files:**
- Create: `src/lib/agents/lead-qualifier.ts`
- Test: `src/lib/agents/__tests__/lead-qualifier.test.ts`

- [ ] **Step 1: Write Lead Qualifier tests**

```typescript
// src/lib/agents/__tests__/lead-qualifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leadQualifierAgent } from '../lead-qualifier';
import type { AgentContext } from '../types';

const mockLeadFindMany = vi.fn();
const mockOppFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    lead: { findMany: (...args: unknown[]) => mockLeadFindMany(...args) },
    opportunity: { findMany: (...args: unknown[]) => mockOppFindMany(...args) },
  },
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'lead_qualifier', displayName: 'Lead Qualifier',
    description: '', status: 'active',
    parameters: { autoQualifyThreshold: 70, autoDisqualifyThreshold: 25 },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Lead Qualifier Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and triggers', () => {
    expect(leadQualifierAgent.name).toBe('lead_qualifier');
    expect(leadQualifierAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 */4 * * *' });
    expect(leadQualifierAgent.triggers).toContainEqual({ type: 'chain', afterApproval: 'signal_review' });
  });

  it('creates qualify recommendation for high-scoring leads', async () => {
    mockLeadFindMany.mockResolvedValue([
      {
        id: 'l1', company: 'Hot Corp', type: 'Enterprise', country: 'Finland',
        pain: 'High energy costs', scoreFit: 80, scoreIntent: 75,
        scoreUrgency: 70, scoreAccess: 85, scoreCapacity: 90,
        status: 'New', createdAt: new Date(),
      },
    ]);
    mockOppFindMany.mockResolvedValue([]); // No closed deals for look-alike

    const result = await leadQualifierAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('lead_qualification');
    const payload = result.items[0].payload as Record<string, unknown>;
    expect(payload.recommendation).toBe('qualify');
  });

  it('creates disqualify recommendation for low-scoring leads', async () => {
    mockLeadFindMany.mockResolvedValue([
      {
        id: 'l2', company: 'Cold Corp', type: 'SMB', country: 'Unknown',
        pain: '', scoreFit: 10, scoreIntent: 15,
        scoreUrgency: 20, scoreAccess: 10, scoreCapacity: 5,
        status: 'New', createdAt: new Date(),
      },
    ]);
    mockOppFindMany.mockResolvedValue([]);

    const result = await leadQualifierAgent.analyze(ctx);
    expect(result.items.length).toBe(1);
    const payload = result.items[0].payload as Record<string, unknown>;
    expect(payload.recommendation).toBe('disqualify');
  });

  it('returns empty for leads already scored', async () => {
    mockLeadFindMany.mockResolvedValue([]);
    mockOppFindMany.mockResolvedValue([]);
    const result = await leadQualifierAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, verify fail, write implementation**

```typescript
// src/lib/agents/lead-qualifier.ts
import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  autoQualifyThreshold: 70,
  autoDisqualifyThreshold: 25,
};

export const leadQualifierAgent: Agent = {
  name: 'lead_qualifier',
  triggers: [
    { type: 'cron', schedule: '0 */4 * * *' },
    { type: 'chain', afterApproval: 'signal_review' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const qualifyThreshold = Number(params.autoQualifyThreshold) || 70;
    const disqualifyThreshold = Number(params.autoDisqualifyThreshold) || 25;

    // Fetch leads that need scoring (New or Contacted status)
    const leads = await prisma.lead.findMany({
      where: { status: { in: ['New', 'Contacted'] } },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const lead of leads) {
      const f = lead.scoreFit || 0;
      const i = lead.scoreIntent || 0;
      const u = lead.scoreUrgency || 0;
      const a = lead.scoreAccess || 0;
      const c = lead.scoreCapacity || 0;
      const avgScore = (f + i + u + a + c) / 5;

      let recommendation: 'qualify' | 'disqualify' | 'review';
      if (avgScore >= qualifyThreshold) recommendation = 'qualify';
      else if (avgScore <= disqualifyThreshold) recommendation = 'disqualify';
      else recommendation = 'review';

      matched++;
      const dataPoints: string[] = [];
      if (lead.pain) dataPoints.push(`Pain: ${lead.pain}`);
      if (lead.type) dataPoints.push(`Type: ${lead.type}`);

      items.push({
        type: 'lead_qualification',
        title: `${recommendation === 'qualify' ? 'Qualify' : recommendation === 'disqualify' ? 'Disqualify' : 'Review'}: ${lead.company}`,
        accName: lead.company,
        accId: null,
        agent: 'lead_qualifier',
        confidence: recommendation === 'review' ? 0.5 : 0.8,
        confidenceBreakdown: { fit: f / 100, intent: i / 100, urgency: u / 100, access: a / 100, capacity: c / 100 },
        sources: [],
        payload: {
          leadId: lead.id,
          scores: { f, i, u, a, c },
          recommendation,
          reasoning: `FIUAC avg: ${avgScore.toFixed(0)}. ${recommendation === 'qualify' ? 'Above' : recommendation === 'disqualify' ? 'Below' : 'Between'} thresholds.`,
          dataPoints,
          lookAlikeScore: null,
          engagementVelocity: null,
          timingSignals: [],
        },
        reasoning: `Lead "${lead.company}" scored ${avgScore.toFixed(0)} avg FIUAC. Recommendation: ${recommendation}.`,
        priority: recommendation === 'qualify' ? 'High' : 'Normal',
      });
    }

    return {
      items,
      metrics: { scanned: leads.length, matched, skipped: 0 },
      errors: [],
    };
  },
};
```

- [ ] **Step 3: Run tests, verify pass, commit**

Run: `npx vitest run src/lib/agents/__tests__/lead-qualifier.test.ts`
Expected: PASS

```bash
git add src/lib/agents/lead-qualifier.ts src/lib/agents/__tests__/lead-qualifier.test.ts
git commit -m "feat(agents): implement Lead Qualifier agent"
```

---

### Task 14: Implement Signal Hunter agent

**Files:**
- Create: `src/lib/agents/signal-hunter.ts`
- Test: `src/lib/agents/__tests__/signal-hunter.test.ts`

- [ ] **Step 1: Install rss-parser**

Run: `npm install rss-parser`

- [ ] **Step 2: Write Signal Hunter tests**

```typescript
// src/lib/agents/__tests__/signal-hunter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signalHunterAgent } from '../signal-hunter';
import type { AgentContext } from '../types';

const mockAccountFindMany = vi.fn();
const mockSignalFindMany = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    account: { findMany: (...args: unknown[]) => mockAccountFindMany(...args) },
    signal: { findMany: (...args: unknown[]) => mockSignalFindMany(...args) },
  },
}));

vi.mock('rss-parser', () => ({
  default: vi.fn().mockImplementation(() => ({
    parseURL: vi.fn().mockResolvedValue({
      items: [
        {
          title: 'Acme Corp announces renewable energy initiative',
          link: 'https://news.example.com/acme-renewable',
          contentSnippet: 'Acme Corp is investing in solar energy to reduce costs',
          pubDate: new Date().toISOString(),
        },
      ],
    }),
  })),
}));

const ctx: AgentContext = {
  config: {
    id: 'c1', name: 'signal_hunter', displayName: 'Signal Hunter',
    description: '', status: 'active',
    parameters: {
      rssSources: [{ name: 'Test News', url: 'https://news.example.com/rss', category: 'energy' }],
      minRelevanceThreshold: 60,
      autoDismissBelow: 30,
    },
    lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
  },
  userId: 'system',
};

describe('Signal Hunter Agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', () => {
    expect(signalHunterAgent.name).toBe('signal_hunter');
    expect(signalHunterAgent.triggers).toContainEqual({ type: 'cron', schedule: '0 */4 * * *' });
  });

  it('creates signal_review items when RSS matches accounts', async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: 'acc1', name: 'Acme Corp', pain: 'High energy costs', industry: 'Energy' },
    ]);
    mockSignalFindMany.mockResolvedValue([]); // no existing signals (dedup)

    const result = await signalHunterAgent.analyze(ctx);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].type).toBe('signal_review');
    expect(result.items[0].agent).toBe('signal_hunter');
  });

  it('deduplicates against existing signals by URL', async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: 'acc1', name: 'Acme Corp', pain: 'High energy costs', industry: 'Energy' },
    ]);
    mockSignalFindMany.mockResolvedValue([
      { sourceUrl: 'https://news.example.com/acme-renewable' },
    ]);

    const result = await signalHunterAgent.analyze(ctx);
    expect(result.items).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Write Signal Hunter implementation**

```typescript
// src/lib/agents/signal-hunter.ts
import prisma from '@/lib/prisma';
import RSSParser from 'rss-parser';
import type { Agent, AgentContext, AgentResult, AgentError, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  minRelevanceThreshold: 60,
  autoDismissBelow: 30,
  rssSources: [] as { name: string; url: string; category: string }[],
  matchKeywords: [] as string[],
};

const parser = new RSSParser();

export const signalHunterAgent: Agent = {
  name: 'signal_hunter',
  triggers: [{ type: 'cron', schedule: '0 */4 * * *' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const sources = (params.rssSources as typeof DEFAULT_PARAMS.rssSources) || [];
    const minThreshold = Number(params.minRelevanceThreshold) || 60;
    const dismissBelow = Number(params.autoDismissBelow) || 30;

    if (sources.length === 0) {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 0 }, errors: [] };
    }

    // Load accounts for matching
    const accounts = await prisma.account.findMany({
      select: { id: true, name: true, pain: true, industry: true },
    });

    // Load existing signal URLs for dedup
    const existingSignals = await prisma.signal.findMany({
      where: { sourceUrl: { not: null } },
      select: { sourceUrl: true },
    });
    const existingUrls = new Set(existingSignals.map((s) => s.sourceUrl));

    const items: NewQueueItem[] = [];
    const errors: AgentError[] = [];
    let scanned = 0;

    for (const source of sources) {
      try {
        const feed = await parser.parseURL(source.url);
        for (const entry of feed.items || []) {
          scanned++;
          const url = entry.link || '';

          // Dedup
          if (existingUrls.has(url)) continue;

          // Match against accounts
          const text = `${entry.title || ''} ${entry.contentSnippet || ''}`.toLowerCase();
          const matchedAccounts = accounts.filter((acc) => {
            const nameMatch = text.includes(acc.name.toLowerCase());
            const painMatch = acc.pain && text.includes(acc.pain.toLowerCase().split(' ')[0]);
            return nameMatch || painMatch;
          });

          if (matchedAccounts.length === 0) continue;

          // Simple relevance scoring
          const relevance = Math.min(
            matchedAccounts.length * 30 + (entry.contentSnippet ? 20 : 0) + 20,
            100
          );

          if (relevance < dismissBelow) continue;

          items.push({
            type: 'signal_review',
            title: entry.title || 'Untitled signal',
            accName: matchedAccounts[0].name,
            accId: matchedAccounts[0].id,
            agent: 'signal_hunter',
            confidence: relevance / 100,
            confidenceBreakdown: {
              accountMatch: matchedAccounts.length / accounts.length,
              contentQuality: entry.contentSnippet ? 0.8 : 0.3,
            },
            sources: [{ name: source.name, url }],
            payload: {
              signalType: source.category,
              headline: entry.title || '',
              summary: (entry.contentSnippet || '').slice(0, 500),
              sourceUrl: url,
              sourceName: source.name,
              relevanceScore: relevance,
              matchedAccounts: matchedAccounts.map((a) => ({
                id: a.id,
                name: a.name,
                matchReason: text.includes(a.name.toLowerCase()) ? 'name_match' : 'pain_match',
              })),
              rawData: { pubDate: entry.pubDate },
            },
            reasoning: `Found "${entry.title}" matching ${matchedAccounts.length} account(s). Relevance: ${relevance}/100.`,
            priority: relevance >= 80 ? 'High' : 'Normal',
          });

          existingUrls.add(url); // prevent dupes within same run
        }
      } catch (err) {
        errors.push({
          message: `Failed to fetch RSS: ${source.name} (${source.url})`,
          source: source.name,
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned, matched: items.length, skipped: scanned - items.length },
      errors,
    };
  },
};
```

- [ ] **Step 4: Run tests, verify pass, commit**

Run: `npx vitest run src/lib/agents/__tests__/signal-hunter.test.ts`
Expected: PASS

```bash
git add package.json package-lock.json src/lib/agents/signal-hunter.ts src/lib/agents/__tests__/signal-hunter.test.ts
git commit -m "feat(agents): implement Signal Hunter agent with RSS support"
```

---

## Chunk 5: Account Enricher + Outreach Drafter Agents

### Task 15: Implement Account Enricher agent

**Files:**
- Create: `src/lib/agents/account-enricher.ts`
- Test: `src/lib/agents/__tests__/account-enricher.test.ts`

- [ ] **Step 1: Write tests, then implementation**

Test: verify it creates enrichment queue items for accounts with stale fields. Implementation: query accounts, check field staleness (updatedAt vs threshold), cross-reference signals and emails for new data, create enrichment items.

```typescript
// src/lib/agents/account-enricher.ts
import prisma from '@/lib/prisma';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  stalenessThresholdDays: 30,
  minConfidenceForSuggestion: 0.6,
  fieldsToTrack: ['pain', 'whyNow'],
};

export const accountEnricherAgent: Agent = {
  name: 'account_enricher',
  triggers: [
    { type: 'cron', schedule: '0 6 * * 1' },
    { type: 'chain', afterApproval: 'lead_qualification' },
    { type: 'chain', afterApproval: 'signal_review' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const staleDays = Number(params.stalenessThresholdDays) || 30;
    const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    // If chain-triggered, enrich only the specific account
    let accountFilter: Record<string, unknown> = {};
    if (ctx.triggerEvent?.payload?.accId) {
      accountFilter = { id: String(ctx.triggerEvent.payload.accId) };
    }

    const accounts = await prisma.account.findMany({
      where: {
        ...accountFilter,
        updatedAt: { lt: staleCutoff },
      },
      include: {
        signals: { take: 5, orderBy: { createdAt: 'desc' } },
      },
    });

    const items: NewQueueItem[] = [];
    let matched = 0;

    for (const account of accounts) {
      // Check for missing/stale fields
      if (!account.pain || !account.whyNow) {
        // Look for hints in recent signals
        const signalHints = account.signals
          .map((s) => s.summary)
          .filter(Boolean)
          .join(' ');

        if (!account.pain && signalHints) {
          matched++;
          items.push({
            type: 'enrichment',
            title: `Update pain for ${account.name}`,
            accName: account.name,
            accId: account.id,
            agent: 'account_enricher',
            confidence: 0.6,
            confidenceBreakdown: { signalBased: 0.6 },
            sources: account.signals.map((s) => ({ name: s.source || 'Signal', url: s.sourceUrl })),
            payload: {
              accountId: account.id,
              field: 'pain',
              currentValue: account.pain || null,
              suggestedValue: `Review recent signals for pain indicators`,
              source: 'cross-reference',
              confidence: 0.6,
            },
            reasoning: `Account "${account.name}" has no pain field set. ${account.signals.length} recent signals available for context.`,
            priority: 'Normal',
          });
        }
      }
    }

    return {
      items,
      metrics: { scanned: accounts.length, matched, skipped: accounts.length - matched },
      errors: [],
    };
  },
};
```

- [ ] **Step 2: Run tests, verify pass, commit**

```bash
git add src/lib/agents/account-enricher.ts src/lib/agents/__tests__/account-enricher.test.ts
git commit -m "feat(agents): implement Account Enricher agent"
```

---

### Task 16: Implement Outreach Drafter agent

**Files:**
- Create: `src/lib/agents/outreach-drafter.ts`
- Test: `src/lib/agents/__tests__/outreach-drafter.test.ts`

- [ ] **Step 1: Install Anthropic SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Write tests**

Mock the Anthropic SDK to avoid real API calls. Test that the agent finds leads without outreach, gathers context, and creates outreach_draft queue items.

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/agents/outreach-drafter.ts
import prisma from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

const DEFAULT_PARAMS = {
  templateStyle: 'consultative',
  maxSequenceLength: 4,
  maxEmailWords: 200,
  claudeModel: 'claude-sonnet-4-6',
};

export const outreachDrafterAgent: Agent = {
  name: 'outreach_drafter',
  triggers: [
    { type: 'cron', schedule: '0 9 * * 1-5' },
    { type: 'chain', afterApproval: 'lead_qualification' },
  ],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    const params = { ...DEFAULT_PARAMS, ...(ctx.config.parameters as Record<string, unknown>) };
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return {
        items: [],
        metrics: { scanned: 0, matched: 0, skipped: 0 },
        errors: [{ message: 'ANTHROPIC_API_KEY not configured', recoverable: false }],
      };
    }

    const anthropic = new Anthropic({ apiKey });

    // Find leads/accounts needing outreach
    const leads = await prisma.lead.findMany({
      where: { status: 'Qualified' },
      take: 10,
    });

    const items: NewQueueItem[] = [];
    const errors: import('./types').AgentError[] = [];

    for (const lead of leads) {
      try {
        // Get account context if exists
        const account = lead.company
          ? await prisma.account.findFirst({
              where: { name: { contains: lead.company, mode: 'insensitive' } },
              include: {
                contacts: { take: 1, orderBy: { warmth: 'desc' } },
                signals: { take: 3, orderBy: { createdAt: 'desc' } },
              },
            })
          : null;

        const contact = account?.contacts?.[0];
        const signals = account?.signals || [];

        const prompt = `You are a B2B sales outreach specialist. Write a ${params.templateStyle} email.

Context:
- Company: ${lead.company}
- Pain: ${account?.pain || lead.pain || 'Unknown'}
- Why Now: ${account?.whyNow || 'Not specified'}
- Contact: ${contact ? `${contact.name}, ${contact.title}` : 'Unknown'}
- Recent signals: ${signals.map((s) => s.title).join('; ') || 'None'}
- Sequence step: 1 of ${params.maxSequenceLength}

Generate a JSON response with:
- subjectA: first subject line option
- subjectB: second subject line option
- body: email body (max ${params.maxEmailWords} words)
- reasoning: one line explaining your approach`;

        const response = await anthropic.messages.create({
          model: String(params.claudeModel),
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        let parsed: Record<string, string>;
        try {
          // Try to extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { subjectA: lead.company, subjectB: lead.company, body: text, reasoning: '' };
        } catch {
          parsed = { subjectA: `Introduction: ${lead.company}`, subjectB: `Quick question for ${lead.company}`, body: text, reasoning: 'Generated from raw response' };
        }

        items.push({
          type: 'outreach_draft',
          title: `Draft outreach: ${lead.company}`,
          accName: account?.name || lead.company,
          accId: account?.id || null,
          agent: 'outreach_drafter',
          confidence: 0.7,
          confidenceBreakdown: { contextRichness: signals.length > 0 ? 0.8 : 0.4 },
          sources: signals.map((s) => ({ name: s.source || 'Signal', url: s.sourceUrl })),
          payload: {
            contactId: contact?.id || null,
            accountId: account?.id || null,
            subject: parsed.subjectA || `Introduction: ${lead.company}`,
            subjectVariantB: parsed.subjectB || parsed.subjectA || '',
            body: parsed.body || '',
            templateStyle: String(params.templateStyle),
            contextUsed: [
              ...(account?.pain ? ['pain'] : []),
              ...(account?.whyNow ? ['whyNow'] : []),
              ...(signals.length > 0 ? ['signals'] : []),
            ],
            sequenceStep: 1,
            sequenceTotal: Number(params.maxSequenceLength),
            previousOutreachId: null,
          },
          reasoning: parsed.reasoning || `Generated ${params.templateStyle} outreach for ${lead.company}.`,
          priority: 'Normal',
        });
      } catch (err) {
        errors.push({
          message: `Failed to draft for ${lead.company}: ${err instanceof Error ? err.message : String(err)}`,
          source: lead.id,
          recoverable: true,
        });
      }
    }

    return {
      items,
      metrics: { scanned: leads.length, matched: items.length, skipped: leads.length - items.length },
      errors,
    };
  },
};
```

- [ ] **Step 4: Run tests, verify pass, commit**

```bash
git add package.json package-lock.json src/lib/agents/outreach-drafter.ts src/lib/agents/__tests__/outreach-drafter.test.ts
git commit -m "feat(agents): implement Outreach Drafter agent with Claude API"
```

---

## Chunk 6: Agent Registration + React Query Hooks + Final Wiring

### Task 17: Register all agents in registry

**Files:**
- Create: `src/lib/agents/index.ts`

- [ ] **Step 1: Create index that registers all agents**

```typescript
// src/lib/agents/index.ts
import { registerAgent } from './registry';
import { pipelineHygieneAgent } from './pipeline-hygiene';
import { inboxClassifierAgent } from './inbox-classifier';
import { leadQualifierAgent } from './lead-qualifier';
import { signalHunterAgent } from './signal-hunter';
import { accountEnricherAgent } from './account-enricher';
import { outreachDrafterAgent } from './outreach-drafter';

// Register all agents on import
const agents = [
  pipelineHygieneAgent,
  inboxClassifierAgent,
  leadQualifierAgent,
  signalHunterAgent,
  accountEnricherAgent,
  outreachDrafterAgent,
];

for (const agent of agents) {
  registerAgent(agent);
}

export { agents };
export { getAgent, getAllAgents, getAgentsByTrigger } from './registry';
export { runAgent, runDueAgents } from './runner';
export { emitEvent } from './events';
export { handleApproval } from './chain';
```

- [ ] **Step 2: Import agents index in sync route**

In `src/app/api/sync/route.ts`, add at top:
```typescript
import '@/lib/agents'; // registers all agents
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/index.ts src/app/api/sync/route.ts
git commit -m "feat(agents): register all 6 agents and wire into sync route"
```

---

### Task 18: Create React Query hooks for agents

**Files:**
- Create: `src/lib/queries/agents.ts`

- [ ] **Step 1: Write query hooks**

```typescript
// src/lib/queries/agents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const agentKeys = {
  all: ['agents'] as const,
  list: () => ['agents', 'list'] as const,
  detail: (name: string) => ['agents', name] as const,
  runs: (name: string) => ['agents', name, 'runs'] as const,
  analytics: (period?: string) => ['agents', 'analytics', period] as const,
  agentAnalytics: (name: string, period?: string) => ['agents', name, 'analytics', period] as const,
};

// Add to api-client.ts:
// agents: {
//   list: () => get('/agents'),
//   get: (name: string) => get(`/agents/${name}`),
//   update: (name: string, data: Record<string, unknown>) => patch(`/agents/${name}`, data),
//   run: (name: string) => post(`/agents/${name}/run`, {}),
//   runs: (name: string) => get(`/agents/${name}/runs`),
//   analytics: (period?: string) => get(`/agents/analytics${period ? `?period=${period}` : ''}`),
//   agentAnalytics: (name: string, period?: string) => get(`/agents/${name}/analytics${period ? `?period=${period}` : ''}`),
// },

export function useAgentsQuery() {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: () => fetch('/api/agents').then((r) => r.json()),
  });
}

export function useAgentQuery(name: string) {
  return useQuery({
    queryKey: agentKeys.detail(name),
    queryFn: () => fetch(`/api/agents/${name}`).then((r) => r.json()),
    enabled: !!name,
  });
}

export function useAgentRunsQuery(name: string) {
  return useQuery({
    queryKey: agentKeys.runs(name),
    queryFn: () => fetch(`/api/agents/${name}/runs`).then((r) => r.json()),
    enabled: !!name,
  });
}

export function useAgentAnalyticsQuery(period: string = '30d') {
  return useQuery({
    queryKey: agentKeys.analytics(period),
    queryFn: () => fetch(`/api/agents/analytics?period=${period}`).then((r) => r.json()),
  });
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Record<string, unknown> }) =>
      fetch(`/api/agents/${name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useRunAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetch(`/api/agents/${name}`, { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries/agents.ts
git commit -m "feat(agents): add React Query hooks for agent management"
```

---

### Task 19: Run full test suite and verify build

- [ ] **Step 1: Run all agent tests**

Run: `npx vitest run src/lib/agents/`
Expected: All tests PASS

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any test/build issues from agent framework"
```
