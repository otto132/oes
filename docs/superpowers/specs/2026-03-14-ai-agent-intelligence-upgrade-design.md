# AI Agent Intelligence Upgrade — Design Spec

## Overview

Upgrade Eco-Insight's 6-agent system from mostly heuristic/keyword-based to Claude-powered intelligence with cross-agent context sharing, personal profiling, and learning loops. The goal: fewer low-quality queue items, more actionable recommendations, and a system that gets smarter over time.

## Principles

- **Structured outputs everywhere** — Zod schemas for all Claude responses, no regex JSON parsing
- **Right model for the job** — Sonnet 4.6 for creative/synthesis tasks, Haiku 4.5 for high-volume classification
- **Graceful degradation** — If Claude is unavailable, agents report errors (no silent fallback to heuristics)
- **Human-in-the-loop** — All AI-generated insights go through the approval queue before affecting data
- **Context flows downstream** — Upstream agent insights are passed to downstream agents via chain triggers

---

## Shared Infrastructure

### Shared Anthropic Client (`src/lib/agents/ai.ts`)

Singleton client module used by all agents:

```typescript
import Anthropic from '@anthropic-ai/sdk';

export const MODEL_SONNET = 'claude-sonnet-4-6';
export const MODEL_HAIKU = 'claude-haiku-4-5';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}
```

### Structured Output Schemas (`src/lib/agents/schemas.ts`)

Zod schemas for every Claude response type. Each agent imports its schema and uses `messages.parse()` with `zodOutputFormat()`. No manual JSON extraction anywhere.

### Prompt Caching

All agents use `cache_control: { type: "ephemeral" }` on their system prompts. System prompts are stable across calls within a run (same agent, different leads/signals), so caching saves ~90% on repeated system prompt tokens.

### Context Bundle — Plumbing Through the Chain System

When agents chain-trigger downstream agents, context flows via the existing `QueueItem.payload` JSON column. The chain system (`handleApproval` in `chain.ts`) already passes the approved item's payload into `AgentEventData.payload`. We extend this by including a `contextBundle` key in queue item payloads.

**How it flows:**

1. Agent A creates a `QueueItem` with `payload: { ...agentSpecificData, contextBundle: { signals: [...] } }`
2. User approves the queue item
3. `handleApproval()` emits event with the full payload (including `contextBundle`)
4. `runAgent()` passes the event to Agent B via `ctx.triggerEvent.payload`
5. Agent B reads `ctx.triggerEvent?.payload?.contextBundle`, appends its own section, and includes the updated bundle in its own queue items

**Type changes required:**

```typescript
// In types.ts — add ContextBundle type
interface ContextBundle {
  signals?: { title: string; relevance: string; source: string }[];
  qualification?: { scores: Record<string, number>; reasoning: string; gaps: string[] };
  enrichment?: { pain: string; whyNow: string; approachBrief: string; personalProfile: PersonalProfile };
  emailSentiment?: { trend: string; lastClassification: string };
  competitorActivity?: { competitor: string; activity: string }[];
}

// No changes needed to AgentContext, AgentEventData, runner.ts, or chain.ts
// The bundle travels inside the existing payload JSON — no schema changes required
```

**Key design choice:** The bundle is stored *inside* the queue item's existing `payload` JSON column. No new database columns or types needed. Downstream agents extract it from `ctx.triggerEvent?.payload?.contextBundle`. For cron-triggered runs (no upstream trigger), `contextBundle` is undefined and agents operate with only their own gathered context.

---

## Agent Designs

### 1. Signal Hunter (Sonnet 4.6)

**Trigger:** Cron every 4 hours
**Current:** RSS fetch + keyword matching against account names
**Change:** Add Claude relevance scoring per batch of matched signals

#### Flow

1. Fetch RSS feeds (unchanged)
2. Dedup against existing signal URLs (unchanged)
3. Match against accounts via text includes (unchanged — pre-filter)
4. **NEW: Batch Claude scoring per RSS source**
   - Send all matched signals from one source in a single prompt
   - Claude receives each signal + matched account context (pain, whyNow, open opportunities, recent activity)
   - Claude returns relevance score (0-100), reasoning, and signal category

#### Claude Prompt Context

For each signal in the batch, Claude receives:
- Signal: headline, snippet, source
- Matched account: name, pain, whyNow, current opportunities (stage + health), last activity date

#### Claude Output Schema (Zod)

```typescript
const SignalScoreSchema = z.object({
  scores: z.array(z.object({
    signalIndex: z.number(),
    relevance: z.number().min(0).max(100),
    reasoning: z.string(),
    category: z.enum(['ppa_announcement', 'renewable_target', 'market_entry',
                       'job_posting', 'conference', 'registry_pain']),
    // Note: matches existing Prisma SignalType enum — no migration needed
    // Competitor signals use the same enum values but are flagged via isCompetitorSignal
    actionability: z.string(),  // What should the sales team do with this
    accountImpact: z.string(),  // How this specifically affects the matched account
    isCompetitorSignal: z.boolean(),  // Whether this involves competitor activity
    competitorName: z.string().nullable(),  // Which competitor, if applicable
    defensiveAction: z.string().nullable(),  // What to do if competitor is involved
  })),
});
```

#### Competitor Intelligence (new capability)

The Signal Hunter also watches for competitor mentions in signals. When a competitor is mentioned alongside a prospect or in the same market segment, it creates a `signal_review` queue item with:
- Which competitor, what they're doing
- Which of our accounts/deals this affects
- Suggested defensive action

Competitor names are configured in agent parameters (list of known competitors).

### 2. Lead Qualifier (Haiku 4.5)

**Trigger:** Cron every 4 hours + chain after signal_review approval
**Current:** Averages pre-existing FIUAC scores, outputs qualify/disqualify/review
**Change:** Claude evaluates leads in context, infers missing scores, identifies gaps

#### Flow

1. Fetch leads in New/Researching stage (unchanged)
2. Gather context per lead: existing FIUAC scores, related signals, email history, account data
3. **NEW: Claude evaluation**
   - Per lead, Claude receives all available context
   - Infers scores for missing FIUAC dimensions based on available evidence
   - Provides contextual reasoning and identifies what information is missing

#### Claude Output Schema

```typescript
const LeadQualificationSchema = z.object({
  recommendation: z.enum(['qualify', 'disqualify', 'review']),
  scores: z.object({
    fit: z.number().min(0).max(100),
    intent: z.number().min(0).max(100),
    urgency: z.number().min(0).max(100),
    access: z.number().min(0).max(100),
    commercial: z.number().min(0).max(100),
  }),
  reasoning: z.string(),
  gaps: z.array(z.string()),  // What info is missing to qualify confidently
  suggestedNextStep: z.string(),  // Specific action to fill gaps or advance
  inferredFrom: z.record(z.string()),  // Which evidence supported each score
});
```

#### Key Improvement

Instead of "FIUAC avg: 42. Between thresholds." the output becomes: "Recommending review. Fit is strong (Nordic PPA buyer, 80/100), but intent unclear — no direct engagement signals found. Urgency inferred at 60 from expiring supplier contract mentioned in signal from Feb 12. Gap: no identified contact with decision-making authority. Next step: enrich contacts via LinkedIn to find Head of Energy Procurement."

### 3. Inbox Classifier (Haiku 4.5)

**Trigger:** Event: emails_synced
**Current:** Keyword matching for urgency, routes unlinked emails to enrichment
**Change:** Claude classifies intent, detects buying signals, tracks sentiment over time

#### Flow

1. Fetch recent unprocessed emails (unchanged)
2. **NEW: Claude batch classification**
   - Batch emails by account (all emails from same account in one prompt)
   - Claude classifies intent, extracts action items, detects buying signals

#### Claude Output Schema

```typescript
const EmailClassificationSchema = z.object({
  classifications: z.array(z.object({
    emailIndex: z.number(),
    intent: z.enum(['positive_reply', 'question', 'objection',
                     'meeting_request', 'bounce', 'unsubscribe',
                     'new_domain', 'auto_reply', 'internal', 'spam']),
    // Note: matches existing Prisma EmailClassification enum — no migration needed
    // Buying signals and competitor mentions are captured in separate fields below
    sentiment: z.enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative']),
    urgency: z.enum(['immediate', 'high', 'normal', 'low']),
    buyingSignals: z.array(z.string()),  // Extracted buying indicators (separate from intent enum)
    competitorMentions: z.array(z.string()),  // Any competitors referenced
    suggestedResponse: z.string(),  // What to say back and why
    suggestedPriority: z.enum(['High', 'Normal']),
    accountLinkSuggestion: z.string().nullable(),  // If unlinked, suggest which account
  })),
});
```

#### Sentiment Tracking Over Time

After classification, the agent stores the sentiment per account. On subsequent runs, Claude receives the sentiment history and can detect trajectory shifts:

- "Acme Corp: sentiment trending negative over last 3 emails (enthusiastic -> neutral -> skeptical). Flagging before it becomes an objection."
- "NordPool: sentiment shifted from evaluating to ready-to-move. Prioritize this account."

Sentiment trajectory is persisted in the `Account.sentimentTrajectory` JSON field (see Database Changes). The Inbox Classifier writes to this field after each run. Downstream agents and future classifier runs read from it. When a significant shift is detected (2+ steps in either direction), a separate queue item is created to alert the team.

### 4. Account Enricher (Sonnet 4.6)

**Trigger:** Cron weekly (Monday 6am) + chain after lead_qualification or signal_review approval + manual (LinkedIn paste)
**Current:** Flags stale pain/whyNow fields, suggests "review signals"
**Change:** Multi-stage intelligence agent with LinkedIn parsing, web research, email discovery, personal profiling, and approach strategy

**Execution model:** All stages run within a single `analyze()` call as sequential sub-functions. The web search stage (2b) uses Claude's server-side web search tool, which may require multiple API turns (Claude searches, reads results, searches again). To handle this within the 10-minute runner timeout:
- Each stage has a 2-minute internal timeout
- If a stage times out, the enricher returns partial results (e.g., LinkedIn extraction succeeded but web search timed out) with `confidence` scores reflecting incomplete data
- The queue item indicates which stages completed so the user knows what to trust

#### Stage 1: Extract & Structure (LinkedIn paste trigger)

When a user pastes LinkedIn profile text or URL content into a contact/account page:

- Parse and extract: name, title, company, location, headline, bio
- Identify specializations, industry focus, years of experience
- Detect team connections (see Stage 2b)

#### Stage 2a: Email Pattern Guessing

Claude analyzes the contact name and company domain to generate likely email addresses:

- Common patterns: first.last@, f.last@, first@, firstlast@
- Ranked by probability based on company size/region conventions
- **Domain mail server verification only:** We check DNS MX records to confirm the domain accepts email (e.g., `example.com` has mail servers). This does NOT verify that a specific mailbox exists — individual email validation would require SMTP probing (unreliable) or a third-party verification API. The `emailConfidence` score reflects this: domain-verified guesses get 0.4-0.6 confidence, not higher.
- Users should verify the guessed email before sending outreach

#### Stage 2b: Personal Profile Research

Claude synthesizes a rapport profile from two sources:

**Source 1 — Internal data (always available):**
- Existing signals mentioning this person or their company
- Email history and communication patterns
- Account notes, activities, meeting records

**Source 2 — Web search (requires integration):**
Uses the Claude API's server-side `web_search` tool (`web_search_20260209`). When the enricher runs, it includes the web search tool in the `tools` array, and Claude autonomously searches for the person's public presence. This is a server-side tool — no external API key or third-party search service needed.

**What Claude searches for:**
- Conference talks, panel appearances, published articles
- Social media topics they engage with
- Podcast appearances, blog posts, interviews
- Industry awards, board memberships, volunteer work
- University/education background

**Output — PersonalProfile:**

```typescript
const PersonalProfileSchema = z.object({
  interests: z.array(z.string()),  // Professional and personal interests
  values: z.array(z.string()),  // What they care about — sustainability, innovation, etc.
  communicationStyle: z.string(),
  rapportHooks: z.array(z.string()),  // Icebreakers, personal details, shared interests
  networkConnections: z.array(z.object({
    type: z.enum(['direct_connection', 'shared_contact', 'shared_affiliation']),
    teamMember: z.string().nullable(),
    throughContact: z.string().nullable(),
    affiliation: z.string().nullable(),
    strength: z.string(),
    suggestedAction: z.string(),
  })),
});
```

**Mutual Connection Detection:**

Team members register their LinkedIn profile/connections in Settings. When enriching a contact, Claude checks for:
- Direct 1st-degree connections with team members
- Shared contacts (people in our contacts DB who know the target)
- Shared affiliations (university alumni, industry associations, conference speakers, boards)

Connection paths are ranked: **warm intro > shared affiliation > cold outreach**.

#### Stage 3: Account Intelligence Synthesis

Claude synthesizes all available data (signals, emails, LinkedIn, web research) into:

- `pain` — concrete, evidence-based pain statement
- `whyNow` — timing triggers with sources
- Key stakeholders and their likely buying roles

#### Stage 4: Approach Brief

Claude generates a tailored approach strategy:

```typescript
const ApproachBriefSchema = z.object({
  recommendedChannel: z.enum(['warm_intro', 'linkedin_dm', 'cold_email', 'phone', 'event']),
  toneGuidance: z.string(),
  opener: z.string(),
  talkingPoints: z.array(z.string()),
  icebreakers: z.array(z.string()),
  topicsToAvoid: z.array(z.string()),
  timingRationale: z.string(),
  connectionPath: z.string().nullable(),  // If warm intro, who to ask
});
```

#### Full Output Schema

```typescript
const EnrichmentResultSchema = z.object({
  contactData: z.object({
    name: z.string(),
    title: z.string(),
    emailGuess: z.string().nullable(),
    emailConfidence: z.number(),
    location: z.string().nullable(),
    headline: z.string().nullable(),
  }),
  personalProfile: PersonalProfileSchema,
  accountInsights: z.object({
    pain: z.string(),
    whyNow: z.string(),
    stakeholders: z.array(z.object({
      role: z.string(),
      identified: z.boolean(),
      name: z.string().nullable(),
    })),
  }),
  approachBrief: ApproachBriefSchema,
  confidence: z.object({
    extraction: z.number(),
    emailGuess: z.number(),
    personalProfile: z.number(),
    accountInsights: z.number(),
  }),
});
```

### 5. Pipeline Hygiene (Heuristic + Haiku 4.5 recovery playbooks)

**Trigger:** Cron daily 8am
**Current:** Flags stale deals, low health, overdue close dates with generic suggestions
**Change:** Keep heuristic detection, add Claude-generated recovery playbooks

#### Flow

1. Detect issues via existing rules (staleness, health threshold, overdue close) — unchanged
2. **NEW: For each flagged deal, Claude generates a specific recovery plan**

Claude receives the full deal context:
- Stage, health dimensions, days since activity
- Last 5 activities/emails (what was said)
- Account pain, whyNow, contacts involved
- Any competitor signals
- Upstream context bundle (if available)

#### Claude Output Schema

```typescript
const RecoveryPlaybookSchema = z.object({
  diagnosis: z.string(),  // Why this deal is at risk
  recoverySteps: z.array(z.object({
    action: z.string(),
    rationale: z.string(),
    owner: z.string().nullable(),  // Suggest who should do it
    deadline: z.string(),  // Relative: "within 48h", "this week"
  })),
  riskLevel: z.enum(['recoverable', 'at_risk', 'likely_lost']),
  competitorThreat: z.string().nullable(),
});
```

#### Contact Mapping (new capability)

For deals with low stakeholder health, Claude analyzes the contacts involved and identifies gaps:
- "Only have contact with technical evaluator. No economic buyer identified."
- "Champion went quiet 2 weeks ago. Check LinkedIn for job changes."
- "Missing legal/procurement contact for Negotiation stage."

### 6. Outreach Drafter (Sonnet 4.6) — upgrade

**Trigger:** Cron 9am Mon-Fri + chain after lead_qualification approval
**Current:** Raw Claude prompt, regex JSON parsing, sparse context
**Change:** Structured outputs, adaptive thinking, full context pipeline, warm intro drafting

#### Improvements

1. **Structured outputs** via `messages.parse()` + Zod — replaces regex JSON extraction
2. **Adaptive thinking** (`thinking: { type: "adaptive" }`) for better creative output
3. **Prompt caching** on system prompt
4. **Full context from upstream agents:** Receives enricher's approach brief, personal profile, rapport hooks, connection paths, and sentiment trajectory

#### Context-Aware Drafting

The drafter adapts its output based on the recommended channel:

- **Warm intro path exists:** Drafts an intro request message for the team member to send to the mutual connection, plus a follow-up email for after the intro
- **Shared affiliation:** References the shared background in the opener
- **Cold outreach:** Uses personal profile for maximum personalization — interests, communication style, icebreakers

#### Claude Output Schema

```typescript
const OutreachDraftSchema = z.object({
  subjectA: z.string(),
  subjectB: z.string(),
  body: z.string(),
  introRequestMessage: z.string().nullable(),  // If warm intro path exists
  toneUsed: z.string(),
  personalizationHooks: z.array(z.string()),  // What personal details were used
  reasoning: z.string(),
});
```

---

## Win/Loss Learning Loop (new agent capability)

**Not a separate agent** — integrated into the system as a post-close analysis step.

### Trigger

When an opportunity moves to ClosedWon or ClosedLost.

### What Claude Analyzes

Full deal history:
- All signals that were flagged for this account
- All emails sent and received (sentiment trajectory)
- Outreach drafts that were sent (which personalization worked)
- Timeline from first signal to close (or loss)
- Which agents contributed and what they recommended
- Contacts involved and their engagement patterns

### Output

```typescript
const WinLossAnalysisSchema = z.object({
  outcome: z.enum(['won', 'lost']),
  keyFactors: z.array(z.string()),  // What drove the outcome
  whatWorked: z.array(z.string()),  // Effective tactics
  whatDidnt: z.array(z.string()),  // Ineffective or counterproductive
  timingInsights: z.string(),  // Was our timing good/bad and why
  channelEffectiveness: z.string(),  // Which outreach channels performed
  competitorInsight: z.string().nullable(),
  recommendations: z.array(z.string()),  // How to improve for similar deals
});
```

### Learning Feedback Loop

Win/loss insights are stored and periodically summarized. These summaries are injected into agent system prompts:

- **Lead Qualifier:** "Deals in Nordic PPA segment close 40% faster when regulatory compliance is the primary pain. Weight urgency higher when regulation signals are present."
- **Outreach Drafter:** "Warm intro deals converted at 3x cold outreach. Prioritize connection paths. Technical tone outperforms consultative for energy procurement contacts."
- **Signal Hunter:** "Regulatory change signals had 2x conversion to qualified leads vs. job posting signals. Score accordingly."

**Storage and lifecycle:**
- Individual analyses are stored in a new `WinLossAnalysis` table
- Summaries are regenerated every 10 closed deals (won or lost), using Claude to synthesize all analyses into a concise set of learnings
- Summaries are stored in `AgentConfig.parameters.learnings` (max 500 tokens per agent to keep system prompts bounded)
- Summaries older than 6 months are automatically archived — recent learnings override stale patterns
- Because learnings change infrequently (every ~10 deals), prompt caching still works effectively

---

## Timing Intelligence (future iteration — not in initial build)

Deferred to a follow-up spec after core agent upgrades are proven. Requires data accumulation (response patterns, seasonal trends) before it can be meaningful.

**Planned capabilities for future spec:**
- Email response pattern analysis per account (day/time, latency by stage)
- Seasonal GoO/PPA market awareness (renewals, regulatory deadlines, conferences)
- Dynamic staleness thresholds based on account-specific response times
- Optimal send time suggestions for outreach

---

## Database Changes

### New Table: WinLossAnalysis

```prisma
model WinLossAnalysis {
  id              String   @id @default(cuid())
  opportunityId   String
  opportunity     Opportunity @relation(fields: [opportunityId], references: [id])
  outcome         String   // won | lost
  analysis        Json     // Full WinLossAnalysisSchema output
  createdAt       DateTime @default(now())
}
```

### Schema Changes

- **Contact:** Add optional `linkedinData` (Json) and `personalProfile` (Json) fields
- **Account:** Add optional `sentimentTrajectory` (Json) field
- **User:** Add optional `linkedinConnections` (Json) field for team connection data
- **AgentConfig:** `parameters` field already supports arbitrary JSON — win/loss learnings stored here

### New API Endpoints

- `POST /api/contacts/[id]/linkedin` — Accepts pasted LinkedIn text, triggers enricher
- `GET/PATCH /api/settings/profile` — Extended to include LinkedIn connection data for team members

---

## Error Handling & Rate Limiting

### API Error Policy

All Claude API calls use the SDK's built-in retry (default: 2 retries with exponential backoff for 429/5xx). Beyond that:

- **Transient errors (429, 500, 529):** SDK retries automatically. If still failing after retries, the agent records the error and skips the item. Other items in the batch continue.
- **Permanent errors (400, 401, 403):** Agent stops the entire run and reports the error. These indicate config issues (bad API key, invalid request) that won't resolve by retrying.
- **Content refusals (stop_reason: "refusal"):** Log and skip the item. This can happen if Claude refuses to generate outreach for a specific target.

### Rate Limit Awareness

With 6 agents potentially running concurrently (cron overlap), rate limits are a concern. Mitigations:
- **Sequential processing within agents:** Each agent processes items sequentially (not parallel API calls)
- **Stagger cron schedules:** Signal Hunter (*/4h), Lead Qualifier (*/4h offset by 30min), Pipeline Hygiene (8am), Outreach Drafter (9am). No two agents share the same cron minute.
- **Haiku vs Sonnet separation:** Haiku and Sonnet have separate rate limits, so using both models spreads the load
- **Batch where possible:** Signal Hunter and Inbox Classifier batch multiple items per API call, reducing total request count

### Migration: Existing Queue Items

When deploying, existing pending queue items will have old-format payloads (no `contextBundle`, different field names). The agents must handle `contextBundle` being undefined gracefully — this is already the case for cron-triggered runs, so no special migration is needed.

---

## Cost Estimation

Per agent run (approximate — token estimates based on representative prompt sizes):

| Agent | Model | Calls per run | Est. tokens per call | Est. cost per run |
|---|---|---|---|---|
| Signal Hunter | Sonnet 4.6 | 1-5 (per source) | ~5K in, ~800 out | ~$0.03-0.08 |
| Lead Qualifier | Haiku 4.5 | 1-20 (per lead) | ~2K in, ~400 out | ~$0.002-0.02 |
| Inbox Classifier | Haiku 4.5 | 1-10 (batched by account) | ~3K in, ~500 out | ~$0.004-0.02 |
| Account Enricher | Sonnet 4.6 | 3-4 (stages + web search) | ~6K in, ~1.5K out | ~$0.04-0.10 |
| Pipeline Hygiene | Haiku 4.5 | 1-10 (per flagged deal) | ~3K in, ~600 out | ~$0.004-0.02 |
| Outreach Drafter | Sonnet 4.6 | 1-10 (per lead) | ~4K in, ~800 out | ~$0.02-0.08 |
| Win/Loss Analysis | Sonnet 4.6 | 1 (per close) | ~8K in, ~1.5K out | ~$0.06 |

**Estimated monthly cost** (assuming moderate usage: 50 leads, 200 emails/week, 10 deals): **$10-30/month** with prompt caching. Without caching: ~$30-70/month. Web search tool usage for the Account Enricher may add ~$0.05/enrichment (Anthropic web search pricing).

---

## Testing Strategy

- Each agent's existing test file is updated to mock the Anthropic client
- Structured output schemas are tested independently (valid/invalid inputs)
- Integration tests verify chain context passing between agents
- Win/loss analysis tested with synthetic deal histories

---

## Implementation Priority

1. **Shared infrastructure** (ai.ts, schemas.ts, context bundle types) — foundation for everything
2. **Outreach Drafter upgrade** — quickest win, already has Claude, just needs structured outputs + caching
3. **Signal Hunter + Lead Qualifier** — immediate impact on lead pipeline quality
4. **Inbox Classifier** — improves responsiveness to inbound signals
5. **Account Enricher** — largest agent, most stages, depends on UI for LinkedIn paste + web search
6. **Pipeline Hygiene recovery playbooks** — smaller change, can parallel with others
7. **Win/Loss Learning Loop** — needs deal history to be useful, ship last
8. **Timing Intelligence** — deferred to future spec, needs data accumulation
