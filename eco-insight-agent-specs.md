# Eco-Insight Revenue OS — Agent Specifications

> Derived from v5 prototype. Each agent is a narrow, event-triggered worker
> with strict inputs, outputs, tools, confidence thresholds, fallback behavior,
> and auditability. LLMs are used only for summarization, drafting, extraction,
> and prioritization support — never for state transitions or scoring.

---

## Architecture Principles

1. **Agents are not autonomous.** They are event-triggered functions that produce outputs for human review.
2. **Deterministic rules control all scoring, state transitions, dedup, and safety-sensitive decisions.** LLMs never decide scores or move pipeline stages.
3. **Customer-facing actions require approval by default.** All outreach, all lead qualification below auto-thresholds, and all enrichment below confidence thresholds route to the Approval Queue.
4. **Agent Output is a first-class object** with: confidence (numeric), reasoning (text), sources (URLs), status (pending/approved/rejected), reviewer, and timestamp audit trail.
5. **Every agent has a kill switch.** Status can be `active` or `paused` in Settings. Paused agents do not fire.

---

## Agent 1: Signal Hunter

**Purpose:** Detect market signals relevant to Eco-Insight's ICP from external sources.

### Trigger
- **Schedule:** Every 4 hours (configurable)
- **Sources:** Reuters Energy, Bloomberg Green, LinkedIn Jobs, Montel News, AIB Registry Alerts, ENTSO-E publications, event detection feeds

### Inputs
- RSS/API feeds from configured sources
- ICP definition (internal): utilities, traders, retailers, industrial buyers dealing with GoO/EECS/REGO/I-REC/ELcert
- Existing account names + domains (for dedup)
- Existing signal titles (for dedup)

### Processing Steps
1. **Fetch** new items from all sources since last run
2. **Filter** by keyword relevance (GoO, PPA, renewable certificate, ELcert, REGO, I-REC, EECS, registry, certificate trading, green tariff, etc.) — deterministic keyword match, not LLM
3. **Score relevance** (0–100) using weighted keyword density + source authority + entity match to ICP — deterministic scoring function
4. **Discard** signals below min relevance threshold (default: 30)
5. **Extract entities** via LLM: company names, countries, scheme types, monetary values
6. **Deduplicate** against existing signals by title similarity (>80% Jaccard) and against accounts/leads by company name
7. **Generate summary + reasoning** via LLM: 2–3 sentence analysis + why this matters to Eco-Insight
8. **Assess confidence** via rules: high (relevance ≥ 80 + direct GoO mention), medium (relevance 60–79 or indirect mention), low (relevance < 60)

### Outputs
- `Signal` record with all fields populated
- Status: `new` (always — signals go to the Signals page, not the Queue)

### Confidence Thresholds
| Level | Relevance | Behavior |
|-------|-----------|----------|
| High | ≥ 80 | Shown prominently on Home + Signals |
| Medium | 60–79 | Shown on Signals page |
| Low | 30–59 | Shown on Signals page with reduced prominence |
| Below threshold | < 30 | Auto-dismissed, not stored |

### What LLM Does
- Entity extraction from article text
- Summary generation (2–3 sentences)
- Reasoning generation (why relevant)

### What LLM Does NOT Do
- Relevance scoring (deterministic)
- Dedup decisions (deterministic string matching)
- Threshold decisions (deterministic rules)

### Fallback
- If source feed fails: skip source, log warning, continue with remaining sources
- If LLM fails: store signal with raw title only, flag for manual summary
- If dedup uncertain (60–80% Jaccard): create signal but add `possible_duplicate` flag

---

## Agent 2: Lead Qualifier

**Purpose:** Score and qualify new leads using the FIUAC framework.

### Trigger
- **Event:** New Lead created (manual or from signal conversion)
- **Event:** Lead stage changed to 'Researching' (re-qualification)

### Inputs
- Lead record (company, type, country, pain hypothesis)
- Originating signal data (if signal-sourced)
- ICP definition with dimension weights
- Existing accounts + leads (for dedup)

### Processing Steps
1. **Dedup check** against accounts and leads by company name (case-insensitive, Levenshtein distance < 3)
2. **Score each FIUAC dimension** (0–100) via deterministic rules:
   - **Fit:** Type match to ICP (utility/trader = high), country in target markets, scheme relevance
   - **Intent:** Signal strength (direct GoO mention = high, hiring = medium, conference = low), engagement signals
   - **Urgency:** Recency of signal, explicit timeline mentions, budget cycle indicators
   - **Access:** Do we have a contact? Champion identified? Referral available?
   - **Commercial:** Estimated deal size based on type + country + signal context, willingness-to-pay indicators
3. **Compute composite** using weights: F×0.25 + I×0.25 + U×0.20 + A×0.15 + C×0.15
4. **Apply threshold rules:**
   - Composite ≥ 70: auto-qualify → Lead.stage = 'Qualified' (no queue)
   - Composite ≤ 25: auto-disqualify → Lead.stage = 'Disqualified' (no queue)
   - Composite 26–69: route to Approval Queue as `lead_qualification` item
5. **Generate reasoning** via LLM: why this score, what's strong/weak

### Outputs
- Updated Lead.scores, Lead.confidence
- If routed to queue: `QueueItem` with type `lead_qualification`
- If auto-qualified: Lead.stage updated, Activity logged
- If auto-disqualified: Lead.stage updated, Activity logged

### Confidence Calculation
```
confidence = weighted_average(
  icp_fit_certainty,      // how certain are we about type/segment match?
  intent_signal_strength,  // how clear is the intent signal?
  entity_match_quality     // how confident is the company identification?
)
```

### What LLM Does
- Generate reasoning text for queue item
- Extract additional context from signal text (timeline hints, tool mentions)

### What LLM Does NOT Do
- Score FIUAC dimensions (deterministic rules)
- Decide qualification outcome (deterministic thresholds)
- Dedup (deterministic string matching)

### Fallback
- If any FIUAC dimension cannot be scored (missing data): default to 40 for that dimension, add `low_data` flag
- If dedup match found: block qualification, surface existing record to user via toast

---

## Agent 3: Account Enricher

**Purpose:** Keep account briefs current with intelligence from signals, emails, and public sources.

### Trigger
- **Schedule:** Weekly refresh for all active accounts
- **Event:** New signal detected mentioning an existing account's name/domain
- **Event:** New email received from an account's domain
- **Event:** Account created (immediate enrichment)

### Inputs
- Account record (current pain, whyNow, moduleFit, competitors)
- Recent signals mentioning this account
- Recent emails from this account's contacts
- Recent activities on this account
- Public sources (LinkedIn company page, news, registry filings)

### Processing Steps
1. **Gather context** from all input sources since last enrichment
2. **Extract updates** via LLM: new pain signals, timeline changes, competitive intel, stakeholder changes
3. **Compare** each extracted field against current account values
4. **Score confidence** per update:
   - Source quality (0–1): primary source > secondary > inference
   - Relevance (0–1): directly about this account > industry trend
   - Freshness (0–1): < 7 days = 1.0, 7–30 days = 0.7, > 30 days = 0.4
5. **Apply threshold rules:**
   - Confidence ≥ 0.85: auto-apply update (no queue)
   - Confidence < 0.85: route to Approval Queue as `enrichment` item
6. **Format diff** for queue: show before/after for each changed field

### Outputs
- If auto-applied: Account field(s) updated, Activity logged
- If routed to queue: `QueueItem` with type `enrichment`, showing field diff

### Confidence Breakdown
```
confidence = average(source_quality, relevance, freshness)
```

### What LLM Does
- Extract structured updates from unstructured text (signals, emails, articles)
- Generate human-readable before/after descriptions
- Identify competitive mentions and stakeholder changes

### What LLM Does NOT Do
- Decide whether to apply update (deterministic threshold)
- Score source quality (deterministic rules based on source type)
- Overwrite user-confirmed data without routing to queue

### Fallback
- If no new context found: skip, do not create queue item
- If multiple conflicting updates: route to queue with all sources, let human decide
- If LLM extraction fails: skip enrichment, log warning

---

## Agent 4: Outreach Drafter

**Purpose:** Generate personalized outreach emails using account context and signal data.

### Trigger
- **Event:** Signal converted to Lead (suggest initial outreach)
- **Event:** User requests draft via "Draft Outreach" button
- **Schedule:** Sequence steps (e.g., follow-up emails in a cadence)

### Inputs
- Account record (pain, whyNow, moduleFit, contacts)
- Signal context (if signal-sourced)
- Contact to address (Champion preferred, fallback to first contact)
- Outreach history (previous emails to this account)
- Template style setting (default: Consultative)

### Processing Steps
1. **Select contact:** Champion if available, else first contact with email
2. **Gather context:** account pain, whyNow, relevant signal, module fit
3. **Generate draft** via LLM with structured prompt:
   - Tone: consultative, not salesy
   - Length: 4–6 sentences
   - Personalization: reference specific pain/signal/event
   - CTA: suggest a brief call, not a demo
4. **Score confidence:**
   - Relevance: does pain match a known module? (0–1)
   - Personalization: is there a specific signal or event referenced? (0–1)
   - Timing: is the account in active evaluation? (0–1)
5. **Always route to Approval Queue** — outreach is never auto-sent

### Outputs
- `QueueItem` with type `outreach_draft`
- Payload: to, subject, body
- Confidence: weighted average of relevance, personalization, timing

### Confidence Breakdown
```
confidence = average(relevance, personalization, timing)
```

### What LLM Does
- Draft the email body and subject line
- Personalize based on context

### What LLM Does NOT Do
- Decide whether to send (always routes to queue)
- Select the contact (deterministic: Champion > first contact)
- Skip approval

### Fallback
- If no contact email found: create queue item with `[no contact]` placeholder, flag for manual entry
- If no pain/whyNow context: generate generic outreach, set confidence < 0.5, add note "Limited personalization"
- If LLM fails: do not create queue item, log error

---

## Agent 5: Pipeline Hygiene

**Purpose:** Monitor deal health, flag stale opportunities, suggest next actions, and create follow-up tasks.

### Trigger
- **Schedule:** Daily (every 24 hours)
- **Event:** Task completed on an account with open opportunities
- **Event:** Email received from an account with open opportunities

### Processing Steps
1. **For each open opportunity:**
   a. **Calculate engagement decay:**
      - Days since last activity on this account
      - If > 7 days: decay engagement by 5 pts/week (deterministic)
      - If activity occurred today: boost engagement by +10 (capped at 100)
   b. **Assess health dimensions:**
      - Engagement: from activity timestamps (deterministic)
      - Stakeholders: from contact count + warmth levels (deterministic)
      - Competitive: from competitive mentions + stage (semi-deterministic)
      - Timeline: from close date proximity + stage appropriateness (deterministic)
   c. **Flag at-risk deals:** overall health < 40 → appears on Home
   d. **Suggest next action** via LLM:
      - Input: current stage, last activity, contacts, recent emails
      - Output: one specific action sentence, e.g. "Follow up with Kai on API feasibility"
   e. **Create follow-up task** if no open task exists for this account and engagement is decaying:
      - Route to Approval Queue as `task_creation` item
      - Confidence based on engagement_decay, relationship_path, priority

### Outputs
- Updated `DealHealth` on each opportunity (engagement decay applied)
- Updated `nextAction` and `nextActionDate` on opportunities
- `QueueItem` with type `task_creation` for stale deals (if applicable)
- Flagging of at-risk deals for Home display

### Confidence Breakdown (for task creation)
```
confidence = weighted_average(
  engagement_decay,     // how clearly is engagement dropping?
  relationship_path,    // is there a clear contact/referral to act on?
  priority              // how important is this deal?
)
```

### What LLM Does
- Suggest next action text (one sentence)
- Assess whether a task is appropriate vs. just nudging

### What LLM Does NOT Do
- Calculate health scores (deterministic from timestamps + data)
- Apply engagement decay (deterministic math)
- Move stages (never — only humans move stages)
- Auto-complete tasks

### Fallback
- If no activity data available: set engagement to 50 (neutral), do not decay
- If LLM fails to suggest action: use template: "Review and follow up on [opp name]"

---

## Agent 6: Inbox Classifier

**Purpose:** Classify incoming emails by intent and link to accounts.

### Trigger
- **Event:** New email received via Outlook/Gmail sync

### Processing Steps
1. **Extract domain** from sender email address
2. **Match domain** against Account.contacts[].email domains — deterministic lookup
3. **If match found:** link email to account (set accountId, accountName, isLinked = true)
4. **If no match:** check against known domains in Lead records; if still no match, flag as `new_domain`
5. **Classify intent** via LLM:
   - Input: subject, sender, first 500 chars of body
   - Output: one of the EmailClassification types
   - Also output: confidence (0–1)
6. **Apply classification confidence threshold:**
   - ≥ 0.70: classification applied as-is
   - < 0.70: classification applied but shown with lower prominence

### Outputs
- `Email` record with classification, confidence, and account linking
- No queue item — classification is informational, not action-requiring
- Emails appear on Inbox page for user triage

### Classification Types
| Classification | Description | Typical Action |
|---------------|-------------|----------------|
| `positive_reply` | Positive response, deal signal | Consider advancing deal stage |
| `question` | Technical or commercial question | Create follow-up task |
| `objection` | Concern or pushback | Log objection, address |
| `meeting_request` | Meeting invitation or scheduling | Accept/schedule |
| `auto_reply` | OOO, auto-response | Archive, note alternate contact |
| `new_domain` | Sender domain not in any account | Offer to create account |
| `bounce` | Delivery failure | Update contact email |
| `unsubscribe` | Opt-out request | Remove from sequences |
| `internal` | Internal team email | Archive |
| `spam` | Irrelevant | Archive |

### What LLM Does
- Classify email intent from subject + body
- Extract alternate contact mentions from OOO replies

### What LLM Does NOT Do
- Link emails to accounts (deterministic domain matching)
- Decide new_domain status (deterministic: no match = new domain)
- Create accounts (user action)
- Send replies

### Fallback
- If LLM classification fails: set classification to `null`, show email unclassified
- If domain extraction fails: flag as unlinked, no domain
- If multiple domain matches: link to most recent active account

---

## Agent Interaction Map

```
Signal Hunter ──→ Signal ──→ [User converts] ──→ Lead ──→ Lead Qualifier
                                                              │
                                                    ┌────────┘
                                                    ▼
                                              Queue Item
                                              (lead_qualification)
                                                    │
                                              [User approves]
                                                    │
                                                    ▼
                                              Lead created
                                                    │
                                              [User converts]
                                                    │
                                                    ▼
                                        Account + Opportunity
                                              │         │
                              Account Enricher ┘         └ Pipeline Hygiene
                                    │                           │
                              Queue Item                  Queue Item
                              (enrichment)              (task_creation)
                                    │                           │
                              [User approves]           [User approves]
                                    │                           │
                              Account updated             Task created

Outreach Drafter ──→ Queue Item (outreach_draft) ──→ [User approves] ──→ Email sent

Inbox Classifier ──→ Email (classified + linked) ──→ Inbox page ──→ [User triages]
```

---

## Configuration Defaults

| Agent | Parameter | Default |
|-------|-----------|---------|
| Signal Hunter | Scan frequency | Every 4 hours |
| Signal Hunter | Min relevance threshold | 60/100 |
| Signal Hunter | Auto-dismiss below | 30/100 |
| Lead Qualifier | Auto-qualify threshold | FIUAC ≥ 70 |
| Lead Qualifier | Auto-disqualify threshold | FIUAC ≤ 25 |
| Lead Qualifier | Route to Queue range | 26–69 |
| Account Enricher | Refresh cycle | Weekly |
| Account Enricher | Auto-update confidence | ≥ 0.85 |
| Account Enricher | Route to Queue below | 0.85 |
| Outreach Drafter | Always route to Queue | Yes |
| Outreach Drafter | Template style | Consultative |
| Outreach Drafter | Max sequence length | 4 steps |
| Pipeline Hygiene | Stale threshold | 7 days no activity |
| Pipeline Hygiene | Engagement decay rate | -5 pts/week |
| Pipeline Hygiene | Alert threshold | Health < 40 |
| Inbox Classifier | Min classification confidence | 0.70 |
| Inbox Classifier | Auto-link by domain | Enabled |
| Inbox Classifier | New domain detection | Enabled |
