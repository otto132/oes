# Eco-Insight Revenue OS — API Contract

> REST API specification derived from the v5 prototype.
> Every endpoint maps to a specific screen or action in the UI.
> All responses use JSON. All timestamps are ISO 8601 UTC.
> All monetary values are integers in euro cents.
> Authentication: Bearer token (JWT) on every request.

---

## Conventions

```
Base URL:   /api/v1
Auth:       Authorization: Bearer <token>
Pagination: ?cursor=<id>&limit=<n>  (cursor-based, default limit=50)
Sorting:    ?sort=<field>&order=asc|desc
Filtering:  ?filter[field]=value
Errors:     { "error": { "code": "NOT_FOUND", "message": "..." } }
```

**Standard response envelope:**
```json
{
  "data": { ... },
  "meta": { "cursor": "abc123", "hasMore": true }
}
```

---

## 1. Home

### `GET /home/summary`

Returns the data needed to render the Home screen in a single call.
This is the most important endpoint for mobile performance.

**Used by:** Home page (desktop + mobile)

**Response:**
```json
{
  "greeting": "Good morning, Juuso",
  "date": "Thursday, 12 March",
  "stats": {
    "pipelineTotal": 187500000,
    "pipelineWeighted": 68250000,
    "openDeals": 7,
    "closingThisMonth": 2,
    "atRiskCount": 2,
    "pendingApprovals": 5,
    "newSignals": 4
  },
  "nextBestActions": [
    {
      "type": "approval",
      "title": "5 items awaiting approval",
      "meta": "Outreach drafts, leads, enrichments",
      "urgency": 98,
      "ctaLabel": "Review",
      "route": "/queue",
      "inlineItems": [
        { "id": "q1", "title": "Cold outreach to BASF SE...", "queueItemId": "q1" }
      ]
    },
    {
      "type": "overdue_task",
      "title": "Follow up Vattenfall — GoO proposal response",
      "meta": "Overdue · Vattenfall Nordic AB",
      "urgency": 95,
      "ctaLabel": "Handle",
      "route": "/tasks/t1"
    }
  ],
  "topSignals": [
    { "id": "s1", "title": "Ørsted signs 15-year...", "type": "ppa_announcement", "confidence": 0.85 }
  ],
  "todaysMeetings": [
    { "id": "m1", "title": "E.ON API Integration Review", "time": "10:00", "duration": "60 min", "prepStatus": "ready" }
  ],
  "dealsAtRisk": [
    { "id": "o3", "name": "Statkraft GoO Trading Pilot", "healthAvg": 38, "accountName": "Statkraft Markets" }
  ],
  "recentActivity": [
    { "id": "x1", "type": "Email", "summary": "ELcert module pricing...", "accountName": "Axpo Nordic AS", "relativeTime": "1d ago" }
  ]
}
```

---

## 2. Approval Queue

### `GET /queue`

**Query params:**
- `status`: `pending` | `completed` (default: `pending`)
- `type`: `all` | `outreach_draft` | `lead_qualification` | `enrichment` | `task_creation`

**Response:** `{ "data": QueueItem[], "meta": { "pendingCount": 5, "completedCount": 3 } }`

### `POST /queue/:id/approve`

Approves a queue item and applies side-effects.

**Request body (optional):**
```json
{
  "editedPayload": { ... }
}
```
If `editedPayload` is provided, it replaces the original payload before applying.

**Side-effects by type:**
| Type | Side-effect |
|------|-------------|
| `outreach_draft` | Activity logged, Account.lastActivityAt updated |
| `lead_qualification` | Lead created with payload scores/stage |
| `enrichment` | Account field updated with payload.after |
| `task_creation` | Task created with payload fields |

**Response:** `{ "data": { "queueItem": QueueItem, "sideEffect": { "type": "lead_created", "id": "l_123" } } }`

### `POST /queue/:id/reject`

**Request body:**
```json
{
  "reason": "Wrong contact"
}
```

**Response:** `{ "data": QueueItem }`

### `POST /queue/:id/undo`

Reverts an approved or rejected item back to pending. Only valid within 30 seconds of action.

**Response:** `{ "data": QueueItem }`

---

## 3. Signals

### `GET /signals`

**Query params:**
- `status`: `new` | `reviewed` | `converted` | `dismissed` (default: exclude `dismissed`)
- `type`: signal type filter

**Response:** `{ "data": Signal[] }`

### `GET /signals/:id`

Full signal detail.

**Response:** `{ "data": Signal }`

### `POST /signals/:id/dismiss`

**Response:** `{ "data": Signal }`

### `POST /signals/:id/convert`

Convert signal to lead.

**Request body:**
```json
{
  "company": "BASF SE",
  "type": "Industrial",
  "country": "Germany"
}
```

**Dedup check:** If company name matches existing Lead or Account (case-insensitive), returns `409 Conflict` with existing record reference.

**Response:** `{ "data": { "signal": Signal, "lead": Lead } }`

---

## 4. Leads

### `GET /leads`

**Query params:**
- `stage`: filter by lead stage
- `sort`: `score` | `createdAt` (default: `score` desc)

**Response:** `{ "data": Lead[] }`

### `GET /leads/:id`

**Response:** `{ "data": Lead }`

### `POST /leads`

Create a manual lead.

**Request body:**
```json
{
  "company": "Uniper SE",
  "type": "Utility",
  "country": "Germany",
  "pain": "Expanding GoO trading desk"
}
```

**Response:** `{ "data": Lead }` (201 Created)

### `POST /leads/:id/advance`

Move lead to next stage (New → Researching → Qualified).

**Response:** `{ "data": Lead }`

### `POST /leads/:id/disqualify`

**Response:** `{ "data": Lead }`

### `POST /leads/:id/convert`

Convert lead to Account + optional Opportunity.

**Request body:**
```json
{
  "accountName": "Uniper SE",
  "accountType": "Utility",
  "opportunityName": "Uniper GoO Trading Platform",
  "opportunityAmount": 25000000,
  "opportunityStage": "Discovery"
}
```

If `opportunityName` is null/empty, only Account is created.

**Response:** `{ "data": { "account": Account, "opportunity": Opportunity | null } }`

---

## 5. Accounts

### `GET /accounts`

**Query params:**
- `q`: free-text search (name, type, country, pain)
- `type`: filter by AccountType
- `sort`: `score` | `name` | `lastActivity` (default: `score` desc)

**Response:** `{ "data": AccountSummary[] }`

`AccountSummary` omits contacts and full AI brief for list performance.

### `GET /accounts/:id`

Full account detail including contacts, AI brief, and related counts.

**Response:**
```json
{
  "data": {
    "account": Account,
    "openOpportunities": OpportunitySummary[],
    "recentActivity": Activity[],
    "openTasks": TaskSummary[],
    "relatedQueueItems": QueueItem[]
  }
}
```

### `POST /accounts`

**Request body:**
```json
{
  "name": "Vattenfall Nordic AB",
  "type": "Utility",
  "country": "Sweden",
  "notes": "..."
}
```

**Triggers:** Account Enricher fires immediately on creation.

**Response:** `{ "data": Account }` (201 Created)

### `PATCH /accounts/:id`

Update any account field. If updating AI-generated fields (pain, whyNow, moduleFit), sets `aiConfidence` to 1.0 and `aiLastUpdated` to now (user-confirmed).

**Request body:**
```json
{
  "pain": "Manual GoO reconciliation consuming 3+ FTE.",
  "status": "Active"
}
```

**Response:** `{ "data": Account }`

### `POST /accounts/:id/contacts`

Add a contact to an account.

**Request body:**
```json
{
  "name": "Lars Eriksson",
  "title": "Head of GoO Desk",
  "role": "Champion",
  "warmth": "Warm",
  "email": "lars@vattenfall.com"
}
```

**Response:** `{ "data": Contact }` (201 Created)

---

## 6. Pipeline / Opportunities

### `GET /opportunities`

**Query params:**
- `view`: `kanban` | `table` (affects sorting only)
- `stage`: filter by stage(s), comma-separated
- `accountId`: filter by account

Open opportunities only by default (excludes Closed Won/Lost).

**Response:** `{ "data": Opportunity[], "meta": { "totalPipeline": 187500000, "weightedPipeline": 68250000 } }`

### `GET /opportunities/:id`

Full opportunity detail including account context and activity.

**Response:**
```json
{
  "data": {
    "opportunity": Opportunity,
    "account": AccountSummary,
    "contacts": Contact[],
    "activity": Activity[],
    "stageProgress": { "currentIndex": 5, "totalStages": 8 }
  }
}
```

### `POST /opportunities`

**Request body:**
```json
{
  "name": "Vattenfall GoO Platform",
  "accountId": "a1",
  "stage": "Discovery",
  "amount": 38000000,
  "closeDate": "2026-06-30"
}
```

`probability` is auto-set from stage. `health` initialized to `{ engagement: 50, stakeholders: 30, competitive: 50, timeline: 70 }`.

**Response:** `{ "data": Opportunity }` (201 Created)

### `POST /opportunities/:id/move`

Move opportunity to a different stage.

**Request body:**
```json
{
  "stage": "Proposal"
}
```

**Validation:**
- Skipping > 2 stages forward: returns `{ "warning": "skip", "stagesSkipped": 3 }` — client should confirm
- `Closed Won`: requires subsequent `POST /opportunities/:id/close-won`
- `Closed Lost`: requires subsequent `POST /opportunities/:id/close-lost`

**Side-effects:** Activity logged, probability updated.

**Response:** `{ "data": Opportunity }`

### `POST /opportunities/:id/close-won`

**Request body:**
```json
{
  "winNotes": "Strong champion + competitive pricing",
  "competitorBeaten": "Grexel"
}
```

**Side-effects:** Account.status → 'Active', Activity logged, confetti triggered client-side.

**Response:** `{ "data": Opportunity }`

### `POST /opportunities/:id/close-lost`

**Request body:**
```json
{
  "lossReason": "Lost to competitor",
  "lossCompetitor": "Grexel",
  "lossNotes": "Pricing gap too large"
}
```

**Response:** `{ "data": Opportunity }`

---

## 7. Inbox

### `GET /inbox`

**Query params:**
- `unreadOnly`: boolean
- `classification`: filter by type

**Response:** `{ "data": Email[], "meta": { "unreadCount": 2, "totalCount": 6 } }`

### `GET /inbox/:id`

Marks email as read on access.

**Response:**
```json
{
  "data": {
    "email": Email,
    "linkedOpportunity": OpportunitySummary | null,
    "suggestedActions": [
      { "type": "advance_deal", "label": "Advance deal stage", "opportunityId": "o6" },
      { "type": "create_task", "label": "Create follow-up task" }
    ]
  }
}
```

### `POST /inbox/:id/archive`

**Response:** `{ "data": Email }`

### `POST /inbox/:id/create-task`

Creates a task from the email context.

**Response:** `{ "data": Task }` (201 Created)

### `POST /inbox/:id/create-account`

Creates an account from an unlinked email's domain.

**Response:** `{ "data": { "account": Account, "email": Email } }`

---

## 8. Tasks

### `GET /tasks`

**Query params:**
- `tab`: `mine` | `review` | `all` (default: `mine`)
- `includeCompleted`: boolean (default: false)
- `q`: search text
- `goalId`: filter by goal

**Response:**
```json
{
  "data": {
    "tasks": Task[],
    "goals": Goal[]
  },
  "meta": {
    "myOpenCount": 5,
    "reviewCount": 1,
    "allOpenCount": 8,
    "overdueCount": 2
  }
}
```

### `GET /tasks/:id`

**Response:**
```json
{
  "data": {
    "task": Task,
    "goal": Goal | null,
    "siblingTasks": TaskSummary[],
    "suggestedNextTasks": string[]
  }
}
```

`suggestedNextTasks` are computed from account/opp context (see Pipeline Hygiene agent).

### `POST /tasks`

**Request body:**
```json
{
  "title": "Follow up on proposal",
  "accountId": "a1",
  "priority": "High",
  "due": "2026-03-15",
  "assigneeIds": ["u1"],
  "reviewerId": "u2",
  "goalId": "g1"
}
```

**Response:** `{ "data": Task }` (201 Created)

### `POST /tasks/:id/complete`

**Request body:**
```json
{
  "outcome": "done",
  "notes": "Sent revised proposal. Lars confirmed receipt.",
  "followUpTasks": [
    { "title": "Schedule proposal walkthrough call", "source": "ai_suggested" },
    { "title": "Prepare ROI one-pager", "source": "custom" }
  ]
}
```

**Side-effects:**
- Task.status → 'Done'
- Activity logged
- Account.lastActivityAt updated
- Deal engagement +10
- Follow-up tasks created if provided

**Response:** `{ "data": { "task": Task, "createdFollowUps": Task[] } }`

### `POST /tasks/:id/send-for-review`

Moves task to 'In Review' status.

**Response:** `{ "data": Task }`

### `PATCH /tasks/:id/reassign`

**Request body:**
```json
{
  "assigneeIds": ["u2", "u3"],
  "reviewerId": "u1"
}
```

**Response:** `{ "data": Task }`

### `POST /tasks/:id/comments`

**Request body:**
```json
{
  "text": "@Nick please review the margin assumptions",
  "mentionedUserIds": ["u3"]
}
```

**Response:** `{ "data": TaskComment }` (201 Created)

---

## 9. Activities

### `GET /activities`

**Query params:**
- `accountId`: filter by account
- `type`: filter by activity type

**Response:** `{ "data": Activity[] }`

### `POST /activities`

Log a note (covers general notes, insights, objections, etc.)

**Request body:**
```json
{
  "type": "Note",
  "accountId": "a1",
  "summary": "Insight: Lars mentioned evaluating 3 vendors",
  "detail": "Full context here...",
  "noteType": "insight"
}
```

**Response:** `{ "data": Activity }` (201 Created)

---

## 10. Meetings

### `GET /meetings`

**Query params:**
- `date`: filter by date (default: today)
- `accountId`: filter by account

**Response:** `{ "data": Meeting[] }`

### `GET /meetings/:id/prep`

Returns AI-generated meeting prep.

**Response:**
```json
{
  "data": {
    "meeting": Meeting,
    "account": AccountSummary | null,
    "talkingPoints": [
      "Confirm their current workflow and pain points",
      "Understand decision timeline and budget cycle",
      "Demo the GoO Issuance module with their volume context"
    ],
    "accountContext": {
      "pain": "Manual GoO reconciliation consuming 3+ FTE",
      "whyNow": "Budget cycle Q2. Lars evaluating 3 vendors.",
      "fiuacScore": 82
    },
    "confidence": 0.82,
    "agent": "Meeting Prep"
  }
}
```

### `POST /meetings/:id/mark-ready`

**Response:** `{ "data": Meeting }`

### `POST /meetings/:id/log-outcome`

**Request body:**
```json
{
  "outcome": "positive",
  "notes": "Good progress. Lars confirmed timeline.",
  "nextStep": "Send revised proposal by Friday",
  "objections": "Pricing too high",
  "healthUpdate": "up"
}
```

**Side-effects:**
- Activity logged (type: Meeting)
- Follow-up task created if `nextStep` provided
- Account.lastActivityAt updated
- If `healthUpdate`: engagement adjusted ±15

**Response:** `{ "data": { "activity": Activity, "task": Task | null } }`

---

## 11. Settings

### `GET /settings/agents`

Returns all agent configurations.

**Response:** `{ "data": AgentConfig[] }`

### `PATCH /settings/agents/:name`

Update agent parameters or status.

**Request body:**
```json
{
  "status": "paused",
  "parameters": {
    "scanFrequency": "every_8_hours",
    "minRelevanceThreshold": 70
  }
}
```

**Response:** `{ "data": AgentConfig }`

### `GET /settings/team`

**Response:** `{ "data": User[] }`

### `GET /settings/integrations`

**Response:**
```json
{
  "data": [
    { "name": "Microsoft 365 / Outlook", "status": "connected", "lastSyncAt": "2026-03-11T..." },
    { "name": "Calendar Sync", "status": "connected", "lastSyncAt": "2026-03-11T..." },
    { "name": "LinkedIn", "status": "manual", "lastSyncAt": null }
  ]
}
```

---

## 12. Search (Command Palette)

### `GET /search`

**Query params:**
- `q`: search query (min 2 chars)
- `limit`: max results per category (default: 5)

Searches across accounts, opportunities, contacts, leads, and signals.

**Response:**
```json
{
  "data": {
    "accounts": [{ "id": "a1", "name": "Vattenfall Nordic AB", "type": "Utility", "country": "Sweden" }],
    "opportunities": [{ "id": "o1", "name": "Vattenfall GoO Platform", "stage": "Proposal", "accountName": "Vattenfall Nordic AB" }],
    "leads": [],
    "signals": [],
    "actions": [
      { "label": "Create task", "action": "create_task" },
      { "label": "Log a note", "action": "log_note" }
    ]
  }
}
```

---

## 13. Outreach Drafting

### `POST /outreach/draft`

Generate an AI outreach draft for a specific account + contact.

**Request body:**
```json
{
  "accountId": "a1",
  "contactId": "c1"
}
```

**Response:**
```json
{
  "data": {
    "to": "Lars Eriksson <lars.eriksson@vattenfall.com>",
    "subject": "Eco-Insight — GoO capabilities for Vattenfall",
    "body": "Hi Lars, ...",
    "confidence": 0.78,
    "agent": "Outreach Drafter"
  }
}
```

This does NOT create a queue item. The client should display the draft and let the user edit, then either:
- `POST /outreach/save-draft` (save without sending)
- `POST /outreach/send-to-queue` (routes to Approval Queue)

### `POST /outreach/send-to-queue`

**Request body:**
```json
{
  "accountId": "a1",
  "to": "Lars Eriksson <lars.eriksson@vattenfall.com>",
  "subject": "...",
  "body": "..."
}
```

**Response:** `{ "data": QueueItem }` (201 Created)

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `GET /home/summary` | 60/min |
| `GET /search` | 120/min |
| Agent-triggered writes | 100/hour per agent |
| All other reads | 300/min |
| All other writes | 60/min |

---

## Webhook Events (for future integrations)

| Event | Payload |
|-------|---------|
| `signal.created` | Signal |
| `lead.created` | Lead |
| `lead.converted` | Lead + Account |
| `account.updated` | Account (changed fields) |
| `opportunity.stage_changed` | Opportunity (old stage, new stage) |
| `opportunity.closed_won` | Opportunity |
| `opportunity.closed_lost` | Opportunity |
| `queue_item.created` | QueueItem |
| `queue_item.approved` | QueueItem + side-effect |
| `queue_item.rejected` | QueueItem |
| `task.completed` | Task |
| `email.received` | Email |
