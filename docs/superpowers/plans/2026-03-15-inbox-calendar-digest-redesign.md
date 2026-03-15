# Inbox, Calendar & Weekly Digest Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Inbox as a three-panel threaded email view, Calendar as a proper week/month view with AI-powered meeting outcomes, and add a Weekly Digest agent that summarizes CRM activity every Sunday evening.

**Architecture:** Activity-centric hub — Inbox and Calendar are rich views into the existing data models (InboxEmail, Meeting) with new fields for threading, email bodies, meeting outcomes, and snooze. Two new agents (meeting-analyst, weekly-digest) follow the existing agent framework pattern. All AI-generated actions route through the approval queue.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Prisma/PostgreSQL, Anthropic Claude SDK, Microsoft Graph API, React Query, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-03-15-inbox-calendar-digest-redesign.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `prisma/migrations/XXXX_inbox_calendar_digest/migration.sql` | Schema migration for all model changes |
| `src/lib/agents/meeting-analyst.ts` | Meeting Analyst agent — processes pasted notes into summary + tasks + enrichment |
| `src/lib/agents/weekly-digest.ts` | Weekly Digest agent — gathers 7-day CRM data, produces narrative summary |
| `src/lib/agents/schemas.ts` | Add Zod schemas for meeting analysis and digest outputs (extend existing file) |
| `src/lib/agents/__tests__/meeting-analyst.test.ts` | Tests for meeting-analyst agent |
| `src/lib/agents/__tests__/weekly-digest.test.ts` | Tests for weekly-digest agent |
| `src/app/(dashboard)/inbox/page.tsx` | Rewritten three-panel inbox page |
| `src/components/inbox/ThreadList.tsx` | Left panel — threaded conversation list with filters |
| `src/components/inbox/ThreadView.tsx` | Center panel — full conversation thread display |
| `src/components/inbox/InboxContext.tsx` | Right panel — account/contact context sidebar |
| `src/components/inbox/InboxQuickActions.tsx` | Quick action strip (reply, task, link, snooze) |
| `src/app/(dashboard)/meetings/page.tsx` | Rewritten calendar page with week/month view |
| `src/components/meetings/CalendarGrid.tsx` | Week/month calendar visualization |
| `src/components/meetings/MeetingCard.tsx` | Calendar card for individual meetings |
| `src/components/meetings/MeetingDrawer.tsx` | Slide-in drawer with Prep + Outcome tabs |
| `src/components/meetings/PrepTab.tsx` | Auto-generated talking points + attendee cards |
| `src/components/meetings/OutcomeTab.tsx` | Paste prompt → AI processing → review + confirm |
| `src/app/(dashboard)/digest/page.tsx` | Weekly digest archive page |
| `src/components/digest/DigestCard.tsx` | Rendered digest display component |
| `src/app/api/inbox/threads/route.ts` | GET threaded inbox data |
| `src/app/api/meetings/[id]/outcome/route.ts` | POST meeting outcome — triggers meeting-analyst |
| `src/app/api/meetings/[id]/prep/route.ts` | GET auto-generated meeting prep |
| `src/app/api/digest/route.ts` | GET digest list + current digest |
| `src/lib/queries/inbox.ts` | Extended with thread-based hooks (modify existing) |
| `src/lib/queries/meetings.ts` | Extended with prep/outcome hooks (modify existing) |
| `src/lib/queries/digest.ts` | New React Query hooks for digest |
| `src/lib/schemas/inbox.ts` | Zod schemas for inbox actions (modify existing or create) |
| `src/lib/schemas/meetings.ts` | Zod schemas for meeting outcome (modify existing) |
| `src/app/api/cron/meeting-nudge/route.ts` | Cron endpoint — daily pre-meeting email nudge |
| `src/app/api/cron/no-show-check/route.ts` | Cron endpoint — next-morning no-show detection |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add fields to InboxEmail, Meeting, Tenant; add WeeklyDigest model; extend QueueItemType enum |
| `src/lib/agents/index.ts` | Register meeting-analyst and weekly-digest agents |
| `src/lib/agents/schemas.ts` | Add MeetingAnalysisSchema, DigestOutputSchema |
| `src/lib/types.ts` | Extend Email and Meeting types with new fields; add WeeklyDigest type |
| `src/lib/adapters.ts` | Update adaptEmail and adaptMeeting for new fields; add adaptDigest |
| `src/lib/integrations/email-sync.ts` | Fetch and store email body + threading headers on sync |
| `src/lib/integrations/microsoft-graph.ts` | Add sendMail function |
| `src/components/shell/Sidebar.tsx` | Add Digest nav item |

---

## Chunk 1: Data Model & Migration

### Task 1: Extend Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new fields to InboxEmail model**

After the existing `externalId` field, add:

```prisma
  body          String?   @db.Text
  bodyHtml      String?   @db.Text
  messageId     String?
  inReplyTo     String?
  references    String[]
  threadId      String?
  snoozedUntil  DateTime?

  @@index([threadId])
  @@index([snoozedUntil])
```

- [ ] **Step 2: Add new fields to Meeting model**

After the existing `accountName` field, add:

```prisma
  rawNotes          String?    @db.Text
  outcomeSummary    String?    @db.Text
  outcomeRecordedAt DateTime?
  sentimentTag      String?
  noShow            Boolean    @default(false)
```

Replace the existing `@@index([date])` with:

```prisma
  @@index([date])
  @@index([accountId, date(sort: Desc)])
```

- [ ] **Step 3: Add WeeklyDigest model**

After the Meeting model, add:

```prisma
model WeeklyDigest {
  id                String   @id @default(cuid())
  weekStart         DateTime
  weekEnd           DateTime
  pipelineSnapshot  Json
  accountHighlights Json
  weekAhead         Json
  renderedHtml      String   @db.Text
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  createdAt         DateTime @default(now())

  @@index([tenantId, weekStart])
}
```

- [ ] **Step 4: Add WeeklyDigest relation to Tenant model**

In the Tenant model, after the `invitations` relation, add:

```prisma
  weeklyDigests  WeeklyDigest[]
```

- [ ] **Step 5: Extend QueueItemType enum**

Add `meeting_scheduling` to the QueueItemType enum:

```prisma
enum QueueItemType {
  outreach_draft
  lead_qualification
  enrichment
  task_creation
  signal_review
  meeting_scheduling
}
```

- [ ] **Step 6: Run migration**

Run: `npx prisma migrate dev --name inbox_calendar_digest`
Expected: Migration created and applied successfully.

- [ ] **Step 7: Verify Prisma client generates**

Run: `npx prisma generate`
Expected: Prisma Client generated successfully.

- [ ] **Step 8: Commit**

```bash
git add prisma/
git commit -m "feat(schema): add inbox threading, meeting outcomes, weekly digest model"
```

---

### Task 2: Extend Types & Adapters

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Extend Email type in types.ts**

Add new fields to the `Email` interface:

```typescript
export interface Email {
  // ... existing fields
  body?: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
  threadId?: string;
  snoozedUntil?: string; // ISO string
}
```

- [ ] **Step 2: Add EmailThread type**

```typescript
export interface EmailThread {
  threadId: string;
  emails: Email[];
  latestEmail: Email;
  accountName?: string;
  accountId?: string;
  isUnread: boolean;
  classification?: string;
  snoozedUntil?: string;
}
```

- [ ] **Step 3: Extend Meeting type**

Add new fields to the `Meeting` interface:

```typescript
export interface Meeting {
  // ... existing fields
  rawNotes?: string;
  outcomeSummary?: string;
  outcomeRecordedAt?: string;
  sentimentTag?: string;
  noShow?: boolean;
}
```

- [ ] **Step 4: Add WeeklyDigest type**

```typescript
export interface WeeklyDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  pipelineSnapshot: {
    totalValue: number;
    valueDelta: number;
    valueDeltaPct: number;
    stageChanges: { name: string; from: string; to: string }[];
    closedWon: { name: string; amount: number; context: string }[];
    closedLost: { name: string; amount: number; context: string }[];
    newOpps: { name: string; accountName: string; amount: number }[];
    atRisk: { name: string; healthDrop: number }[];
  };
  accountHighlights: {
    accountName: string;
    accountId: string;
    narrative: string;
    activityCount: number;
  }[];
  weekAhead: {
    meetings: { id: string; title: string; date: string; accountName?: string; prepStatus: string }[];
    tasksDue: { id: string; title: string; dueDate: string; accountName?: string }[];
    overdue: { id: string; title: string; dueDate: string; accountName?: string }[];
  };
  renderedHtml: string;
  createdAt: string;
}
```

- [ ] **Step 5: Update adaptEmail in adapters.ts**

Add the new fields to the `adaptEmail` function:

```typescript
export function adaptEmail(e: any): Email {
  return {
    // ... existing fields
    body: e.body ?? undefined,
    bodyHtml: e.bodyHtml ?? undefined,
    messageId: e.messageId ?? undefined,
    inReplyTo: e.inReplyTo ?? undefined,
    threadId: e.threadId ?? undefined,
    snoozedUntil: e.snoozedUntil?.toISOString() ?? undefined,
  };
}
```

- [ ] **Step 6: Update adaptMeeting in adapters.ts**

Add the new fields to the `adaptMeeting` function:

```typescript
export function adaptMeeting(m: any): Meeting {
  return {
    // ... existing fields
    rawNotes: m.rawNotes ?? undefined,
    outcomeSummary: m.outcomeSummary ?? undefined,
    outcomeRecordedAt: m.outcomeRecordedAt?.toISOString() ?? undefined,
    sentimentTag: m.sentimentTag ?? undefined,
    noShow: m.noShow ?? false,
  };
}
```

- [ ] **Step 7: Add adaptDigest function**

```typescript
export function adaptDigest(d: any): WeeklyDigest {
  return {
    id: d.id,
    weekStart: d.weekStart.toISOString(),
    weekEnd: d.weekEnd.toISOString(),
    pipelineSnapshot: d.pipelineSnapshot as WeeklyDigest['pipelineSnapshot'],
    accountHighlights: d.accountHighlights as WeeklyDigest['accountHighlights'],
    weekAhead: d.weekAhead as WeeklyDigest['weekAhead'],
    renderedHtml: d.renderedHtml,
    createdAt: d.createdAt.toISOString(),
  };
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/adapters.ts
git commit -m "feat(types): extend Email, Meeting types and add WeeklyDigest type + adapters"
```

---

### Task 3: Update Email Sync to Fetch Body + Threading Headers

**Files:**
- Modify: `src/lib/integrations/email-sync.ts`
- Modify: `src/lib/integrations/microsoft-graph.ts`

- [ ] **Step 1: Update Graph email fetch to request body and threading headers**

In `microsoft-graph.ts`, update the email fetch query to include `body`, `internetMessageHeaders`, and `internetMessageId` fields. The Graph API `$select` parameter should include these fields.

- [ ] **Step 2: Update email sync to extract threading headers**

In `email-sync.ts`, after fetching emails from Graph, extract:
- `internetMessageId` → store as `messageId`
- `internetMessageHeaders` → find `In-Reply-To` header → store as `inReplyTo`
- `internetMessageHeaders` → find `References` header → split by space → store as `references` array
- `body.content` → store as `bodyHtml`
- Strip HTML tags from `body.content` → store as `body` (plain text)

- [ ] **Step 3: Add thread ID computation**

After extracting headers, compute `threadId`:

```typescript
async function computeThreadId(email: { messageId?: string; inReplyTo?: string }): Promise<string> {
  if (email.inReplyTo) {
    // Look up existing email by messageId matching this inReplyTo
    const parent = await db.inboxEmail.findFirst({
      where: { messageId: email.inReplyTo },
      select: { threadId: true },
    });
    if (parent?.threadId) return parent.threadId;
  }
  // New thread — use messageId or generate cuid
  return email.messageId ?? createId();
}
```

- [ ] **Step 4: Add thread reconciliation on new email arrival**

After inserting a new email, check if any existing emails have `inReplyTo` matching the new email's `messageId` but a different `threadId`. If found, merge them:

```typescript
async function reconcileThreads(newEmail: { messageId?: string; threadId: string }) {
  if (!newEmail.messageId) return;
  await db.inboxEmail.updateMany({
    where: { inReplyTo: newEmail.messageId, threadId: { not: newEmail.threadId } },
    data: { threadId: newEmail.threadId },
  });
}
```

- [ ] **Step 5: Update the upsert call to include new fields**

In the existing email sync upsert, include: `body`, `bodyHtml`, `messageId`, `inReplyTo`, `references`, `threadId`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/email-sync.ts src/lib/integrations/microsoft-graph.ts
git commit -m "feat(sync): fetch email body + threading headers, compute thread IDs"
```

---

### Task 4: Add sendMail to Microsoft Graph Client

**Files:**
- Modify: `src/lib/integrations/microsoft-graph.ts`

- [ ] **Step 1: Add Mail.Send to Graph scopes**

In `src/lib/integrations/microsoft-graph.ts`, update `GRAPH_CONFIG.scopes` to include `'Mail.Send'`:

```typescript
scopes: ['openid', 'profile', 'email', 'Mail.Read', 'Mail.Send', 'Calendars.Read', 'User.Read', 'offline_access'],
```

**Note:** Existing users will need to re-consent for the new permission. This happens automatically on next OAuth redirect.

- [ ] **Step 2: Add sendMail function**

```typescript
export async function sendMail(
  accessToken: string,
  to: string[],
  subject: string,
  bodyHtml: string,
): Promise<void> {
  const message = {
    subject,
    body: { contentType: 'HTML', content: bodyHtml },
    toRecipients: to.map((email) => ({ emailAddress: { address: email } })),
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (res.status === 401) {
    throw new Error('TOKEN_EXPIRED');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed: ${res.status} ${text}`);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/integrations/microsoft-graph.ts
git commit -m "feat(graph): add Mail.Send scope and sendMail function for outbound email"
```

---

## Chunk 2: Meeting Analyst & Weekly Digest Agents

### Task 5: Add Zod Schemas for Agent Outputs

**Files:**
- Modify: `src/lib/agents/schemas.ts`

- [ ] **Step 1: Add MeetingAnalysisSchema**

```typescript
export const MeetingAnalysisSchema = z.object({
  summary: z.string().describe('Structured narrative summary of the meeting'),
  actionItems: z.array(z.object({
    title: z.string(),
    suggestedOwner: z.string().optional(),
    suggestedDueDate: z.string().optional(),
    accountName: z.string().optional(),
  })).describe('Extracted action items from the notes'),
  followUpMeetings: z.array(z.object({
    topic: z.string(),
    suggestedDate: z.string().optional(),
    attendees: z.array(z.string()),
  })).describe('Follow-up meetings detected in notes'),
  enrichmentSuggestions: z.array(z.object({
    field: z.string().describe('Account field to update (e.g., pain, whyNow, competitors)'),
    currentValue: z.string().optional(),
    suggestedValue: z.string(),
    reasoning: z.string(),
  })).describe('Account data that could be updated from meeting notes'),
  contactIntelligence: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    sentiment: z.string().optional().describe('positive | neutral | negative'),
    isNew: z.boolean().describe('Whether this is a new contact not yet in the CRM'),
  })).describe('Contact information mentioned in notes'),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
});
```

- [ ] **Step 2: Add DigestSectionSchema**

```typescript
export const DigestNarrativeSchema = z.object({
  pipelineSummary: z.string().describe('2-3 sentence narrative of pipeline changes this week'),
  accountParagraphs: z.array(z.object({
    accountId: z.string(),
    accountName: z.string(),
    narrative: z.string().describe('One paragraph summarizing this account\'s week'),
  })),
  weekAheadSummary: z.string().describe('1-2 sentence preview of the upcoming week'),
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/schemas.ts
git commit -m "feat(agents): add Zod schemas for meeting analysis and digest outputs"
```

---

### Task 6: Implement Meeting Analyst Agent

**Files:**
- Create: `src/lib/agents/meeting-analyst.ts`
- Test: `src/lib/agents/__tests__/meeting-analyst.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agents/__tests__/meeting-analyst.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../types';

const mockMeetingFindUnique = vi.fn();
const mockAccountFindUnique = vi.fn();
const mockParse = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    meeting: { findUnique: mockMeetingFindUnique },
    account: { findUnique: mockAccountFindUnique },
  },
}));

vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
}));

describe('Meeting Analyst Agent', () => {
  const ctx: AgentContext = {
    config: {
      id: 'cfg-1',
      name: 'meeting_analyst',
      displayName: 'Meeting Analyst',
      description: 'Process meeting notes',
      status: 'active',
      parameters: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    userId: 'user-1',
    triggerEvent: {
      id: 'evt-1',
      event: 'meeting_outcome_pasted',
      payload: { meetingId: 'mtg-1', rawNotes: 'Discussed pricing. John will send proposal by Friday. Follow up next week.' },
    },
  };

  beforeEach(() => vi.clearAllMocks());

  it('has correct name and event trigger', async () => {
    const { meetingAnalystAgent } = await import('../meeting-analyst');
    expect(meetingAnalystAgent.name).toBe('meeting_analyst');
    expect(meetingAnalystAgent.triggers).toContainEqual({ type: 'event', event: 'meeting_outcome_pasted' });
  });

  it('returns enrichment and task_creation queue items from notes', async () => {
    mockMeetingFindUnique.mockResolvedValue({
      id: 'mtg-1', title: 'Pricing Review', accountId: 'acc-1', accountName: 'Vattenfall',
      attendees: ['John Smith'], attendeeEmails: ['john@vattenfall.com'],
    });
    mockAccountFindUnique.mockResolvedValue({
      id: 'acc-1', name: 'Vattenfall', pain: 'High energy costs',
    });
    mockParse.mockResolvedValue({
      parsed_output: {
        summary: 'Discussed pricing strategy. John committed to sending proposal by Friday.',
        actionItems: [{ title: 'Send proposal', suggestedOwner: 'John', suggestedDueDate: '2026-03-20' }],
        followUpMeetings: [{ topic: 'Proposal review', attendees: ['John Smith'] }],
        enrichmentSuggestions: [{ field: 'whyNow', suggestedValue: 'Budget approved for Q2', reasoning: 'Mentioned budget' }],
        contactIntelligence: [],
        sentiment: 'positive',
      },
    });

    const { meetingAnalystAgent } = await import('../meeting-analyst');
    const result = await meetingAnalystAgent.analyze(ctx);

    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items.find(i => i.type === 'task_creation')).toBeDefined();
    expect(result.items.find(i => i.type === 'enrichment')).toBeDefined();
    expect(result.metrics.matched).toBeGreaterThan(0);
  });

  it('skips when agent is paused', async () => {
    const pausedCtx = { ...ctx, config: { ...ctx.config, status: 'paused' as const } };
    const { meetingAnalystAgent } = await import('../meeting-analyst');
    const result = await meetingAnalystAgent.analyze(pausedCtx);
    expect(result.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/meeting-analyst.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement meeting-analyst agent**

Create `src/lib/agents/meeting-analyst.ts`:

```typescript
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_SONNET } from './ai';
import { MeetingAnalysisSchema } from './schemas';
import { db } from '@/lib/db';
import type { Agent, AgentContext, AgentResult, NewQueueItem } from './types';

export const meetingAnalystAgent: Agent = {
  name: 'meeting_analyst',
  triggers: [{ type: 'event', event: 'meeting_outcome_pasted' }],

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    if (ctx.config.status !== 'active') {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 1 }, errors: [] };
    }

    const payload = ctx.triggerEvent?.payload as { meetingId: string; rawNotes: string } | undefined;
    if (!payload?.meetingId || !payload?.rawNotes) {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 1 }, errors: [{ message: 'Missing meetingId or rawNotes in event payload', recoverable: false }] };
    }

    const meeting = await db.meeting.findUnique({ where: { id: payload.meetingId } });
    if (!meeting) {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 1 }, errors: [{ message: `Meeting ${payload.meetingId} not found`, recoverable: false }] };
    }

    const account = meeting.accountId
      ? await db.account.findUnique({ where: { id: meeting.accountId } })
      : null;

    const client = getAnthropicClient();
    const response = await client.messages.parse({
      model: MODEL_SONNET,
      max_tokens: 2048,
      system: `You are a CRM meeting analyst. Extract structured information from raw meeting notes. The meeting was "${meeting.title}" with ${meeting.attendees?.join(', ') || 'unknown attendees'}.${account ? ` Account: ${account.name}.` : ''}`,
      messages: [{ role: 'user', content: payload.rawNotes }],
      ...zodOutputFormat(MeetingAnalysisSchema, 'meeting_analysis'),
    });

    const analysis = response.parsed_output;
    if (!analysis) {
      return { items: [], metrics: { scanned: 1, matched: 0, skipped: 0 }, errors: [{ message: 'Failed to parse meeting analysis', recoverable: true }] };
    }

    // Save summary directly to meeting (not queued)
    await db.meeting.update({
      where: { id: payload.meetingId },
      data: {
        rawNotes: payload.rawNotes,
        outcomeSummary: analysis.summary,
        outcomeRecordedAt: new Date(),
        sentimentTag: analysis.sentiment,
      },
    });

    // Build queue items for actions that need approval
    const items: NewQueueItem[] = [];

    for (const action of analysis.actionItems) {
      items.push({
        type: 'task_creation',
        title: `Task from meeting: ${action.title}`,
        accName: meeting.accountName ?? '',
        accId: meeting.accountId,
        agent: 'meeting_analyst',
        confidence: 0.75,
        confidenceBreakdown: { extraction: 0.75 },
        sources: [{ name: `Meeting: ${meeting.title}`, url: null }],
        payload: { taskTitle: action.title, suggestedOwner: action.suggestedOwner, suggestedDueDate: action.suggestedDueDate, meetingId: meeting.id },
        reasoning: `Extracted action item from meeting "${meeting.title}" notes.`,
        priority: 'Normal',
      });
    }

    for (const enrichment of analysis.enrichmentSuggestions) {
      items.push({
        type: 'enrichment',
        title: `Update ${enrichment.field} for ${meeting.accountName ?? 'account'}`,
        accName: meeting.accountName ?? '',
        accId: meeting.accountId,
        agent: 'meeting_analyst',
        confidence: 0.7,
        confidenceBreakdown: { extraction: 0.7 },
        sources: [{ name: `Meeting: ${meeting.title}`, url: null }],
        payload: { field: enrichment.field, currentValue: enrichment.currentValue, suggestedValue: enrichment.suggestedValue },
        reasoning: enrichment.reasoning,
        priority: 'Normal',
      });
    }

    for (const followUp of analysis.followUpMeetings) {
      items.push({
        type: 'meeting_scheduling',
        title: `Schedule follow-up: ${followUp.topic}`,
        accName: meeting.accountName ?? '',
        accId: meeting.accountId,
        agent: 'meeting_analyst',
        confidence: 0.7,
        confidenceBreakdown: { extraction: 0.7 },
        sources: [{ name: `Meeting: ${meeting.title}`, url: null }],
        payload: { topic: followUp.topic, suggestedDate: followUp.suggestedDate, attendees: followUp.attendees },
        reasoning: `Follow-up meeting suggested during "${meeting.title}".`,
        priority: 'Normal',
      });
    }

    return {
      items,
      metrics: { scanned: 1, matched: items.length, skipped: 0 },
      errors: [],
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agents/__tests__/meeting-analyst.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/meeting-analyst.ts src/lib/agents/__tests__/meeting-analyst.test.ts
git commit -m "feat(agents): implement meeting-analyst agent with tests"
```

---

### Task 7: Implement Weekly Digest Agent

**Files:**
- Create: `src/lib/agents/weekly-digest.ts`
- Test: `src/lib/agents/__tests__/weekly-digest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agents/__tests__/weekly-digest.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentContext } from '../types';

const mockOppFindMany = vi.fn();
const mockEmailFindMany = vi.fn();
const mockMeetingFindMany = vi.fn();
const mockTaskFindMany = vi.fn();
const mockQueueFindMany = vi.fn();
const mockContactFindMany = vi.fn();
const mockDigestCreate = vi.fn();
const mockParse = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    opportunity: { findMany: mockOppFindMany, aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 500000 } }) },
    inboxEmail: { findMany: mockEmailFindMany },
    meeting: { findMany: mockMeetingFindMany },
    task: { findMany: mockTaskFindMany },
    queueItem: { findMany: mockQueueFindMany },
    contact: { findMany: mockContactFindMany },
    weeklyDigest: { create: mockDigestCreate },
  },
}));

vi.mock('../ai', () => ({
  getAnthropicClient: () => ({
    messages: { parse: mockParse },
  }),
  MODEL_SONNET: 'claude-sonnet-4-6',
}));

describe('Weekly Digest Agent', () => {
  const ctx: AgentContext = {
    config: {
      id: 'cfg-2', name: 'weekly_digest', displayName: 'Weekly Digest',
      description: 'Weekly CRM summary', status: 'active', parameters: {},
      createdAt: new Date(), updatedAt: new Date(),
    },
    userId: 'system',
  };

  beforeEach(() => vi.clearAllMocks());

  it('has correct name and cron trigger', async () => {
    const { weeklyDigestAgent } = await import('../weekly-digest');
    expect(weeklyDigestAgent.name).toBe('weekly_digest');
    expect(weeklyDigestAgent.triggers).toContainEqual(expect.objectContaining({ type: 'cron' }));
  });

  it('returns empty items array (writes digest directly)', async () => {
    mockOppFindMany.mockResolvedValue([]);
    mockEmailFindMany.mockResolvedValue([]);
    mockMeetingFindMany.mockResolvedValue([]);
    mockTaskFindMany.mockResolvedValue([]);
    mockQueueFindMany.mockResolvedValue([]);
    mockContactFindMany.mockResolvedValue([]);
    mockDigestCreate.mockResolvedValue({ id: 'digest-1' });
    mockParse.mockResolvedValue({
      parsed_output: {
        pipelineSummary: 'Quiet week.',
        accountParagraphs: [],
        weekAheadSummary: 'No meetings scheduled.',
      },
    });

    const { weeklyDigestAgent } = await import('../weekly-digest');
    const result = await weeklyDigestAgent.analyze(ctx);

    expect(result.items).toHaveLength(0); // Digest writes directly, no queue items
    expect(mockDigestCreate).toHaveBeenCalled();
  });

  it('skips when paused', async () => {
    const pausedCtx = { ...ctx, config: { ...ctx.config, status: 'paused' as const } };
    const { weeklyDigestAgent } = await import('../weekly-digest');
    const result = await weeklyDigestAgent.analyze(pausedCtx);
    expect(result.items).toHaveLength(0);
    expect(mockDigestCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/__tests__/weekly-digest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement weekly-digest agent**

Create `src/lib/agents/weekly-digest.ts`:

```typescript
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_SONNET } from './ai';
import { DigestNarrativeSchema } from './schemas';
import { db } from '@/lib/db';
import type { Agent, AgentContext, AgentResult } from './types';

export const weeklyDigestAgent: Agent = {
  name: 'weekly_digest',
  triggers: [{ type: 'cron', schedule: '0 18 * * 0' }], // Sunday 6 PM

  async analyze(ctx: AgentContext): Promise<AgentResult> {
    if (ctx.config.status !== 'active') {
      return { items: [], metrics: { scanned: 0, matched: 0, skipped: 1 }, errors: [] };
    }

    const now = new Date();
    const weekEnd = now;
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const dateFilter = { gte: weekStart, lte: weekEnd };

    // Gather data (all deterministic queries)
    const [opps, emails, meetings, tasks, queueItems, contacts] = await Promise.all([
      db.opportunity.findMany({ where: { updatedAt: dateFilter } }),
      db.inboxEmail.findMany({ where: { receivedAt: dateFilter } }),
      db.meeting.findMany({ where: { date: dateFilter } }),
      db.task.findMany({ where: { updatedAt: dateFilter } }),
      db.queueItem.findMany({ where: { updatedAt: dateFilter } }),
      db.contact.findMany({ where: { createdAt: dateFilter } }),
    ]);

    // Get upcoming meetings for "Week Ahead"
    const nextWeekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingMeetings = await db.meeting.findMany({
      where: { date: { gt: weekEnd, lte: nextWeekEnd } },
      orderBy: { date: 'asc' },
    });
    const tasksDue = await db.task.findMany({
      where: { dueDate: { gt: weekEnd, lte: nextWeekEnd }, status: { not: 'Done' } },
    });
    const overdueTasks = await db.task.findMany({
      where: { dueDate: { lt: now }, status: { not: 'Done' } },
    });

    // Pipeline value
    const pipeline = await db.opportunity.aggregate({
      where: { stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
      _sum: { amount: true },
    });

    // Build data summary for LLM
    const dataSummary = {
      pipelineTotal: pipeline._sum.amount ?? 0,
      oppChanges: opps.map(o => ({ name: o.name, stage: o.stage, accountName: o.accountName, amount: o.amount })),
      emailCount: emails.length,
      emailsByAccount: groupBy(emails, 'accountName'),
      meetingsHeld: meetings.map(m => ({ title: m.title, accountName: m.accountName, sentiment: (m as any).sentimentTag })),
      tasksCompleted: tasks.filter(t => t.status === 'Done').length,
      tasksCreated: tasks.filter(t => t.createdAt >= weekStart).length,
      queueApproved: queueItems.filter(q => q.status === 'approved').length,
      queueRejected: queueItems.filter(q => q.status === 'rejected').length,
      newContacts: contacts.length,
      upcomingMeetings: upcomingMeetings.map(m => ({ title: m.title, date: m.date, accountName: m.accountName })),
    };

    // LLM synthesizes narrative
    const client = getAnthropicClient();
    const response = await client.messages.parse({
      model: MODEL_SONNET,
      max_tokens: 2048,
      system: 'You are a CRM analyst writing a weekly digest for a small sales team in the GoO/renewable energy market. Write concise, narrative paragraphs — not bullet points. Be specific about what happened.',
      messages: [{
        role: 'user',
        content: `Summarize this week's CRM activity:\n\n${JSON.stringify(dataSummary, null, 2)}`,
      }],
      ...zodOutputFormat(DigestNarrativeSchema, 'digest_narrative'),
    });

    const narrative = response.parsed_output;
    if (!narrative) {
      return { items: [], metrics: { scanned: 1, matched: 0, skipped: 0 }, errors: [{ message: 'Failed to generate digest narrative', recoverable: true }] };
    }

    // Build structured digest data
    const pipelineSnapshot = {
      totalValue: pipeline._sum.amount ?? 0,
      valueDelta: 0, // TODO: compare with last week's digest
      valueDeltaPct: 0,
      stageChanges: opps.filter(o => o.updatedAt >= weekStart).map(o => ({ name: o.name, from: '', to: o.stage })),
      closedWon: opps.filter(o => o.stage === 'ClosedWon').map(o => ({ name: o.name, amount: o.amount ?? 0, context: '' })),
      closedLost: opps.filter(o => o.stage === 'ClosedLost').map(o => ({ name: o.name, amount: o.amount ?? 0, context: o.lossReason ?? '' })),
      newOpps: opps.filter(o => o.createdAt >= weekStart).map(o => ({ name: o.name, accountName: o.accountName ?? '', amount: o.amount ?? 0 })),
      atRisk: [],
    };

    const accountHighlights = narrative.accountParagraphs.map(p => ({
      ...p,
      activityCount: (dataSummary.emailsByAccount[p.accountName]?.length ?? 0) +
        meetings.filter(m => m.accountName === p.accountName).length,
    }));

    const weekAhead = {
      meetings: upcomingMeetings.map(m => ({
        id: m.id, title: m.title, date: m.date.toISOString(),
        accountName: m.accountName ?? undefined, prepStatus: m.prepStatus,
      })),
      tasksDue: tasksDue.map(t => ({
        id: t.id, title: t.title, dueDate: t.dueDate!.toISOString(),
        accountName: t.accountName ?? undefined,
      })),
      overdue: overdueTasks.map(t => ({
        id: t.id, title: t.title, dueDate: t.dueDate!.toISOString(),
        accountName: t.accountName ?? undefined,
      })),
    };

    // Render HTML
    const renderedHtml = renderDigestHtml(narrative, pipelineSnapshot, weekAhead);

    // Write directly to DB (not queued)
    await db.weeklyDigest.create({
      data: {
        weekStart,
        weekEnd,
        pipelineSnapshot,
        accountHighlights,
        weekAhead,
        renderedHtml,
        tenantId: (await db.tenant.findFirst())?.id ?? 'default', // Single-tenant for now; iterate tenants when multi-tenant
      },
    });

    return {
      items: [], // Digest is informational — no queue items
      metrics: { scanned: 1, matched: 1, skipped: 0 },
      errors: [],
    };
  },
};

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key] ?? 'unknown');
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function renderDigestHtml(
  narrative: { pipelineSummary: string; accountParagraphs: { accountName: string; narrative: string }[]; weekAheadSummary: string },
  pipeline: any,
  weekAhead: any,
): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 20px; margin-bottom: 16px;">Weekly Digest</h1>
      <h2 style="font-size: 16px; color: #666;">Pipeline</h2>
      <p>${narrative.pipelineSummary}</p>
      ${narrative.accountParagraphs.map(a => `
        <h3 style="font-size: 14px; margin-top: 16px;">${a.accountName}</h3>
        <p>${a.narrative}</p>
      `).join('')}
      <h2 style="font-size: 16px; color: #666; margin-top: 24px;">Week Ahead</h2>
      <p>${narrative.weekAheadSummary}</p>
    </div>
  `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agents/__tests__/weekly-digest.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/weekly-digest.ts src/lib/agents/__tests__/weekly-digest.test.ts
git commit -m "feat(agents): implement weekly-digest agent with tests"
```

---

### Task 8: Register New Agents

**Files:**
- Modify: `src/lib/agents/index.ts`

- [ ] **Step 1: Import and register both agents**

Add to `src/lib/agents/index.ts`:

```typescript
import { meetingAnalystAgent } from './meeting-analyst';
import { weeklyDigestAgent } from './weekly-digest';
```

Add to the agents array:

```typescript
const agents = [
  // ... existing agents
  meetingAnalystAgent,
  weeklyDigestAgent,
];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agents/index.ts
git commit -m "feat(agents): register meeting-analyst and weekly-digest agents"
```

---

## Chunk 3: API Routes

### Task 9: Threaded Inbox API

**Files:**
- Create: `src/app/api/inbox/threads/route.ts`
- Modify: `src/app/api/inbox/route.ts`

- [ ] **Step 1: Create threads endpoint**

Create `src/app/api/inbox/threads/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { adaptEmail } from '@/lib/adapters';
import type { EmailThread } from '@/lib/types';

export const GET = withHandler(null, async (req, ctx) => {
  const url = req.nextUrl;
  const filter = url.searchParams.get('filter');
  const accountId = url.searchParams.get('accountId');

  const where: any = {
    isArchived: false,
    OR: [
      { snoozedUntil: null },
      { snoozedUntil: { lt: new Date() } },
    ],
  };

  if (filter === 'unread') where.isUnread = true;
  if (filter === 'unlinked') where.isLinked = false;
  if (filter === 'buying_signal') {
    // Derived filter: emails where classifier detected buying signals in payload
    where.classificationConf = { gte: 0.7 };
    // Look for emails with buying signal data in their classification metadata
    // The inbox classifier stores buying signals as part of the classification
    where.classification = { in: ['positive_reply', 'question', 'meeting_request'] };
  }
  if (accountId) where.accountId = accountId;
  if (filter && !['unread', 'unlinked', 'buying_signal'].includes(filter)) {
    where.classification = filter;
  }

  const emails = await ctx.db.inboxEmail.findMany({
    where,
    orderBy: { receivedAt: 'desc' },
  });

  // Group by threadId
  const threadMap = new Map<string, typeof emails>();
  for (const email of emails) {
    const tid = email.threadId ?? email.id;
    const group = threadMap.get(tid) ?? [];
    group.push(email);
    threadMap.set(tid, group);
  }

  const threads: EmailThread[] = Array.from(threadMap.entries()).map(([threadId, threadEmails]) => {
    const sorted = threadEmails.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    const latest = sorted[sorted.length - 1];
    return {
      threadId,
      emails: sorted.map(adaptEmail),
      latestEmail: adaptEmail(latest),
      accountName: latest.accountName ?? undefined,
      accountId: latest.accountId ?? undefined,
      isUnread: threadEmails.some(e => e.isUnread),
      classification: latest.classification ?? undefined,
      snoozedUntil: latest.snoozedUntil?.toISOString() ?? undefined,
    };
  });

  threads.sort((a, b) => new Date(b.latestEmail.receivedAt).getTime() - new Date(a.latestEmail.receivedAt).getTime());

  return NextResponse.json({ data: threads, meta: { totalCount: threads.length } });
});
```

- [ ] **Step 2: Add snooze action to existing inbox route**

In `src/app/api/inbox/route.ts`, add a new action case in the POST handler:

```typescript
case 'snooze': {
  const snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
  const updated = await db.inboxEmail.update({
    where: { id: body.id },
    data: { snoozedUntil },
  });
  return Response.json({ data: adaptEmail(updated) });
}
```

- [ ] **Step 3: Update inbox action schema for snooze**

In `src/lib/schemas/inbox.ts`, extend the action enum to include `'snooze'` and add `snoozedUntil` as a conditional field:

```typescript
export const inboxActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), id: z.string() }),
  z.object({ action: z.literal('archive'), id: z.string() }),
  z.object({ action: z.literal('create_task'), id: z.string() }),
  z.object({ action: z.literal('create_account'), id: z.string() }),
  z.object({ action: z.literal('snooze'), id: z.string(), snoozedUntil: z.string().datetime() }),
]);
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inbox/threads/route.ts src/app/api/inbox/route.ts
git commit -m "feat(api): add threaded inbox endpoint and snooze action"
```

---

### Task 10: Meeting Outcome & Prep API

**Files:**
- Create: `src/app/api/meetings/[id]/outcome/route.ts`
- Create: `src/app/api/meetings/[id]/prep/route.ts`

- [ ] **Step 1: Create meeting outcome endpoint**

Create `src/app/api/meetings/[id]/outcome/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { emitEvent } from '@/lib/agents/events';
import { runAgent } from '@/lib/agents/runner';
import { getAgent } from '@/lib/agents/registry';
import { z } from 'zod';

const outcomeSchema = z.object({
  rawNotes: z.string().min(1).max(10000),
});

export const POST = withHandler(outcomeSchema, async (req, ctx) => {
  const id = req.nextUrl.pathname.split('/').at(-2)!; // Extract [id] from URL

  const meeting = await ctx.db.meeting.findUnique({ where: { id } });
  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  // Run meeting-analyst agent synchronously for near-instant response
  // (user is waiting for results in the UI)
  const agent = getAgent('meeting_analyst');
  if (agent) {
    await runAgent(agent, 'event', {
      id: crypto.randomUUID(),
      event: 'meeting_outcome_pasted',
      payload: { meetingId: id, rawNotes: ctx.body.rawNotes },
    });
  }

  // Refetch the updated meeting with outcome summary
  const updated = await ctx.db.meeting.findUnique({ where: { id } });

  return NextResponse.json({ data: { status: 'complete', meeting: updated } });
});
```

**Note:** The meeting-analyst agent is invoked synchronously here (via `runAgent` directly) rather than emitting an async event. This is because the user is actively waiting in the UI for results. The agent writes the summary to the Meeting record, so the response includes the updated meeting.

- [ ] **Step 2: Create meeting prep endpoint**

Create `src/app/api/meetings/[id]/prep/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { getAnthropicClient, MODEL_SONNET } from '@/lib/agents/ai';

export const GET = withHandler(null, async (req, ctx) => {
  const id = req.nextUrl.pathname.split('/').at(-2)!;

  const meeting = await ctx.db.meeting.findUnique({ where: { id } });
  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  // Gather context for prep
  const [account, lastMeeting, recentSignals, openTasks, opportunities] = await Promise.all([
    meeting.accountId ? ctx.db.account.findUnique({ where: { id: meeting.accountId } }) : null,
    meeting.accountId ? ctx.db.meeting.findFirst({
      where: { accountId: meeting.accountId, id: { not: id }, outcomeRecordedAt: { not: null } },
      orderBy: { date: 'desc' },
    }) : null,
    meeting.accountId ? ctx.db.signal.findMany({
      where: { accountId: meeting.accountId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      take: 5, orderBy: { createdAt: 'desc' },
    }) : [],
    meeting.accountId ? ctx.db.task.findMany({
      where: { accountId: meeting.accountId, status: { not: 'Done' } },
      take: 5,
    }) : [],
    meeting.accountId ? ctx.db.opportunity.findMany({
      where: { accountId: meeting.accountId, stage: { notIn: ['ClosedWon', 'ClosedLost'] } },
    }) : [],
  ]);

  const context = {
    meeting: { title: meeting.title, date: meeting.date, attendees: meeting.attendees },
    account: account ? { name: account.name, pain: (account as any).pain, whyNow: (account as any).whyNow } : null,
    lastMeeting: lastMeeting ? { title: lastMeeting.title, date: lastMeeting.date, outcome: (lastMeeting as any).outcomeSummary } : null,
    recentSignals: recentSignals.map(s => ({ title: s.title, summary: s.summary })),
    openTasks: openTasks.map(t => ({ title: t.title, dueDate: t.dueDate })),
    opportunities: opportunities.map(o => ({ name: o.name, stage: o.stage, amount: o.amount })),
  };

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: 'Generate concise meeting prep talking points. Be specific and actionable. Reference the last meeting outcome if available.',
    messages: [{ role: 'user', content: JSON.stringify(context) }],
  });

  const talkingPoints = response.content[0].type === 'text' ? response.content[0].text : '';

  return NextResponse.json({
    data: {
      talkingPoints,
      lastMeetingOutcome: lastMeeting ? {
        title: lastMeeting.title,
        date: lastMeeting.date.toISOString(),
        summary: (lastMeeting as any).outcomeSummary,
      } : null,
      account: account ? { name: account.name, pain: (account as any).pain } : null,
      attendees: meeting.attendees,
      openTasks: openTasks.map(t => ({ id: t.id, title: t.title })),
      opportunities: opportunities.map(o => ({ id: o.id, name: o.name, stage: o.stage })),
    },
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meetings/[id]/outcome/route.ts src/app/api/meetings/[id]/prep/route.ts
git commit -m "feat(api): add meeting outcome and prep endpoints"
```

---

### Task 11: Digest API & No-Show Endpoint

**Files:**
- Create: `src/app/api/digest/route.ts`
- Modify: `src/app/api/meetings/[id]/route.ts`

- [ ] **Step 1: Create digest endpoint**

Create `src/app/api/digest/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { adaptDigest } from '@/lib/adapters';

export const GET = withHandler(null, async (req, ctx) => {
  const digests = await ctx.db.weeklyDigest.findMany({
    orderBy: { weekStart: 'desc' },
    take: 12,
  });

  return NextResponse.json({
    data: digests.map(adaptDigest),
    meta: { totalCount: digests.length },
  });
});
```

- [ ] **Step 2: Add no-show action to meeting PATCH**

In `src/app/api/meetings/[id]/route.ts`, extend the PATCH schema to accept `noShow`:

Add `noShow: z.boolean().optional()` to the patch schema, and include it in the update data.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/digest/route.ts src/app/api/meetings/[id]/route.ts
git commit -m "feat(api): add digest endpoint and meeting no-show support"
```

---

### Task 12: React Query Hooks

**Files:**
- Modify: `src/lib/queries/inbox.ts`
- Modify: `src/lib/queries/meetings.ts`
- Create: `src/lib/queries/digest.ts`

- [ ] **Step 1: Add thread-based inbox hooks**

In `src/lib/queries/inbox.ts`, add:

```typescript
export const inboxKeys = {
  // ... existing keys
  threads: (filter?: string) => ['inbox', 'threads', filter] as const,
};

export function useInboxThreadsQuery(filter?: string) {
  return useQuery({
    queryKey: inboxKeys.threads(filter),
    queryFn: () => api.get('/api/inbox/threads', { params: filter ? { filter } : {} }),
  });
}

export function useSnoozeEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, snoozedUntil }: { id: string; snoozedUntil: string }) =>
      api.post('/api/inbox', { action: 'snooze', id, snoozedUntil }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}
```

- [ ] **Step 2: Add meeting prep and outcome hooks**

In `src/lib/queries/meetings.ts`, add:

```typescript
export function useMeetingPrep(meetingId: string) {
  return useQuery({
    queryKey: [...meetingKeys.detail(meetingId), 'prep'] as const,
    queryFn: () => api.get(`/api/meetings/${meetingId}/prep`),
    enabled: !!meetingId,
  });
}

export function useSubmitOutcome(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rawNotes: string) =>
      api.post(`/api/meetings/${meetingId}/outcome`, { rawNotes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) }),
  });
}

export function useMarkNoShow(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch(`/api/meetings/${meetingId}`, { noShow: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meetingKeys.all }),
  });
}
```

- [ ] **Step 3: Create digest hooks**

Create `src/lib/queries/digest.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const digestKeys = {
  all: ['digest'] as const,
  list: () => ['digest', 'list'] as const,
};

export function useDigestsQuery() {
  return useQuery({
    queryKey: digestKeys.list(),
    queryFn: () => api.get('/api/digest'),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/inbox.ts src/lib/queries/meetings.ts src/lib/queries/digest.ts
git commit -m "feat(queries): add hooks for threaded inbox, meeting prep/outcome, digest"
```

---

## Chunk 4: Inbox UI

### Task 13: Inbox Page — Three-Panel Layout

**Files:**
- Rewrite: `src/app/(dashboard)/inbox/page.tsx`
- Create: `src/components/inbox/ThreadList.tsx`
- Create: `src/components/inbox/ThreadView.tsx`
- Create: `src/components/inbox/InboxContext.tsx`
- Create: `src/components/inbox/InboxQuickActions.tsx`

- [ ] **Step 1: Create ThreadList component (left panel)**

Create `src/components/inbox/ThreadList.tsx`:

Three responsibilities:
- Filter bar at top (classification, account, unread, unlinked)
- Scrollable list of thread rows
- Each row: latest email preview, classification badge, account chip, unread dot, timestamp
- Active thread highlighted
- Keyboard: j/k navigation, Enter to select

Props: `{ threads, selectedThreadId, onSelectThread, filter, onFilterChange }`

- [ ] **Step 2: Create ThreadView component (center panel)**

Create `src/components/inbox/ThreadView.tsx`:

Responsibilities:
- Render all emails in thread chronologically
- Each email: from name, timestamp, sentiment dot, full body (HTML rendered via `dangerouslySetInnerHTML` with sanitization, or plain text fallback)
- Buying signal callouts (if classification has buying signals in payload)
- Empty state when no thread selected

Props: `{ thread: EmailThread | null }`

- [ ] **Step 3: Create InboxContext component (right panel)**

Create `src/components/inbox/InboxContext.tsx`:

Responsibilities:
- Account card (name, type, FIUAC scores) — fetched via account query if accountId present
- Contact card (matched contact by email)
- Related opportunities
- Recent activity (last 5)
- "No account linked" state with link action

Props: `{ accountId?: string, contactEmail?: string }`

- [ ] **Step 4: Create InboxQuickActions component**

Create `src/components/inbox/InboxQuickActions.tsx`:

Action buttons:
- Draft Reply (calls Outreach Drafter indirectly — creates a queue item request)
- Create Task (inline form, pre-filled)
- Link to Account (search dropdown)
- Snooze (date picker)
- Archive

Props: `{ email: Email, onAction: (action, payload?) => void }`

- [ ] **Step 5: Rewrite inbox page with three-panel layout**

Rewrite `src/app/(dashboard)/inbox/page.tsx`:

```tsx
'use client';

// Layout: flex container with three panels
// Left: ThreadList (w-80, border-r)
// Center: ThreadView (flex-1)
// Right: InboxContext (w-80, border-l)

// State: selectedThreadId, filter
// Data: useInboxThreadsQuery(filter)
// Keyboard handler: useEffect with j/k/Enter/Esc/r/t/e/s bindings
```

- [ ] **Step 6: Verify inbox page renders with mock data**

Start dev server and navigate to `/inbox`. Verify three-panel layout renders, filters work, thread selection works. Fix any issues.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/inbox/page.tsx src/components/inbox/
git commit -m "feat(inbox): three-panel threaded inbox with filters and quick actions"
```

---

## Chunk 5: Calendar/Meetings UI

### Task 14: Calendar View Component

**Files:**
- Rewrite: `src/app/(dashboard)/meetings/page.tsx`
- Create: `src/components/meetings/CalendarGrid.tsx`
- Create: `src/components/meetings/MeetingCard.tsx`

- [ ] **Step 1: Create CalendarGrid component**

Create `src/components/meetings/CalendarGrid.tsx`:

Responsibilities:
- Week view (default): 7 columns (Mon-Sun), rows for hours (8 AM - 8 PM)
- Month view: standard calendar grid
- Today highlighted, current time line indicator
- Meeting cards positioned by time slot
- Task due date markers (small dots)
- Toggle between week/month

Props: `{ meetings, tasks, view: 'week' | 'month', currentDate, onMeetingClick, onDateChange }`

Account color derivation:
```typescript
function accountColor(accountId: string): string {
  let hash = 0;
  for (const char of accountId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
}
```

- [ ] **Step 2: Create MeetingCard component**

Create `src/components/meetings/MeetingCard.tsx`:

Compact card for calendar grid:
- Title (truncated)
- Time range
- Account chip (colored)
- Prep status dot (green/amber/red)
- Attendee count

Props: `{ meeting, onClick }`

- [ ] **Step 3: Rewrite meetings page**

Rewrite `src/app/(dashboard)/meetings/page.tsx`:

```tsx
'use client';

// Header: view toggle (week/month), date navigation (prev/next), "Today" button
// Body: CalendarGrid
// State: view, currentDate, selectedMeetingId
// Data: useMeetingsQuery(currentDate, range based on view)
// Click handler: opens MeetingDrawer
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/meetings/page.tsx src/components/meetings/CalendarGrid.tsx src/components/meetings/MeetingCard.tsx
git commit -m "feat(meetings): calendar week/month view with meeting cards"
```

---

### Task 15: Meeting Drawer — Prep & Outcome Tabs

**Files:**
- Create: `src/components/meetings/MeetingDrawer.tsx`
- Create: `src/components/meetings/PrepTab.tsx`
- Create: `src/components/meetings/OutcomeTab.tsx`

- [ ] **Step 1: Create PrepTab component**

Create `src/components/meetings/PrepTab.tsx`:

Responsibilities:
- Fetch prep data via `useMeetingPrep(meetingId)`
- Show "Last meeting" card prominently at top (title, date, outcome summary)
- Auto-generated talking points (bulleted, editable)
- Attendee list with contact cards (role badge, warmth indicator)
- "Generate prep" button to refresh
- Loading skeleton while fetching

Props: `{ meetingId }`

- [ ] **Step 2: Create OutcomeTab component**

Create `src/components/meetings/OutcomeTab.tsx`:

Three-step flow managed by internal state:

**State 1 — Paste prompt:**
- Large textarea with shimmer border (CSS animation: `@keyframes shimmer`)
- Heading: "Paste your meeting notes and let AI do the rest"
- Subtext: "We'll create a structured summary, extract tasks, and update your accounts"
- On paste/submit: calls `useSubmitOutcome(meetingId)`, transitions to State 2

**State 2 — Processing:**
- Spinner with "Analyzing notes..."
- Poll meeting detail until `outcomeSummary` is populated (or use React Query refetch)

**State 3 — Review & Confirm:**
- Formatted summary card (editable textarea)
- Extracted tasks: list with toggles (on/off each), showing title + suggested owner + due date
- Follow-up meetings: list with toggles
- Enrichment suggestions: cards with approve/dismiss
- Contact intelligence: new contact suggestions
- Sentiment tag selector (positive/neutral/negative, pre-selected)
- "Confirm all" button → creates queue items for toggled-on items

Props: `{ meetingId, meeting }`

- [ ] **Step 3: Create MeetingDrawer wrapper**

Create `src/components/meetings/MeetingDrawer.tsx`:

- Slide-in drawer from right (fixed position, z-50, w-[480px])
- Header: meeting title, date, close button
- Tab bar: Prep | Outcome
- Renders PrepTab or OutcomeTab based on selected tab
- Close on Esc

Props: `{ meetingId, onClose }`

- [ ] **Step 4: Wire drawer into meetings page**

Update meetings page to render `<MeetingDrawer>` when a meeting is selected.

- [ ] **Step 5: Verify meeting drawer works**

Start dev server, navigate to `/meetings`, click a meeting. Verify:
- Drawer slides in
- Prep tab loads talking points
- Outcome tab shows paste prompt
- Tab switching works

- [ ] **Step 6: Commit**

```bash
git add src/components/meetings/MeetingDrawer.tsx src/components/meetings/PrepTab.tsx src/components/meetings/OutcomeTab.tsx src/app/\(dashboard\)/meetings/page.tsx
git commit -m "feat(meetings): meeting drawer with prep and AI-powered outcome tabs"
```

---

## Chunk 6: Digest Page & Navigation

### Task 16: Digest Page

**Files:**
- Create: `src/app/(dashboard)/digest/page.tsx`
- Create: `src/components/digest/DigestCard.tsx`

- [ ] **Step 1: Create DigestCard component**

Create `src/components/digest/DigestCard.tsx`:

Renders a single digest:
- Week range header (e.g., "Mar 9 - Mar 15, 2026")
- Pipeline snapshot section: value + delta, stage changes, closed deals
- Account highlights: narrative paragraphs per account
- Week ahead: upcoming meetings + tasks due

Two render modes:
- `expanded` (full content, used for current/selected digest)
- `compact` (date range + pipeline value only, used in archive list)

Props: `{ digest: WeeklyDigest, expanded?: boolean, onClick?: () => void }`

- [ ] **Step 2: Create digest page**

Create `src/app/(dashboard)/digest/page.tsx`:

```tsx
'use client';

// Layout:
// - Left: archive list (compact DigestCards, scrollable)
// - Right: selected digest (expanded DigestCard)
// Data: useDigestsQuery()
// State: selectedDigestId (defaults to most recent)
// Empty state: "No digests yet. Your first digest will be generated Sunday evening."
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/digest/page.tsx src/components/digest/DigestCard.tsx
git commit -m "feat(digest): weekly digest archive page"
```

---

### Task 17: Update Sidebar Navigation

**Files:**
- Modify: `src/components/shell/Sidebar.tsx`

- [ ] **Step 1: Add Digest nav item**

Find the navigation items array in `Sidebar.tsx` and add a "Digest" entry in the Workflow section:

```typescript
{ label: 'Digest', href: '/digest', icon: FileText }  // or Newspaper icon from lucide
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shell/Sidebar.tsx
git commit -m "feat(nav): add Digest to sidebar navigation"
```

---

## Chunk 7: Missing Spec Features — Nudge, No-Show, Email Delivery, Contact Intelligence

### Task 18: Add Contact Intelligence Queue Items to Meeting Analyst

**Files:**
- Modify: `src/lib/agents/meeting-analyst.ts`

- [ ] **Step 1: Add contact intelligence processing after enrichment loop**

In the meeting-analyst agent, after the `followUpMeetings` loop, add processing for `contactIntelligence`:

```typescript
for (const contact of analysis.contactIntelligence) {
  if (contact.isNew) {
    items.push({
      type: 'enrichment',
      title: `New contact: ${contact.name}${contact.role ? ` (${contact.role})` : ''}`,
      accName: meeting.accountName ?? '',
      accId: meeting.accountId,
      agent: 'meeting_analyst',
      confidence: 0.6,
      confidenceBreakdown: { extraction: 0.6 },
      sources: [{ name: `Meeting: ${meeting.title}`, url: null }],
      payload: { type: 'new_contact', name: contact.name, role: contact.role, sentiment: contact.sentiment },
      reasoning: `New contact "${contact.name}" mentioned during meeting "${meeting.title}".`,
      priority: 'Normal',
    });
  }
  if (contact.sentiment && !contact.isNew) {
    items.push({
      type: 'enrichment',
      title: `Update warmth for ${contact.name}: ${contact.sentiment}`,
      accName: meeting.accountName ?? '',
      accId: meeting.accountId,
      agent: 'meeting_analyst',
      confidence: 0.65,
      confidenceBreakdown: { extraction: 0.65 },
      sources: [{ name: `Meeting: ${meeting.title}`, url: null }],
      payload: { type: 'warmth_update', contactName: contact.name, sentiment: contact.sentiment },
      reasoning: `Contact "${contact.name}" showed ${contact.sentiment} sentiment during meeting.`,
      priority: 'Low',
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agents/meeting-analyst.ts
git commit -m "feat(meeting-analyst): process contact intelligence into queue items"
```

---

### Task 19: Add Email Delivery to Weekly Digest Agent

**Files:**
- Modify: `src/lib/agents/weekly-digest.ts`

- [ ] **Step 1: Add email delivery after writing digest record**

After the `db.weeklyDigest.create()` call, send the digest email to all active users:

```typescript
// Send digest email to all active users
try {
  const users = await db.user.findMany({
    where: { role: { not: 'VIEWER' } },
    include: { integrationTokens: { where: { provider: 'microsoft' } } },
  });

  for (const user of users) {
    const token = user.integrationTokens[0];
    if (!token?.accessToken || !user.email) continue;

    try {
      await sendMail(token.accessToken, [user.email], `Weekly Digest — ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}`, renderedHtml);
    } catch (err) {
      // Log but don't fail the digest — email delivery is best-effort
      console.error(`Failed to send digest email to ${user.email}:`, err);
    }
  }
} catch (err) {
  console.error('Failed to query users for digest delivery:', err);
}
```

Import `sendMail` from `@/lib/integrations/microsoft-graph` at the top of the file.

- [ ] **Step 2: Commit**

```bash
git add src/lib/agents/weekly-digest.ts
git commit -m "feat(digest): send weekly digest email to active users"
```

---

### Task 20: Pre-Meeting Email Nudge Cron

**Files:**
- Create: `src/app/api/cron/meeting-nudge/route.ts`

- [ ] **Step 1: Create the nudge cron endpoint**

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAnthropicClient, MODEL_SONNET } from '@/lib/agents/ai';
import { sendMail } from '@/lib/integrations/microsoft-graph';

// Triggered daily at 6 PM by Vercel Cron
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStart = new Date(tomorrow.setHours(0, 0, 0, 0));
  const tomorrowEnd = new Date(tomorrow.setHours(23, 59, 59, 999));

  const meetings = await db.meeting.findMany({
    where: { date: { gte: tomorrowStart, lte: tomorrowEnd } },
  });

  let sent = 0;
  for (const meeting of meetings) {
    if (!meeting.accountId) continue;

    // Gather prep context
    const [account, lastMeeting] = await Promise.all([
      db.account.findUnique({ where: { id: meeting.accountId } }),
      db.meeting.findFirst({
        where: { accountId: meeting.accountId, id: { not: meeting.id }, outcomeRecordedAt: { not: null } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODEL_SONNET,
      max_tokens: 512,
      system: 'Write a brief email-friendly meeting prep summary. 3-5 bullet points. Be specific.',
      messages: [{
        role: 'user',
        content: JSON.stringify({
          meeting: { title: meeting.title, date: meeting.date, attendees: meeting.attendees },
          account: account ? { name: account.name, pain: (account as any).pain } : null,
          lastMeeting: lastMeeting ? { title: lastMeeting.title, outcome: (lastMeeting as any).outcomeSummary } : null,
        }),
      }],
    });

    const prepText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Find user with Graph token to send from
    const users = await db.user.findMany({
      include: { integrationTokens: { where: { provider: 'microsoft' } } },
      take: 1,
    });
    const token = users[0]?.integrationTokens[0]?.accessToken;
    const userEmail = users[0]?.email;

    if (token && userEmail) {
      try {
        await sendMail(token, [userEmail], `Prep: ${meeting.title} tomorrow`, `
          <div style="font-family: -apple-system, sans-serif; max-width: 500px;">
            <h3>${meeting.title}</h3>
            <p><strong>When:</strong> ${meeting.date.toLocaleDateString()}</p>
            <p><strong>With:</strong> ${meeting.attendees?.join(', ') || 'TBD'}</p>
            <hr/>
            ${prepText.replace(/\n/g, '<br/>')}
          </div>
        `);
        sent++;
      } catch { /* best effort */ }
    }
  }

  return NextResponse.json({ data: { meetingsFound: meetings.length, nudgesSent: sent } });
}
```

- [ ] **Step 2: Add to Vercel cron config**

In `vercel.json` (or create if not exists), add the cron schedule:

```json
{
  "crons": [
    { "path": "/api/cron/meeting-nudge", "schedule": "0 18 * * *" }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/meeting-nudge/route.ts
git commit -m "feat(cron): daily pre-meeting email nudge"
```

---

### Task 21: No-Show Detection Cron

**Files:**
- Create: `src/app/api/cron/no-show-check/route.ts`

- [ ] **Step 1: Create no-show check endpoint**

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Triggered daily at 9 AM by Vercel Cron — checks yesterday's meetings
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = new Date(yesterday.setHours(0, 0, 0, 0));
  const yesterdayEnd = new Date(yesterday.setHours(23, 59, 59, 999));

  // Find meetings from yesterday with no outcome recorded and not already marked no-show
  const unrecorded = await db.meeting.findMany({
    where: {
      date: { gte: yesterdayStart, lte: yesterdayEnd },
      outcomeRecordedAt: null,
      noShow: false,
    },
  });

  // Create notifications for each unrecorded meeting
  for (const meeting of unrecorded) {
    await db.notification.create({
      data: {
        type: 'MEETING_NO_OUTCOME',
        title: `Meeting "${meeting.title}" has no outcome — did it happen?`,
        body: JSON.stringify({
          meetingId: meeting.id,
          actions: ['record_outcome', 'mark_no_show', 'reschedule'],
        }),
        userId: 'system', // Will be routed to meeting owner
      },
    });
  }

  return NextResponse.json({ data: { checked: unrecorded.length } });
}
```

- [ ] **Step 2: Add to cron config**

Add to `vercel.json` crons:

```json
{ "path": "/api/cron/no-show-check", "schedule": "0 9 * * *" }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/no-show-check/route.ts
git commit -m "feat(cron): daily no-show detection for unrecorded meeting outcomes"
```

---

### Task 22: Final Integration Test & Verification

- [ ] **Step 1: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass. Fix any regressions.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Manual smoke test**

Start dev server and verify:
1. `/inbox` — three-panel layout, thread grouping, filters, keyboard nav
2. `/meetings` — calendar view, meeting cards, drawer with prep + outcome tabs
3. `/digest` — archive page, empty state or digest content
4. Sidebar shows new Digest link

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve integration issues from inbox/calendar/digest redesign"
```
