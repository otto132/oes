# Agent Framework & All 6 Agents — Design Spec

> Date: 2026-03-13
> Status: Draft
> Scope: Agent execution framework, event bus, chain coordinator, analytics dashboard, and implementation of all 6 agents

---

## 1. Overview

Build a lightweight agent runtime within the existing Next.js + Prisma stack. Six AI agents generate QueueItems for human review. Agents are triggered by cron schedules, system events, or approval chains. All agent output goes through the existing human-in-the-loop queue — no agent takes autonomous action.

### Goals

- Implement all 6 agents: Pipeline Hygiene, Inbox Classifier, Lead Qualifier, Signal Hunter, Account Enricher, Outreach Drafter
- Agent framework with registry, runner, event bus, and chain coordinator
- Event-driven + cron triggering model
- Parallel fan-out chaining with queue checkpoints at each step
- Agent analytics dashboard with per-agent and cross-agent metrics
- Settings API for agent configuration, pause/resume, manual run

### Non-Goals

- No fan-in (waiting for multiple approvals before triggering next step)
- No custom agent builder UI (admin defines agents in code, configures via Settings)
- No external job queue infrastructure (no Redis, BullMQ, Inngest)

---

## 2. Agent Interface & Registry

### Core Interfaces

```typescript
// src/lib/agents/types.ts

interface Agent {
  name: string;                    // e.g. "pipeline_hygiene"
  triggers: AgentTrigger[];        // cron schedule + event triggers

  analyze(context: AgentContext): Promise<AgentResult>;
}

interface AgentContext {
  config: AgentConfig;             // from DB (parameters, thresholds)
  userId: string;                  // system user or triggering user
  triggerEvent?: AgentEvent;       // if event-triggered, the event data
}

interface AgentResult {
  items: NewQueueItem[];           // queue items to create
  metrics: { scanned: number; matched: number; skipped: number };
  errors: AgentError[];            // non-fatal errors (e.g., one RSS feed failed)
}

interface AgentError {
  message: string;
  source?: string;                 // which sub-task failed
  recoverable: boolean;
}

type AgentTrigger =
  | { type: 'cron'; schedule: string }                    // "0 */4 * * *"
  | { type: 'event'; event: string }                      // "emails_synced"
  | { type: 'chain'; afterApproval: QueueItemType }       // runs after approval of specific type

interface NewQueueItem {
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
  priority: 'High' | 'Normal' | 'Low';
}
```

### Registry

```typescript
// src/lib/agents/registry.ts

// Simple map — all 6 agents imported and registered at build time
const registry = new Map<string, Agent>();

export function registerAgent(agent: Agent): void;
export function getAgent(name: string): Agent | undefined;
export function getAllAgents(): Agent[];
export function getAgentsByTrigger(trigger: AgentTrigger['type'], match: string): Agent[];
```

No dynamic loading. All agents are statically imported.

---

## 3. Agent Runner

### Execution Lifecycle

```
Trigger (cron/event/manual)
  → Check AgentConfig status (skip if paused/disabled)
  → Create AgentRun record (status: running)
  → Call agent.analyze(context)
  → Bulk-create returned QueueItems
  → Update AgentRun (status: completed/failed, metrics, duration)
  → Emit events if applicable
```

### AgentRun DB Model

```prisma
model AgentRun {
  id           String    @id @default(cuid())
  agentName    String
  status       String    // "running", "completed", "failed"
  trigger      String    // "cron", "manual", "event:emails_synced", "chain:lead_qualification"
  itemsCreated Int       @default(0)
  itemsScanned Int       @default(0)
  itemsMatched Int       @default(0)
  errors       Json      @default("[]")
  startedAt    DateTime  @default(now())
  completedAt  DateTime?
  durationMs   Int?

  @@index([agentName, startedAt(sort: Desc)])
  @@map("agent_runs")
}
```

### Runner Implementation

```typescript
// src/lib/agents/runner.ts

export async function runAgent(
  agent: Agent,
  trigger: string,
  event?: AgentEvent
): Promise<AgentRun>;

export async function runDueAgents(): Promise<AgentRun[]>;
// Checks cron schedules against lastRunAt, processes pending events
```

Error handling:
- Non-fatal errors (from `AgentResult.errors`) are stored in AgentRun but don't fail the run
- Uncaught exceptions mark the run as `failed` with the error captured
- A failed run does not prevent future runs of the same agent

---

## 4. Event Bus

### DB-Backed Event System

```prisma
model AgentEvent {
  id          String   @id @default(cuid())
  event       String   // "emails_synced", "queue_item_approved", "calendar_synced"
  payload     Json     @default("{}")
  processed   Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([processed, event])
  @@map("agent_events")
}
```

### Event Operations

```typescript
// src/lib/agents/events.ts

export async function emitEvent(event: string, payload?: Record<string, unknown>): Promise<void>;
export async function consumePendingEvents(): Promise<AgentEvent[]>;
export async function markProcessed(eventId: string): Promise<void>;
export async function expireOldEvents(maxAgeMs?: number): Promise<number>;
// Default: expire unprocessed events older than 1 hour
```

### Event Catalog

| Event                  | Emitted By                        | Consumers                    |
|------------------------|-----------------------------------|------------------------------|
| `emails_synced`        | `/api/sync` after email sync      | Inbox Classifier             |
| `calendar_synced`      | `/api/sync` after calendar sync   | (future use)                 |
| `queue_item_approved`  | `/api/queue` POST approve         | Chain Coordinator            |
| `signal_created`       | Signal Hunter                     | Lead Qualifier (chain)       |
| `lead_created`         | Queue approval of lead_qual       | Outreach Drafter (chain)     |

Events are consumed by the agent runner polling on each cron tick. Not a real pub/sub — sufficient for current scale (single team, 6 agents).

---

## 5. Chain Coordinator

### Parallel Fan-Out with Queue Checkpoints

When a queue item is approved, the chain coordinator checks if any agents have a matching `chain` trigger. All matching agents execute in parallel, each producing independent queue items for separate human review.

```
Signal Hunter ──creates──▶ Signal
                              │
                    ◆ Human approves signal ◆
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        Lead Qualifier   Account Enricher   (any future agent)
              │               │
    ◆ Human approves ◆  ◆ Human approves ◆
              │               │
              ▼               ▼
       Outreach Drafter   Side-effect applied
              │
    ◆ Human approves/edits ◆
              │
       Activity created
```

### Implementation

```typescript
// src/lib/agents/chain.ts

export async function handleApproval(
  approvedItem: QueueItem,
  approvalPayload: Record<string, unknown>
): Promise<void>;
// 1. Emit queue_item_approved event with item type + payload
// 2. Next cron tick picks up event, finds agents with matching chain trigger
// 3. Runner executes all matching agents with event context
```

**Constraints:**
- Chains are fan-out only (one approval triggers multiple agents)
- No fan-in (no waiting for multiple approvals to converge)
- Each branch is independent — no coordination between parallel chains

---

## 6. The 6 Agents

### 6a. Pipeline Hygiene Agent

**File:** `src/lib/agents/pipeline-hygiene.ts`
**Trigger:** Cron daily 8am (`0 8 * * *`)
**Data source:** Local DB only

**Logic:**
- Query opportunities with no Activity in last N days (default 7, configurable)
- Query opportunities where health score < threshold (default 40)
- Query opportunities past expected close date
- Detect deals stuck at same stage too long (configurable per stage)
- Flag close date clustering (too many deals closing same month)
- Detect competitor mentions in recent signals/emails for accounts with open opps
- Suggest next-best-action based on current stage
- Decay engagement health by configurable amount (default 5 pts/week) for stale deals
- Create `task_creation` queue items for each flagged opportunity

**Queue item payload:**
```typescript
{
  opportunityId: string,
  reason: 'stale' | 'low_health' | 'overdue_close' | 'stuck_stage' | 'close_clustering' | 'competitor_risk',
  daysSinceActivity: number,
  currentHealth: number,
  suggestedAction: string,     // "Schedule check-in call", "Update close date", etc.
  details: Record<string, unknown>  // reason-specific context
}
```

**Configurable parameters:**
- `staleThresholdDays`: 7
- `healthAlertThreshold`: 40
- `decayPointsPerWeek`: 5
- `stuckStageThresholds`: `{ Discovery: 14, Proposal: 21, Negotiation: 14 }`

---

### 6b. Inbox Classifier Agent

**File:** `src/lib/agents/inbox-classifier.ts`
**Trigger:** Event `emails_synced`
**Data source:** Newly synced InboxEmail records

**Logic:**
- Enhanced classification beyond basic email sync:
  - Score urgency based on keywords + sender importance (contact warmth)
  - Detect sentiment shifts — sequence of positive emails followed by cold/short reply
  - Track response time patterns — contact who used to reply quickly now takes days
  - Thread analysis — detect CC changes (adding procurement = buying signal, legal = risk)
- Match sender domain to accounts, flag new domains
- For high-urgency unlinked emails: create `enrichment` queue items suggesting account linking
- For emails with clear action requests: create `task_creation` queue items
- For detected sentiment shifts: create `enrichment` queue items flagging engagement risk

**Queue item payloads:**
- `enrichment` (account linking): `{ emailId, senderDomain, suggestedAccountName, confidence }`
- `enrichment` (sentiment alert): `{ accountId, trend, recentEmails, riskLevel }`
- `task_creation`: `{ emailId, suggestedTitle, suggestedDueDate, accountId }`

**Configurable parameters:**
- `minClassificationConfidence`: 0.7
- `urgencyKeywords`: ["urgent", "deadline", "asap", "critical"]
- `sentimentWindowDays`: 14
- `responseTimeAlertMultiplier`: 3 (alert if 3x slower than average)

---

### 6c. Lead Qualifier Agent

**File:** `src/lib/agents/lead-qualifier.ts`
**Trigger:** Cron every 4 hours (`0 */4 * * *`) + chain after signal approval
**Data source:** Local DB (leads, signals, accounts, activities)

**Logic:**
- Score unscored leads using FIUAC criteria from available data
- Signals, email activity, company size/type feed into scoring
- Look-alike scoring: compare new lead attributes against won vs lost deal attributes
- Timing signals: detect contract renewal dates, fiscal year end, regulatory deadlines
- Engagement velocity: track rate of change in engagement (improving = hot)
- Above auto-qualify threshold (default 70): create `lead_qualification` item recommending "qualify"
- Below auto-disqualify (default 25): create item recommending "disqualify"
- Between: create item for human judgment with detailed reasoning
- When chain-triggered by approved signal, score only the related lead

**Queue item payload:**
```typescript
{
  leadId: string,
  scores: { f: number, i: number, u: number, a: number, c: number },
  recommendation: 'qualify' | 'disqualify' | 'review',
  reasoning: string,
  dataPoints: string[],           // what informed the score
  lookAlikeScore: number | null,  // similarity to won deals (0-100)
  engagementVelocity: 'rising' | 'stable' | 'declining' | null,
  timingSignals: string[]         // "fiscal_year_end", "contract_renewal", etc.
}
```

**Configurable parameters:**
- `autoQualifyThreshold`: 70
- `autoDisqualifyThreshold`: 25
- `lookAlikeMinSampleSize`: 5 (need at least 5 won deals for comparison)
- `engagementWindowDays`: 30

---

### 6d. Signal Hunter Agent

**File:** `src/lib/agents/signal-hunter.ts`
**Trigger:** Cron every 4 hours (`0 */4 * * *`)
**Data source:** Hybrid — RSS feeds (real), simulated API data for others

**Logic:**
- Fetch from configured sources (RSS feeds for news/energy markets)
- Match against existing accounts by company name, industry keywords, pain points
- Score relevance (0-100) against account context and opportunity stages
- Above min threshold (default 60): create signal + queue item for review
- Below auto-dismiss (default 30): skip
- Between: create queue item for human judgment
- Dedup against existing signals by source URL
- Track approval/rejection rates per source for feedback loop

**Real sources (free, no API key):**
- RSS feeds (configurable list in agent parameters)
- Public regulatory filings

**Simulated sources (for now):**
- LinkedIn activity, Bloomberg, proprietary databases
- Simulated data uses realistic patterns but is clearly marked

**Queue item payload:**
```typescript
{
  signalType: string,
  headline: string,
  summary: string,
  sourceUrl: string,
  sourceName: string,
  relevanceScore: number,
  matchedAccounts: { id: string, name: string, matchReason: string }[],
  rawData: Record<string, unknown>
}
```

**Configurable parameters:**
- `scanFrequencyHours`: 4
- `minRelevanceThreshold`: 60
- `autoDismissBelow`: 30
- `rssSources`: `[{ name: string, url: string, category: string }]`
- `matchKeywords`: string[] (additional keywords beyond account data)

**Feedback loop:**
- Analytics tracks approval rate per `sourceName`
- Settings UI shows per-source effectiveness
- Admin can disable low-performing sources via config

---

### 6e. Account Enricher Agent

**File:** `src/lib/agents/account-enricher.ts`
**Trigger:** Cron weekly Monday 6am (`0 6 * * 1`) + chain after lead approval
**Data source:** Hybrid — cross-references local data, simulated external

**Logic:**
- For each account, check what data is stale or missing
- Cross-reference signals, emails, and meeting notes for new information
- Detect changes: new contacts mentioned in emails, company news from signals
- Check field staleness: pain, whyNow, employee count, industry classification
- Create `enrichment` queue items for fields that can be updated
- When chain-triggered, enrich only the specific account from the approved lead

**Queue item payload:**
```typescript
{
  accountId: string,
  field: string,                // "pain", "whyNow", "employeeCount", etc.
  currentValue: unknown,
  suggestedValue: unknown,
  source: string,               // "signal:xyz", "email:abc", "cross-reference"
  confidence: number
}
```

**Configurable parameters:**
- `refreshCycleDays`: 7
- `stalenessThresholdDays`: 30 (flag fields not updated in 30 days)
- `minConfidenceForSuggestion`: 0.6
- `fieldsToTrack`: ["pain", "whyNow", "employeeCount", "industry", "website"]

---

### 6f. Outreach Drafter Agent

**File:** `src/lib/agents/outreach-drafter.ts`
**Trigger:** Cron daily 9am weekdays (`0 9 * * 1-5`) + chain after lead qualification approval
**Data source:** Local DB + Claude API for text generation

**Logic:**
- Find approved leads and active opportunities without recent outreach
- Gather context: account pain, whyNow, recent signals, contact info, prior outreach
- Call Claude API with structured prompt including all context
- Generate personalized email draft
- Support multi-step sequences (1-4 steps, configurable)
- Generate A/B subject line variants for human to choose
- Follow-up awareness: if previous outreach exists, reference it and adjust tone
- Create `outreach_draft` queue item with draft for human edit/approval

**Claude API prompt structure:**
```
System: You are a B2B sales outreach specialist. Write a {templateStyle} email.
Context:
- Account: {name}, Industry: {industry}
- Pain: {pain}, Why Now: {whyNow}
- Recent signals: {signals}
- Contact: {name, title, warmth}
- Previous outreach: {prior emails in sequence, if any}
- Sequence step: {step} of {totalSteps}

Generate:
1. Subject line (2 variants)
2. Email body ({maxLength} words max)
3. One-line reasoning for the approach taken
```

**Queue item payload:**
```typescript
{
  contactId: string,
  accountId: string,
  subjectVariants: string[],       // 2 options for human to pick
  body: string,
  templateStyle: string,           // "consultative" | "direct" | "educational"
  contextUsed: string[],           // what data informed the draft
  sequenceStep: number,            // 1-4
  sequenceTotal: number,
  previousOutreachId: string | null
}
```

**Configurable parameters:**
- `templateStyle`: "consultative"
- `maxSequenceLength`: 4
- `maxEmailWords`: 200
- `generateVariants`: true
- `personalizationSources`: ["pain", "whyNow", "signals"]
- `claudeModel`: "claude-sonnet-4-6" (configurable for cost control)

**Env var required:** `ANTHROPIC_API_KEY`

---

## 7. API Endpoints

### New Routes

```
# Agent Management
GET    /api/agents                    → list all agents with config + last run
GET    /api/agents/:name              → single agent detail + recent runs
PATCH  /api/agents/:name              → update config (parameters, status)
POST   /api/agents/:name/run          → manual "Run Now" trigger

# Agent Analytics
GET    /api/agents/analytics          → cross-agent metrics (period query param)
GET    /api/agents/:name/analytics    → per-agent metrics

# Agent Run History
GET    /api/agents/:name/runs         → paginated run history

# Agent Events (admin debug)
GET    /api/agents/events             → recent events list
```

### Modified Existing Routes

**`POST /api/queue`** — after approval, call:
```typescript
await emitEvent('queue_item_approved', {
  type: item.type,
  id: item.id,
  accId: item.accId,
  payload: item.payload
});
```

**`POST /api/sync`** — after email sync, call:
```typescript
await emitEvent('emails_synced', { count: synced, timestamp: new Date().toISOString() });
```
After calendar sync:
```typescript
await emitEvent('calendar_synced', { count: synced, timestamp: new Date().toISOString() });
```

Add new sync type `agents`:
```typescript
// POST /api/sync { type: "agents" }
// Calls runDueAgents() — checks cron schedules + pending events
```

### Cron Configuration

Single Vercel Cron entry for agents:
```json
// vercel.json
{
  "crons": [
    { "path": "/api/sync", "schedule": "* * * * *" }  // every minute — runner decides what's due
  ]
}
```

The runner is idempotent — if nothing is due, it returns immediately.

---

## 8. Analytics Dashboard

### Per-Agent Metrics

Derived from `AgentRun` + `QueueItem` tables:

- **Run history:** last 10 runs with status, duration, items created
- **Approval rate:** % of queue items approved vs rejected (rolling 30 days)
- **False positive rate:** rejection rate broken down by rejection reason
- **Avg review time:** time between queue item creation and human action
- **Items created over time:** count per day/week

### Cross-Agent Metrics

- **Total queue throughput:** items created vs reviewed per day/week
- **Queue backlog:** pending items by type and age
- **Chain completion rate:** % of chains completing all steps vs stalling
- **Source effectiveness** (Signal Hunter): approval rate per RSS source

### API Response Shape

```typescript
// GET /api/agents/analytics?period=30d
{
  period: { start: string, end: string },
  agents: {
    [agentName: string]: {
      totalRuns: number,
      successfulRuns: number,
      failedRuns: number,
      totalItemsCreated: number,
      approvalRate: number,        // 0-1
      avgReviewTimeMs: number,
      itemsByDay: { date: string, count: number }[]
    }
  },
  overall: {
    totalItemsCreated: number,
    totalItemsReviewed: number,
    pendingBacklog: number,
    chainCompletionRate: number,
    topRejectionReasons: { reason: string, count: number }[]
  }
}
```

No new DB tables needed — all derived from queries against `AgentRun` and `QueueItem`.

---

## 9. File Structure

```
src/lib/agents/
├── types.ts              # Agent, AgentContext, AgentResult, AgentTrigger interfaces
├── registry.ts           # Agent registry — maps name → agent module
├── runner.ts             # Agent runner — execution lifecycle, error handling
├── events.ts             # Event bus — emit, consume, mark processed
├── chain.ts              # Chain coordinator — fan-out logic after approvals
├── analytics.ts          # Analytics queries — metrics aggregation
│
├── pipeline-hygiene.ts   # Agent implementation
├── inbox-classifier.ts   # Agent implementation
├── lead-qualifier.ts     # Agent implementation
├── signal-hunter.ts      # Agent implementation
├── account-enricher.ts   # Agent implementation
└── outreach-drafter.ts   # Agent implementation

src/app/api/agents/
├── route.ts              # GET /api/agents, GET /api/agents/analytics
├── [name]/
│   ├── route.ts          # GET/PATCH single agent, POST run
│   ├── analytics/
│   │   └── route.ts      # GET per-agent analytics
│   └── runs/
│       └── route.ts      # GET run history
└── events/
    └── route.ts          # GET events (admin debug)

src/lib/queries/
└── agents.ts             # React Query hooks: useAgents, useAgentRuns, useAgentAnalytics

src/lib/schemas/
└── agents.ts             # Zod schemas for agent config updates, run triggers
```

---

## 10. Schema Changes Summary

### New Models

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

  @@index([agentName, startedAt(sort: Desc)])
  @@map("agent_runs")
}

model AgentEvent {
  id          String   @id @default(cuid())
  event       String
  payload     Json     @default("{}")
  processed   Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([processed, event])
  @@map("agent_events")
}
```

### Existing Model Changes

None — `AgentConfig` and `QueueItem` already have the fields needed.

---

## 11. Dependencies

### New

- `@anthropic-ai/sdk` — for Outreach Drafter Claude API calls
- `rss-parser` — for Signal Hunter RSS feed fetching

### Existing (already installed)

- `zod` — input validation for new API routes
- `@tanstack/react-query` — frontend hooks for agent data
- `@prisma/client` — all DB operations

---

## 12. Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Agent Framework with Registry | Modular, testable, no external infra deps |
| Triggering | Event-driven + cron | Responsive (inbox classifier) + scheduled (pipeline hygiene) |
| Chaining | Parallel fan-out, queue checkpoint per step | Human review at every step; fan-out for natural multi-agent responses |
| Fan-in | Not supported | Adds orchestration complexity with no current use case |
| Outreach generation | Claude API (LLM-powered) | Higher quality personalization; configurable model for cost control |
| External data | Hybrid (RSS real, others simulated) | Proves framework without API costs; gradually upgrade |
| Event bus | DB-backed polling | No external infra; sufficient for single-team scale |
| Cron strategy | Single endpoint, runner decides | Avoids multiple Vercel Cron entries; idempotent |
| Analytics storage | No new tables | Derived from AgentRun + QueueItem queries |
