# Inbox, Calendar & Weekly Digest Redesign

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Unified activity-centric redesign of Inbox and Calendar/Meetings pages + new Weekly Digest Agent

## Context

Eco-Insight is a relationship-driven CRM for the GoO/renewable certificates/PPA market. The user base manages few accounts at high touch — quality over volume. The current Inbox is a flat email list with no threading, actions, or context. Calendar/Meetings is a flat list with no visualization, no automated prep, and no post-meeting workflow. Both feel disconnected from the rest of the CRM.

**Design inspiration:** Attio / Clay — clean, relationship-first, everything connected.

**Architecture:** Activity-Centric Hub — Inbox and Calendar are views into a unified activity stream. Every email, meeting, call, and note lives in one connected system.

---

## 1. Inbox Redesign

### Layout: Three-Panel Design

**Left panel — Conversation list:**
- Emails grouped into threads by `In-Reply-To` / `References` headers, falling back to subject + participant matching
- Each thread row shows: latest message preview, AI classification badge, linked account chip, unread indicator, timestamp
- Sorted by most recent activity, unread first
- Smart filters: by classification (positive reply, objection, meeting request, etc.), by account, by unread, by has-buying-signal (derived from classifier payload, not a classification enum value)
- Separate "Unlinked" filter for emails not yet matched to an account

**Center panel — Conversation thread:**
- All emails in the thread stacked chronologically
- Sentiment indicator per message (dot or subtle color)
- Full email body rendered with proper formatting
- Buying signal highlights inline (subtle callout)

**Right panel — Context sidebar:**
- Account card (name, type, status, FIUAC scores)
- Contact card (role, warmth, LinkedIn)
- Related opportunities (stage, amount, health)
- Recent activity on that account (last 5 items)
- Quick actions strip

### Quick Actions (per email/thread)

- **Draft reply** — triggers Outreach Drafter agent, routes draft to approval queue
- **Create follow-up task** — opens inline task form pre-filled with account + contact
- **Link to account** — search + one-click link (for unlinked emails)
- **Log as activity note** — adds to account activity timeline
- **Snooze** — hide thread until selected date, resurfaces automatically

### Keyboard Navigation

- `j` / `k` — move between threads
- `Enter` — open thread
- `Esc` — back to list
- `r` — draft reply
- `t` — create task
- `e` — archive/dismiss
- `s` — snooze

### Unlinked Inbox

Emails that couldn't auto-link to an account appear in a dedicated filtered view. Each shows domain and suggests potential account matches. One-click to link. This prevents emails falling through the cracks.

---

## 2. Calendar/Meetings Redesign

### Calendar View

- **Week view** (default) + month view toggle
- Color-coded meeting cards by linked account (consistent account colors across CRM)
- Meeting cards show: title, time, attendee count, account chip, prep status indicator
  - Green dot = prepped
  - Amber dot = needs prep
  - Red dot = no prep, meeting is today/tomorrow
- Today line indicator (horizontal rule at current time in week view)
- **Task due dates** overlaid as small markers on calendar — seeing "Send proposal" next to "Follow-up meeting" on the same day tells the full story
- Click meeting card → detail drawer slides in from the right

### Meeting Detail Drawer

**Two tabs: Prep and Outcome**

#### Prep Tab

- **Auto-generated talking points** pulled from:
  - Account pain/whyNow brief
  - Recent signals mentioning the account
  - Last meeting outcome with this account (prominent, not buried — "Last time you discussed X and committed to Y")
  - Open tasks on the account
  - Deal stage + health dimensions
  - Recent email sentiment trajectory
- Editable — user can add/remove/reorder points
- "Generate prep" button triggers Claude Sonnet for on-demand refresh
- **Attendee list** with contact cards (name, role, warmth, LinkedIn link)
- Prep status auto-updates to "prepped" once viewed or edited

#### Outcome Tab (Post-Meeting)

**Step 1 — The Paste Prompt:**
- Large, inviting drop zone
- Clear messaging: "Paste your meeting notes and let AI do the rest"
- Subtle animated shimmer on border to signal AI capability
- Placeholder showing example of messy notes → polished output
- Supporting text: "We'll create a structured summary, extract tasks, and update your accounts"

**Step 2 — AI Processing (on paste):**
Claude Sonnet processes raw notes and produces:

- **Formatted summary** — Clean narrative of what was discussed. Displayed in a polished card replacing the paste zone. Editable.
- **Action items → Draft tasks** — Pre-populated with suggested owners, due dates, linked accounts. Toggle each on/off.
- **Follow-up meetings detected** — "Schedule follow-up with X on Y topic." One-click creates calendar event and sends invite via email integration.
- **Account enrichment suggestions** — Pain points, competitor names, budget figures, org changes, new contacts, updated timelines mentioned in notes surface as enrichment cards. Each routes through the queue as an `enrichment` item on approve.
- **Contact intelligence** — New names/roles mentioned → "Add contact?" suggestions. Sentiment/warmth changes detected (e.g., "CTO was skeptical") → flag warmth update.

**Step 3 — Review & Confirm:**
All extracted items presented for review before any action fires:
- Summary (editable)
- Tasks to create (toggle on/off each)
- Invites to send (toggle on/off each)
- Account updates to apply (approve/dismiss each)
- Sentiment tag (pre-selected by AI, adjustable)

"Confirm all" button at the bottom. Everything approved routes through the existing approval queue. Nothing fires without confirmation.

### No-Show Flow

If a meeting passes with no outcome recorded, surface a prompt the next morning:
- "This meeting had no outcome — did it happen?"
- Options: Record outcome | Mark as no-show (auto-creates re-engagement task) | Reschedule
- No-shows are tracked as a signal — important in a relationship-driven business

### Pre-Meeting Email Nudge

Day before a meeting, send an email with the prep summary. Walk into every meeting prepared without opening the CRM. Uses the same email delivery infrastructure as the Weekly Digest.

**Trigger:** Daily cron (e.g., 6 PM) queries meetings where `date` is tomorrow. For each, generates a prep summary and sends via Microsoft Graph `sendMail` using the meeting owner's OAuth token. Lightweight — no agent registration needed, just a scheduled API route.

### Meeting Analyst Agent

The post-meeting AI processing (paste notes → summary + tasks + enrichment) is registered as a formal agent in the framework:

- **Name:** `meeting-analyst`
- **Trigger:** Event (`meeting_outcome_pasted`) — fired when user pastes notes and clicks process
- **Model:** Claude Sonnet
- **Queue routing:** Enrichment cards and task suggestions route through queue as `enrichment` and `task_creation` items. Follow-up meeting invites route as `meeting_scheduling` (new queue type). The formatted summary is saved directly to the Meeting record (not queued).

This keeps the meeting outcome flow consistent with the existing agent architecture — outputs that change CRM state go through the queue, informational outputs (summary) are saved directly.

---

## 3. Weekly Digest Agent

### Agent Registration

- **Name:** `weekly-digest`
- **Trigger:** Cron, Sunday evening
- **Model:** Claude Sonnet
- **Queue routing:** None — informational only. The agent's `analyze()` method writes the `WeeklyDigest` record directly and returns `items: []`. This is a deliberate deviation from the standard runner pattern since the digest is not action-requiring.

### Data Gathered (Past 7 Days)

All queries are deterministic (no LLM involvement in data gathering):

- **Opportunities:** stage changes, new opps created, closed won/lost, health score changes
- **Emails:** count sent/received per account, sentiment shifts, buying signals detected
- **Meetings:** held + outcomes recorded, no-shows, upcoming next week
- **Tasks:** completed, created, overdue
- **Queue:** items approved/rejected, approval rate
- **Contacts:** added, warmth changes, role updates

### Output Structure

**Section 1 — Pipeline Snapshot**
- Total pipeline value + delta from last week (+/- amount, +/- %)
- Deals that moved stage: deal name, from → to
- Deals closed: won/lost, one-line context from win-loss or outcome
- New opportunities created
- At-risk deals: health score dropped below threshold this week

**Section 2 — Account Highlights**
- One narrative paragraph per account that had any activity during the week
- Covers: emails, meetings, tasks, deal movement, contact changes
- Accounts with zero activity omitted
- Ordered by most activity first
- Written as readable prose, not bullet points — Claude Sonnet synthesizes

**Section 3 — Week Ahead**
- Meetings scheduled for next week (with prep status)
- Tasks due next week
- Overdue items carried forward

### Delivery

- **Database:** Stored as `WeeklyDigest` record (new model) with structured JSON + rendered HTML
- **In-app:** Dedicated `/digest` page showing current digest + archive of past digests
- **Email:** Full summary sent to all active users + link to in-app version

### Data Model Addition

```prisma
model WeeklyDigest {
  id            String   @id @default(cuid())
  weekStart     DateTime
  weekEnd       DateTime
  pipelineSnapshot Json
  accountHighlights Json
  weekAhead     Json
  renderedHtml  String   @db.Text
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  createdAt     DateTime @default(now())

  @@index([tenantId, weekStart])
}
```

---

## 4. Data Model Changes

### InboxEmail — Add body, threading, and snooze fields

```prisma
model InboxEmail {
  // ... existing fields (subject, from, preview, classification, etc.)

  // Body storage (fetched and stored on sync — acceptable for low-volume niche CRM)
  body          String?   @db.Text   // Plain text body
  bodyHtml      String?   @db.Text   // HTML body for rich rendering

  // Threading
  messageId     String?              // Message-ID header
  inReplyTo     String?              // In-Reply-To header
  references    String[]             // References header (array)
  threadId      String?              // Computed thread group ID

  // Snooze
  snoozedUntil  DateTime?            // Hidden from inbox until this date; query filters out snoozedUntil > now()

  @@index([threadId])
  @@index([snoozedUntil])
}
```

**Threading algorithm:** On sync, if `inReplyTo` matches an existing email's `messageId`, inherit its `threadId`. Otherwise, generate a new `threadId`. For out-of-order arrival (reply synced before original), run a reconciliation pass: when a new email arrives, check if any existing unmatched `inReplyTo` values reference the new email's `messageId` and merge them into the same thread. Thread merging (connecting two previously separate threads via a late `References` header) is out of scope for v1.

### Meeting — Add outcome persistence and no-show tracking

```prisma
model Meeting {
  // ... existing fields (title, date, attendees, prepNotes, etc.)

  // Post-meeting outcome
  rawNotes          String?    @db.Text   // User's pasted meeting notes (raw input)
  outcomeSummary    String?    @db.Text   // AI-generated formatted summary
  outcomeRecordedAt DateTime?             // When outcome was captured
  sentimentTag      String?               // positive | neutral | negative
  noShow            Boolean    @default(false)  // Meeting didn't happen

  @@index([accountId, date(sort: Desc)])  // Fast lookup for "last meeting with this account"
}
```

### QueueItemType — Add meeting_scheduling

```prisma
enum QueueItemType {
  outreach_draft
  lead_qualification
  enrichment
  task_creation
  signal_review
  meeting_scheduling    // NEW: follow-up meeting invites from meeting outcome flow
}
```

### Tenant — Add WeeklyDigest relation

```prisma
model Tenant {
  // ... existing fields
  weeklyDigests  WeeklyDigest[]
}
```

### Account — Add derived color for calendar

Account colors for calendar color-coding are derived deterministically from a hash of the account ID (e.g., `hsl(hash(id) % 360, 60%, 50%)`). No new field needed.

---

## 5. Shared Infrastructure

### Email Sending

Both the pre-meeting nudge and weekly digest email delivery need outbound email. Current system only syncs inbound via Microsoft Graph.

**Approach:** Use Microsoft Graph `sendMail` endpoint with the user's existing OAuth token. No new integration needed — extend the current Graph client.

**Error handling:** Token refresh on 401, retry once on transient failures (429, 503), notify user via in-app toast on permanent failure. Failed digest emails are logged but do not block the digest record creation.

---

## 6. Pages & Routes

| Route | Purpose |
|-------|---------|
| `/inbox` | Three-panel inbox with threading, context, quick actions |
| `/meetings` | Calendar week/month view + meeting detail drawer |
| `/digest` | Weekly digest archive + current digest |

---

## 7. Non-Goals

- **Composing new emails from scratch** — Outreach Drafter handles cold outreach via queue. Inbox is for responding to inbound.
- **Real-time calendar sync** — Current 15-min cron sync is sufficient for this use case.
- **Multi-calendar support** — Microsoft only for now (matches existing integration).
- **Mobile-responsive inbox** — Desktop-first for v1. The three-panel layout collapses to two panels on tablet.

---

## 8. Dependencies

- Existing agent framework (registry, runner, schemas, AI client)
- Existing approval queue system
- Microsoft Graph OAuth integration (email sync + send)
- Existing InboxEmail, Meeting, Activity, Account, Contact models

---

## 9. Risk & Mitigations

| Risk | Mitigation |
|------|------------|
| Email threading misgroups conversations | Fallback to subject + participant matching; allow manual unlink |
| AI extracts wrong action items from notes | Everything goes through review step; nothing fires without confirmation |
| Weekly digest email marked as spam | Send from user's own mailbox via Graph, not a system address |
| Large paste of notes exceeds token limits | Truncate to ~4000 words with warning; summarize in chunks if needed |
| No-show prompt annoying for informal meetings | Allow per-meeting "skip outcome" option; don't prompt for declined meetings |
