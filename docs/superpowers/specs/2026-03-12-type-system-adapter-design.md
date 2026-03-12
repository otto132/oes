# Type System Adapter Design

**Date:** 2026-03-12
**Scope:** T-01, T-02, T-03, T-04 from BACKLOG.md
**Status:** Approved

## Problem

Prisma schema and UI types diverge in three ways:

1. **Enum values** — Prisma uses camelCase without spaces (`SolutionFit`, `ClosedWon`, `EconomicBuyer`, `new_signal`, `InProgress`). UI types use display strings (`'Solution Fit'`, `'Closed Won'`, `'Economic Buyer'`, `'new'`, `'In Progress'`).

2. **Field names** — Prisma uses full names (`amount`, `initials`, `color`, `source`, `confidence`). UI types use abbreviations (`amt`, `ini`, `ac`, `src`, `conf`).

3. **Composite types** — UI groups scores into objects (`FIUACScores: {f, i, u, a, c}`, `DealHealth: {eng, stake, comp, time}`). Prisma stores them as individual columns (`scoreFit`, `scoreIntent`, `scoreUrgency`, `scoreAccess`, `scoreCommercial`, `healthEngagement`, `healthStakeholders`, `healthCompetitive`, `healthTimeline`).

## Decision

**Adapt at the API boundary.** Keep all existing UI types and page components unchanged. Create pure adapter functions that convert Prisma records to UI interfaces. Adapters are used only in API routes when returning data.

This minimizes blast radius — no page or component changes needed.

## Design

### File: `src/lib/adapters.ts`

Estimated ~200-250 lines. Pure functions, no side effects, no imports beyond Prisma types and UI types.

### Conventions

- **DateTime-to-string**: All `DateTime` fields are converted to ISO 8601 strings via `.toISOString()`. The UI already handles formatting via utility functions (`fDate`, `fRelative`).
- **Float-to-string coercion**: `Signal.confidence` and `Lead.confidence` are `Float` in Prisma but `string` in the UI type. Convert via `.toFixed(2)` to produce strings like `"0.85"`.
- **Pass-through fields**: Fields that share the same name and compatible type in both Prisma and UI (e.g., `id`, `name`, `title`, `email`, `phone`) are passed through without transformation. Only divergent fields are listed in the mapping tables.
- **Dropped fields**: Prisma fields with no UI counterpart (e.g., `Signal.companies`, `Opportunity.winNotes`, `Opportunity.competitorBeaten`) are intentionally omitted from adapter output.

### Enum Maps

Bidirectional maps for enums that differ between Prisma and UI:

| Enum | Prisma Value | UI Value |
|------|-------------|----------|
| OppStage | `SolutionFit` | `'Solution Fit'` |
| OppStage | `ClosedWon` | `'Closed Won'` |
| OppStage | `ClosedLost` | `'Closed Lost'` |
| OppStage | `VerbalCommit` | `'Verbal Commit'` |
| ContactRole | `EconomicBuyer` | `'Economic Buyer'` |
| ContactRole | `TechnicalBuyer` | `'Technical Buyer'` |
| SignalStatus | `new_signal` | `'new'` |
| TaskStatus | `InProgress` | `'In Progress'` |
| TaskStatus | `InReview` | `'In Review'` |

All other enum values pass through unchanged (e.g., `Identified` stays `'Identified'`).

Implemented as `Record<PrismaEnum, UIString>` constants with a generic lookup helper that falls back to the original value for unmapped entries.

### Composite Type Helpers

```typescript
// FIUAC: individual Prisma columns -> UI object
function adaptFIUAC(row: { scoreFit: number; scoreIntent: number; scoreUrgency: number; scoreAccess: number; scoreCommercial: number }): FIUACScores
// Returns: { f: row.scoreFit, i: row.scoreIntent, u: row.scoreUrgency, a: row.scoreAccess, c: row.scoreCommercial }

// DealHealth: individual Prisma columns -> UI object
function adaptHealth(row: { healthEngagement: number; healthStakeholders: number; healthCompetitive: number; healthTimeline: number }): DealHealth
// Returns: { eng: row.healthEngagement, stake: row.healthStakeholders, comp: row.healthCompetitive, time: row.healthTimeline }
```

### Entity Adapters

Each takes a Prisma record (with includes as needed) and returns the corresponding UI interface. Key mappings listed below; pass-through fields omitted for brevity.

| Function | Input (Prisma) | Output (UI) | Key Mappings |
|----------|---------------|-------------|--------------|
| `adaptUser` | `User` | `User` | `initials->ini`, `color->ac` |
| `adaptSignal` | `Signal` | `Signal` | `source->src`, `sourceUrl->srcUrl`, `detectedAt->at` (ISO string), `summary->sum`, `relevance->rel`, `confidence->conf` (Float->string via `.toFixed(2)`), `reasoning->why`, `status: new_signal->'new'`. Drops `companies`. |
| `adaptLead` | `Lead` + owner | `Lead` | `source->src`, `moduleFit->fit`, `confidence->conf` (Float->string), `adaptFIUAC()` for scores, `createdAt` (ISO string), owner via `adaptUser` |
| `adaptAccount` | `Account` + owner + contacts | `Account` | `adaptFIUAC()`, `countryCode->cc`, `pipelineValue->pipe`, `lastActivityAt->lastAct` (ISO string), `moduleFit->fit`, `aiConfidence->aiConf`, contacts via `adaptContact`, owner via `adaptUser`. Pass-through: `pain`, `whyNow`, `competitors`, `schemes`, `region`, `status`, `type`. |
| `adaptContact` | `Contact` | `Contact` | `role: EconomicBuyer->'Economic Buyer'`, `TechnicalBuyer->'Technical Buyer'` |
| `adaptOpportunity` | `Opportunity` + account + owner | `Opportunity` | `amount->amt`, `probability->prob`, `closeDate->close` (ISO string), `adaptHealth()`, `nextAction->next` (null->`''`), `nextActionDate->nextDate` (ISO string or `''`), `account.name->accName`, `account.id->accId`, stage enum map, `lossCompetitor->lossComp`, owner via `adaptUser`. Drops `winNotes`, `competitorBeaten`. |
| `adaptTask` | `Task` + relations | `Task` | `account.name->accName`, `account.id->accId`, `priority->pri`, `source->src`, `due` (ISO string), status enum map, owner/assignees/reviewer via `adaptUser`, comments via `adaptTaskComment` |
| `adaptTaskComment` | `TaskComment` + author | `TaskComment` | `author->by` (via `adaptUser`), `createdAt->at` (ISO string), pass-through: `text`, `mentions` |
| `adaptGoal` | `Goal` + account + owner | `Goal` | `account.name->accName`, `account.id->accId`, owner via `adaptUser` |
| `adaptQueueItem` | `QueueItem` | `QueueItem` | `confidence->conf`, `confidenceBreakdown->confBreak`, `priority->pri` (Note: Prisma `Normal` maps to UI `'Normal'` — QueueItem.pri is a string, not TaskPriority), `createdAt` (ISO string) |
| `adaptEmail` | `InboxEmail` | `Email` | `subject->subj`, `fromEmail->from`, `preview->prev`, `receivedAt->dt` (ISO string), `classification->cls`, `classificationConf->clsConf`, `isUnread->unread`, `isArchived->archived`, `isLinked->linked`, `accountName->acc`, `accountId->accId`, `classifierAgent->agent`. Pass-through: `fromName`, `domain`. |
| `adaptMeeting` | `Meeting` | `Meeting` | `startTime->time`, `duration->dur`, `accountName->acc`, `accountId->accId`, `attendees->who`, `prepStatus->prep`, `date` (ISO string) |
| `adaptActivity` | `Activity` + author + account | `Activity` | `summary->sum`, `source->src`, `createdAt->date` (ISO string), `accountId->accId`, `account.name->accName` (requires include or denormalized), author via `adaptUser->who`. Pass-through: `detail`. |

### Usage Pattern

```typescript
// In an API route:
import { adaptOpportunity } from '@/lib/adapters';

const dbOpps = await prisma.opportunity.findMany({
  include: { account: true, owner: true }
});

return dbOpps.map(adaptOpportunity);
```

## What This Does NOT Change

- No UI type definitions modified
- No page components modified
- No store.ts modified
- No data.ts modified (still used for mock data until T-05)
- No CSS or styling changes

## Testing Strategy

Unit tests for:
- Each enum map (round-trip Prisma->UI->Prisma)
- `adaptFIUAC` and `adaptHealth` with known inputs
- Each entity adapter with minimal mock Prisma records
- Edge cases: null/optional fields, default values
- Type coercions: Float-to-string for confidence fields, DateTime-to-string
