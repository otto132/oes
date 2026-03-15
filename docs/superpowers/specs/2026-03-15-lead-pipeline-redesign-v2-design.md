# Lead & Pipeline Redesign v2 — Design Specification

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Redesign the lead → account → opportunity flow to eliminate dead ends, remove stage overlap, and create a seamless sales progression.

---

## 1. Executive Summary

**Model:** Separate lead qualification from deal execution, connected by a mandatory conversion that always creates an Opportunity, with bidirectional traceability via foreign keys.

**Core philosophy:** A qualified lead becomes a deal. Always. No dead ends, no optional steps, no CRM housekeeping masquerading as sales progression. Accounts are reference records, not workflow gates. The pipeline represents actual revenue motion.

**Problems with current model:**
- Conversion creates an Account as the primary output; Opportunity is optional
- A qualified lead can disappear from the visible sales flow
- No traceability between the originating lead and the resulting deal
- Lead stage "Qualified" and Opportunity stage "Qualified" overlap conceptually
- Opportunity stages include pre-qualification concepts (Identified, Contacted) that belong in the lead lifecycle
- No "parking lot" for leads with bad timing (either progress or disqualify)
- FIUAC qualification data is thrown away at conversion instead of seeding deal health

---

## 2. Object Model

### Lead
- **Purpose:** Capture and qualify inbound/outbound interest before it becomes a committed sales pursuit. Represents a hypothesis: "this company might buy from us."
- **Created when:** Signal detection, manual entry, conference scan, CSV import, inbound form.
- **Never used for:** Long-term storage. A lead is transient — it converts to an opportunity or gets disqualified. Leads older than 90 days without progression are a smell.

### Account
- **Purpose:** Permanent company record tying together all interactions, contacts, opportunities, and history. A reference entity, not a workflow entity.
- **Created when:** Automatically during lead conversion (or linked to existing). Can also be created manually.
- **Never used for:** Sales stages. Pipeline steps. Conversion gates. "Creating an account" should never feel like the point of anything.

### Contact
- **Purpose:** Individual people at an Account. Stakeholders in deals, recipients of emails, attendees of meetings.
- **Created when:** Manually by user, or auto-created from email sync / import. Optionally prompted during lead conversion.
- **Never used for:** Blocking conversion. Contacts are enrichment, not gates.

### Opportunity
- **Purpose:** Track a specific revenue pursuit from discovery through close. The core pipeline object — every euro of forecast lives here.
- **Created when:** Always during lead conversion. Can also be created directly on an Account for expansion deals.
- **Never used for:** "Maybe someday" parking (that's what leads and Paused state are for). Created without an Account.

### Activity
- **Purpose:** Immutable audit trail — calls, emails, notes, stage changes, conversions. Source of truth for "what happened and when."
- **Created when:** Automatically on stage transitions, conversions, system events. Manually for calls, meetings, notes.
- **Never used for:** Editable records. Task management.

---

## 3. Schema Changes

### Lead model — changes

```prisma
model Lead {
  // ... existing fields ...

  // New fields
  opportunityId    String?       @unique
  opportunity      Opportunity?  @relation(fields: [opportunityId], references: [id])
  convertedAt      DateTime?
  disqualifyReason String?
  pausedUntil      DateTime?

  // CHANGED: Remove @@unique([company]) constraint.
  // Multiple leads from the same company are allowed (e.g., two signals from
  // the same company, or a re-engagement after disqualification).
  // Account dedup happens at conversion time via case-insensitive name match.
  // The existing @@unique([company]) must be dropped in the migration.
}
```

### Lead stage enum — add Paused

```prisma
enum LeadStage {
  New
  Researching
  Qualified
  Paused
  Converted
  Disqualified
}
```

### Opportunity model — new fields

```prisma
model Opportunity {
  // ... existing fields ...

  // New field
  source    String   @default("")

  // Reverse relation — no new FK column needed
  lead      Lead?    // populated via Lead.opportunityId (1:1 reverse)

  // CHANGED: stage default from Identified to Discovery
  // stage OppStage @default(Discovery)
  // probability Int @default(15)
}
```

**Relation design:** The Lead → Opportunity link is a 1:1 relation owned by Lead (`Lead.opportunityId` FK, `@unique`). There is NO `leadId` column on Opportunity. The reverse is accessed via `opportunity.lead` in Prisma (implicit reverse of the 1:1). To query "which lead created this opportunity" from the opportunity side, use `include: { lead: true }` or a where clause on Lead filtering by `opportunityId`.

**Querying the "Sourced from" section on Account detail:** Since there is no direct Lead → Account FK, query via: `Lead.where({ opportunityId: { in: account.opportunities.map(o => o.id) }, stage: 'Converted' })`. This joins through Lead.opportunityId → Opportunity → Account.

**Source field for direct-created opportunities:** When an Opportunity is created directly on an Account (not through lead conversion), `source` should be set explicitly. For expansion deals, use `source = "Expansion"`. For other manual creation, use `source = "Direct"`. Default is `""` for migration safety.

### OppStage enum — replace entirely

```prisma
enum OppStage {
  Discovery
  Evaluation
  Proposal
  Negotiation
  Commit
  Won
  Lost
}
```

**Full migration mapping:**

| Current | New | Notes |
|---|---|---|
| Identified | Discovery | Merged — pre-qualification concept removed |
| Contacted | Discovery | Merged — contacting is an activity, not a stage |
| Discovery | Discovery | Unchanged |
| Qualified | Evaluation | Renamed — eliminates overlap with lead "Qualified" |
| SolutionFit | Evaluation | Merged with Qualified → Evaluation |
| Proposal | Proposal | Unchanged |
| Negotiation | Negotiation | Unchanged |
| VerbalCommit | Commit | Renamed — shorter |
| ClosedWon | Won | Renamed — shorter |
| ClosedLost | Lost | Renamed — shorter |

**Note on granularity loss:** `Identified` and `Contacted` collapse into `Discovery`. `Qualified` and `SolutionFit` collapse into `Evaluation`. Historical stage-level reporting at the old granularity will be lost. Activity log entries from before migration will still reference the original stage names in their text (e.g., "Stage → Contacted"), preserving the audit trail.

### AccountStatus enum — add Customer

```prisma
enum AccountStatus {
  Prospect
  Active
  Customer
  Partner
  Churned
}
```

---

## 4. Stage Architecture

### Lead stages (qualification quality — "should we pursue?")

| Stage | Meaning | Exit criteria |
|---|---|---|
| `New` | Just captured, no evaluation yet | Owner assigned, initial review done |
| `Researching` | Actively investigating fit, pain, access | FIUAC scores updated from research |
| `Qualified` | Confirmed worth pursuing commercially | Ready to convert — has pain, fit, and access |
| `Paused` | Good fit but bad timing, check back later | `pausedUntil` date set |
| `Converted` | Handed off to pipeline (terminal) | Opportunity exists |
| `Disqualified` | Not worth pursuing (terminal) | Reason recorded |

### Opportunity stages (deal progress — "how do we close?")

| Stage | Meaning | Probability | Exit criteria |
|---|---|---|---|
| `Discovery` | Understanding needs, mapping stakeholders | 15% | Pain confirmed, key stakeholder identified |
| `Evaluation` | Demonstrating product-market fit to buyer | 35% | Solution mapped to needs, champion engaged |
| `Proposal` | Formal commercial offer sent | 55% | Proposal delivered and acknowledged |
| `Negotiation` | Terms, pricing, legal in discussion | 75% | Negotiation active, decision timeline known |
| `Commit` | Verbal yes, awaiting signature / PO | 90% | Verbal agreement received |
| `Won` | Signed, closed (terminal) | 100% | Contract signed |
| `Lost` | Dead (terminal) | 0% | Loss reason recorded |

### Design rules
- Zero stage name overlap between lead and opportunity lifecycles
- No pre-qualification concepts in opportunity stages
- Opportunity stages describe what the BUYER is doing, not the seller

---

## 5. Conversion Logic

### Trigger
"Create Deal" button on Qualified lead cards only.

### Conversion modal fields

| Field | Default | Required |
|---|---|---|
| Opportunity name | `{lead.company} — {lead.moduleFit[0] or "New Deal"}` | Yes |
| Account name | `{lead.company}` | Yes (pre-filled) |
| Account type | `{lead.type}` | Yes (pre-filled) |
| Initial stage | Discovery (locked, not changeable) | N/A |
| Estimated amount | 0 | No |
| Expected close date | today + 90 days | No |
| Owner | Current user | Yes |

### Transaction (atomic)

1. **Account upsert** — case-insensitive name match.
   - New: inherit `type`, `country`, `region`, `pain`, `moduleFit`, FIUAC scores, `aiConfidence` from lead. Status = `Prospect`.
   - Existing: link only, do not overwrite fields.
2. **Opportunity create** — fields from modal + auto-set:
   - `probability` = 15 (Discovery)
   - `source` = `lead.source`
   - Health seeded from FIUAC: `healthEngagement ← scoreIntent`, `healthStakeholders ← scoreAccess`, `healthCompetitive ← scoreCommercial`, `healthTimeline ← scoreUrgency`
3. **Lead update** — `stage = Converted`, `opportunityId` set, `convertedAt` set.
4. **Activity create** — on the account: "Lead converted → Created deal '{oppName}'"
5. **Redirect** — navigate to new Opportunity detail page. Toast: "Deal created from {company}."

### Lead stage transition rules

```
New → Researching         (advance action)
Researching → Qualified   (advance action)
Qualified → Converted     (convert action — modal, mandatory opp)
Any active → Paused       (pause action — requires pausedUntil date)
Paused → Researching      (resume action — manual or auto on date)
Any active → Disqualified (disqualify action — requires reason)
Disqualified → Researching (requalify action — activity logged)
```

- Cannot convert from any stage except Qualified
- Paused → Researching (not → Qualified, must re-evaluate)
- Disqualified → Researching (not → Qualified, must re-research)

### Opportunity stage transition rules

```
Discovery → Evaluation → Proposal → Negotiation → Commit → Won
Any active stage → Lost
```

- Forward moves via drag-and-drop on kanban
- Backward moves via dropdown action only (not drag) — creates activity log entry
- Won/Lost are terminal — no re-opening. New demand = new Opportunity.
- Close Won auto-promotes Account status to `Customer` (if first won deal)

---

## 6. UX / UI Design

### Leads Page

**Desktop:** Kanban with 3 columns — New | Researching | Qualified.
- Converted and Disqualified are terminal, not shown.
- Paused leads accessible via "Paused ({count})" pill/tab above the kanban. Shows a simple list with company name, resume date, and "Resume" button.

**Cards:**
- Same content as today (company, type, country, pain, FIUAC bars, score, owner)
- Qualified column: primary CTA is **"Create Deal"** (green button, prominent)
- Overflow menu: Advance, Pause, Disqualify

**Disqualify action:** Requires reason from dropdown: No Budget, No Pain, Wrong Segment, Competitor Locked, Bad Timing, Other (free text).

**Pause action:** Date picker for `pausedUntil`. Creates activity entry.

**Convert modal:** Centered overlay. Pre-filled fields. "Create Deal" submit button. On success: toast + redirect to opportunity detail.

**Mobile:** Sorted list by composite FIUAC score. Paused leads behind filter toggle.

### Pipeline Page

**Desktop kanban:** 5 columns — Discovery | Evaluation | Proposal | Negotiation | Commit.
- Reduced from 7 columns. Less horizontal scrolling.

**Cards:**
- Account name, opportunity name, amount, health indicator, owner, probability
- **Source pill** in top-right corner (e.g., "Signal", "Conference"). Click navigates to originating lead.
- Next action (if exists, line clamp 2)

**Drag:** Forward-only. Backward drag shows toast: "Use the stage dropdown to move deals back."

**Won/Lost toggle:** "Show Closed ({count})" button above kanban — reveals two collapsed sections below.

**Table view:** Same as today + new stage names + "Source" column.

### Account Detail Page

- Account status badge now includes `Customer` (green, auto-set on first Won deal)
- **"Sourced from" section:** Below header, if created via lead conversion: "Sourced from lead: {company} on {date}" — clickable link. Multiple leads shown if applicable.
- Opportunities section: unchanged (already shows open deals + "+ New Opportunity" for expansion)

### Opportunity Detail Page

- **"Originated from" link:** Below header, if `opportunity.lead` exists (via reverse relation): "Originated from lead: {company}" — clickable.
- **Source badge:** Next to opportunity name header.
- Stage progression bar showing all 5 active stages with current highlighted.

### Activity Timeline

- Conversion events: "Lead converted → Created deal '{name}' on account '{account}'" with links to both records.
- Stage regressions: "Stage moved back: Proposal → Discovery"
- Pause/resume events on leads.

---

## 7. Reporting Capabilities

### Metrics enabled by redesign

| Metric | Definition |
|---|---|
| Lead volume | Count of leads created per period, by source |
| Qualification rate | `(Qualified + Converted) / (Qualified + Converted + Disqualified)` per period |
| Conversion rate | `Converted / Qualified` per period |
| Source quality | Average FIUAC score at conversion, by source |
| Lead velocity | Average days from New → Converted, by source |
| Pause rate | Leads paused / total leads — indicates timing mismatches |
| Lead aging | Leads in Qualified > 14 days without conversion (alert) |
| Pipeline creation rate | New opportunities per period, by source |
| Stage velocity | Average days in each opportunity stage |
| Win rate | `Won / (Won + Lost)` per period |
| Won by source | Revenue closed, grouped by originating lead source |
| Loss reasons | Distribution of loss reasons, by stage at loss |
| Deal cycle time | Average days from Discovery → Won |
| Lead-to-revenue time | `opportunity.wonDate - lead.createdAt` via Lead.opportunityId reverse relation |
| Full funnel | Signal → Lead → Opportunity → Won, with drop-off at each step |

No new reporting UI in v2. These are the queries the data model now supports. Dashboards come later.

---

## 8. Edge Cases

| Scenario | Handling |
|---|---|
| **Multiple leads from same company** | Allowed. Each converts independently. Account upsert links to existing. Each gets its own Opportunity. |
| **One lead → multiple opportunities** | Not directly. One conversion = one opportunity. Second deal = create Opportunity directly on Account (no leadId, source = "Expansion"). |
| **Inbound from existing account** | Create new Lead. On conversion, links to existing Account (no duplicate). |
| **Duplicate company names** | Conversion modal shows warning: "Account '{name}' already exists. Link to existing?" with option to edit. |
| **Qualified lead sitting too long** | After 14 days in Qualified, surface in "Stale Leads" alert. Lead qualifier agent can flag. |
| **Paused lead auto-resume** | When `pausedUntil` date arrives, move to Researching. Activity: "Auto-resumed from pause." |
| **Disqualified lead comes back** | Move to Researching (not Qualified). Must re-research. Activity logged. |
| **Closed Lost re-opened demand** | Create new Opportunity on the Account. Old stays closed. New gets own lifecycle. |
| **Convert without FIUAC scores** | Works fine — defaults carry over (50/50/50/30/50). Health seeding uses whatever scores exist. |
| **Lead with no company name** | Not supported — company is required. Lead represents a commercial hypothesis about a company. |

---

## 9. Migration Plan

### Database migration

1. Add `Paused` to `LeadStage` enum
2. Add fields to Lead: `opportunityId` (String?, FK, unique), `convertedAt` (DateTime?), `disqualifyReason` (String?), `pausedUntil` (DateTime?)
3. **Drop `@@unique([company])` constraint on Lead** — allow multiple leads per company
4. Add field to Opportunity: `source` (String, default "")
5. **Change Opportunity defaults:** `stage` default from `Identified` to `Discovery`, `probability` default from `5` to `15`
6. Add `Customer` to `AccountStatus` enum
7. Rename OppStage enum values (see full mapping table in Section 3):
   - `Identified` → `Discovery`
   - `Contacted` → `Discovery`
   - `Qualified` → `Evaluation`
   - `SolutionFit` → `Evaluation`
   - `VerbalCommit` → `Commit`
   - `ClosedWon` → `Won`
   - `ClosedLost` → `Lost`
   - `Discovery`, `Proposal`, `Negotiation` remain unchanged

### Data migration

1. Map existing opportunities to new stages (see full mapping table in Section 3). Existing `Discovery`, `Proposal`, and `Negotiation` opportunities stay as-is.
2. Update probability values on all existing opportunities to match new STAGE_PROB mapping (Discovery:15, Evaluation:35, Proposal:55, Negotiation:75, Commit:90, Won:100, Lost:0)
3. Existing converted leads without opportunities: create an Opportunity in `Discovery` for each, linked to their Account. Set `source` from lead.source. Set `source = "Migration"` if lead.source is empty. Activity: "Back-created during v2 migration."
4. Backfill `lead.opportunityId`: for converted leads, match by Account + creation timestamp proximity (within 1 minute of lead updatedAt). If multiple matches or no match found, leave `opportunityId` as null and log the lead ID for manual review. These edge cases should be rare given the current dataset size.
5. Backfill `lead.convertedAt`: set to `lead.updatedAt` for all leads with stage = Converted
6. Backfill `opportunity.source` from matched leads, default "" where no match
7. Accounts with any `Won` opportunity: set status to `Customer`
8. **Update seed data** (`prisma/seed.ts`): replace all old OppStage values with new ones

### Activity type note

The current `ActivityType` enum is `Email | Meeting | Call | Note`. Conversion events, stage changes, pause/resume events use `type = Note` with a structured `summary` and `source = "Pipeline"` or `source = "System"`. This is consistent with how stage moves are already logged (type=Note, source="Pipeline"). No new enum value needed.

### Code changes

- **Types/constants:** Update `OppStage` type, `STAGE_PROB` mapping, `KANBAN_STAGES` array, `STAGE_COLOR` mapping
- **Schemas:** Update lead action schemas (add pause, requalify; require disqualifyReason). Update opportunity schemas (new stage values)
- **API routes:**
  - Leads: add `pause` and `requalify` actions, make conversion always create opportunity, remove optional opp logic, set health from FIUAC, set source
  - Opportunities: update stage validation, add forward-only constraint logic, update close_won to set Account status to Customer
- **UI — Leads page:** Convert drawer → convert modal, "Create Deal" CTA on Qualified cards, Paused tab, disqualify reason dropdown, pause action with date picker
- **UI — Pipeline page:** 5 kanban columns (new names), forward-only drag, source pill on cards, "Show Closed" toggle
- **UI — Account detail:** "Sourced from" link section, Customer status badge
- **UI — Opportunity detail:** "Originated from" link, source badge
- **Adapters:** Update `adaptOpportunity` for new source field, update stage-related display logic
- **Agents:** Update lead qualifier to handle Paused stage, update stage references
- **Query hooks:** Update optimistic update logic for new stages, add pause/requalify mutations

### Risks

| Risk | Mitigation |
|---|---|
| Stage rename breaks hardcoded string comparisons | Thorough grep for all old stage names before deploy |
| Existing kanban drag logic needs forward-only constraint | Add stage ordering check in drop handler |
| Users confused by stage rename on first load | One-time toast notification explaining changes |
| Back-created opportunities from migration may have incomplete data | Flag with `source = "Migration"` for filtering |
| Account `@unique` on `name` is case-sensitive in PostgreSQL | Conversion already uses case-insensitive matching in app logic. Consider adding a case-insensitive unique index if needed, but app-level check is sufficient for now |
| In-flight API responses may reference old stage names during deploy | Frontend and backend deploy together (Next.js). No separate API consumers exist currently. No versioning needed. |

---

## 10. Product Backlog

### Must-have (ship v2 with these)

| # | Item | Why | Impact | Complexity | Dependencies |
|---|---|---|---|---|---|
| 1 | Schema migration (new fields, enum changes) | Foundation for everything else | Critical | Medium | None |
| 2 | Data migration script (stage mapping, backfill FKs) | Clean transition from v1 | Critical | Medium | #1 |
| 3 | Mandatory opportunity creation on conversion | Eliminates dead-end qualified leads | Critical | Low | #1 |
| 4 | Conversion modal (replaces drawer, pre-filled, redirect) | Makes conversion feel like creating a deal | High | Medium | #3 |
| 5 | FIUAC → Deal Health seeding on conversion | Preserves qualification data as deal intelligence | High | Low | #3 |
| 6 | New OppStage enum + probability mapping in code | Removes confusion, cleans pipeline | High | Medium | #1 |
| 7 | Pipeline kanban with 5 columns + forward-only drag | Clean, focused pipeline view | High | Medium | #6 |
| 8 | Source field on Opportunity + source pill on cards | Enables revenue-by-source analytics | High | Low | #1 |
| 9 | Cross-links in UI (Lead ↔ Opportunity, Lead → Account) | Users can trace lineage | Medium | Low | #1 |
| 10 | Disqualify reason (required dropdown) | Enables disqualification analytics | Medium | Low | #1 |

### Should-have (next sprint after v2)

| # | Item | Why | Impact | Complexity | Dependencies |
|---|---|---|---|---|---|
| 11 | Paused lead stage + pausedUntil + auto-resume | Handles "good fit, bad timing" without disqualifying | Medium | Medium | #1 |
| 12 | Requalification flow (Disqualified → Researching) | Handles "they came back" scenarios | Low | Low | #1 |
| 13 | Account auto-promote to Customer on first Won deal | Reflects real account lifecycle | Medium | Low | #6 |
| 14 | Lead aging alerts (>14 days in Qualified) | Prevents qualified leads from rotting | Medium | Low | None |
| 15 | Opportunity stage regression via dropdown (not drag) | Prevents accidental stage rollbacks | Medium | Low | #7 |

### Nice-to-have (future iterations)

| # | Item | Why | Impact | Complexity | Dependencies |
|---|---|---|---|---|---|
| 16 | Unified activity timeline on Account (across leads + opps) | Single pane of glass for account history | Medium | Medium | #9 |
| 17 | Full-funnel reporting dashboard | The killer metric view | High | High | #8, #9 |
| 18 | Expansion opportunity flow (skip lead, create directly on Account) | Handles upsell/cross-sell | Medium | Low | None |
| 19 | Batch conversion UX (select multiple qualified leads, convert together) | Saves time after conferences | Medium | Medium | #4 |
| 20 | Lead source attribution on Won deals (auto-surfaced card) | "This deal came from Signal X on date Y" | Medium | Low | #8, #9 |
