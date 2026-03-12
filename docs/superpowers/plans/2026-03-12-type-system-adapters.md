# Type System Adapters Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create pure adapter functions that convert Prisma database records to the abbreviated UI types used by all page components.

**Architecture:** Single module `src/lib/adapters.ts` with enum lookup maps, two composite-type helpers (`adaptFIUAC`, `adaptHealth`), and 14 entity adapter functions. Tests in `src/lib/__tests__/adapters.test.ts` using Vitest.

**Tech Stack:** TypeScript, Vitest (new dev dependency), Prisma enums (imported as types only)

**Spec:** `docs/superpowers/specs/2026-03-12-type-system-adapter-design.md`

---

## Chunk 1: Test Infrastructure + Enum Maps + Composite Helpers

### Task 1: Install Vitest

**Files:**
- Modify: `package.json` (add vitest devDependency + test script)

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add test script to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verify vitest runs**

```bash
npx vitest run
```

Expected: exits cleanly with "no test files found" (or similar). No errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Enum Maps — Write Tests

**Files:**
- Create: `src/lib/__tests__/adapters.test.ts`

- [ ] **Step 1: Write failing tests for enum maps**

```typescript
import { describe, it, expect } from 'vitest';
import {
  mapOppStage,
  mapContactRole,
  mapSignalStatus,
  mapTaskStatus,
} from '../adapters';

describe('mapOppStage', () => {
  it('maps SolutionFit to Solution Fit', () => {
    expect(mapOppStage('SolutionFit')).toBe('Solution Fit');
  });
  it('maps ClosedWon to Closed Won', () => {
    expect(mapOppStage('ClosedWon')).toBe('Closed Won');
  });
  it('maps ClosedLost to Closed Lost', () => {
    expect(mapOppStage('ClosedLost')).toBe('Closed Lost');
  });
  it('maps VerbalCommit to Verbal Commit', () => {
    expect(mapOppStage('VerbalCommit')).toBe('Verbal Commit');
  });
  it('passes through Identified unchanged', () => {
    expect(mapOppStage('Identified')).toBe('Identified');
  });
  it('passes through Proposal unchanged', () => {
    expect(mapOppStage('Proposal')).toBe('Proposal');
  });
});

describe('mapContactRole', () => {
  it('maps EconomicBuyer to Economic Buyer', () => {
    expect(mapContactRole('EconomicBuyer')).toBe('Economic Buyer');
  });
  it('maps TechnicalBuyer to Technical Buyer', () => {
    expect(mapContactRole('TechnicalBuyer')).toBe('Technical Buyer');
  });
  it('passes through Champion unchanged', () => {
    expect(mapContactRole('Champion')).toBe('Champion');
  });
});

describe('mapSignalStatus', () => {
  it('maps new_signal to new', () => {
    expect(mapSignalStatus('new_signal')).toBe('new');
  });
  it('passes through reviewed unchanged', () => {
    expect(mapSignalStatus('reviewed')).toBe('reviewed');
  });
});

describe('mapTaskStatus', () => {
  it('maps InProgress to In Progress', () => {
    expect(mapTaskStatus('InProgress')).toBe('In Progress');
  });
  it('maps InReview to In Review', () => {
    expect(mapTaskStatus('InReview')).toBe('In Review');
  });
  it('passes through Open unchanged', () => {
    expect(mapTaskStatus('Open')).toBe('Open');
  });
  it('passes through Done unchanged', () => {
    expect(mapTaskStatus('Done')).toBe('Done');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/adapters.test.ts
```

Expected: FAIL — `../adapters` module not found.

---

### Task 3: Enum Maps — Implement

**Files:**
- Create: `src/lib/adapters.ts`

- [ ] **Step 1: Implement enum maps**

```typescript
// ═══════════════════════════════════════════════════════════════
// Eco-Insight — Prisma → UI Type Adapters
// ═══════════════════════════════════════════════════════════════
// Pure functions that convert Prisma database records to the
// abbreviated UI types in src/lib/types.ts.
// Used at API boundaries only — pages stay unchanged.

import type {
  FIUACScores,
  DealHealth,
  User as UIUser,
  Signal as UISignal,
  Lead as UILead,
  Contact as UIContact,
  Account as UIAccount,
  Opportunity as UIOpportunity,
  Task as UITask,
  TaskComment as UITaskComment,
  Goal as UIGoal,
  QueueItem as UIQueueItem,
  Email as UIEmail,
  Meeting as UIMeeting,
  Activity as UIActivity,
  OppStage,
  ContactRole,
  SignalStatus,
  TaskStatus,
} from './types';

// ── Enum Maps ────────────────────────────────────────────────
// Maps Prisma enum values to UI display strings.
// Only divergent values listed; unmapped values pass through.

const OPP_STAGE_MAP: Record<string, string> = {
  SolutionFit: 'Solution Fit',
  ClosedWon: 'Closed Won',
  ClosedLost: 'Closed Lost',
  VerbalCommit: 'Verbal Commit',
};

const CONTACT_ROLE_MAP: Record<string, string> = {
  EconomicBuyer: 'Economic Buyer',
  TechnicalBuyer: 'Technical Buyer',
};

const SIGNAL_STATUS_MAP: Record<string, string> = {
  new_signal: 'new',
};

const TASK_STATUS_MAP: Record<string, string> = {
  InProgress: 'In Progress',
  InReview: 'In Review',
};

function mapEnum(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export function mapOppStage(v: string): OppStage {
  return mapEnum(OPP_STAGE_MAP, v) as OppStage;
}

export function mapContactRole(v: string): ContactRole {
  return mapEnum(CONTACT_ROLE_MAP, v) as ContactRole;
}

export function mapSignalStatus(v: string): SignalStatus {
  return mapEnum(SIGNAL_STATUS_MAP, v) as SignalStatus;
}

export function mapTaskStatus(v: string): TaskStatus {
  return mapEnum(TASK_STATUS_MAP, v) as TaskStatus;
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/adapters.test.ts
```

Expected: All 14 enum tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add Prisma-to-UI enum maps with tests (T-01)"
```

---

### Task 4: Composite Type Helpers — Write Tests

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`

- [ ] **Step 1: Add tests for adaptFIUAC and adaptHealth**

Append to `adapters.test.ts`:

```typescript
import { adaptFIUAC, adaptHealth } from '../adapters';

describe('adaptFIUAC', () => {
  it('maps individual score columns to {f,i,u,a,c}', () => {
    const row = {
      scoreFit: 80,
      scoreIntent: 70,
      scoreUrgency: 60,
      scoreAccess: 50,
      scoreCommercial: 90,
    };
    expect(adaptFIUAC(row)).toEqual({ f: 80, i: 70, u: 60, a: 50, c: 90 });
  });
});

describe('adaptHealth', () => {
  it('maps individual health columns to {eng,stake,comp,time}', () => {
    const row = {
      healthEngagement: 75,
      healthStakeholders: 40,
      healthCompetitive: 60,
      healthTimeline: 80,
    };
    expect(adaptHealth(row)).toEqual({ eng: 75, stake: 40, comp: 60, time: 80 });
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run src/lib/__tests__/adapters.test.ts
```

Expected: New `adaptFIUAC` and `adaptHealth` tests FAIL (not exported yet).

---

### Task 5: Composite Type Helpers — Implement

**Files:**
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Add adaptFIUAC and adaptHealth to adapters.ts**

Append after the enum maps section:

```typescript
// ── Composite Type Helpers ───────────────────────────────────

export function adaptFIUAC(row: {
  scoreFit: number;
  scoreIntent: number;
  scoreUrgency: number;
  scoreAccess: number;
  scoreCommercial: number;
}): FIUACScores {
  return {
    f: row.scoreFit,
    i: row.scoreIntent,
    u: row.scoreUrgency,
    a: row.scoreAccess,
    c: row.scoreCommercial,
  };
}

export function adaptHealth(row: {
  healthEngagement: number;
  healthStakeholders: number;
  healthCompetitive: number;
  healthTimeline: number;
}): DealHealth {
  return {
    eng: row.healthEngagement,
    stake: row.healthStakeholders,
    comp: row.healthCompetitive,
    time: row.healthTimeline,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/adapters.test.ts
```

Expected: All 16 tests PASS (14 enum + 2 composite).

- [ ] **Step 3: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add FIUAC and DealHealth composite adapters with tests (T-02, T-03)"
```

---

## Chunk 2: Entity Adapters — Simple Entities

### Task 6: adaptUser — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing test for adaptUser**

Append to test file:

```typescript
import { adaptUser } from '../adapters';

describe('adaptUser', () => {
  it('maps Prisma User to UI User', () => {
    const prismaUser = {
      id: 'u1',
      name: 'Juuso Mäkinen',
      initials: 'JM',
      email: 'juuso@eco.fi',
      role: 'Sales Lead',
      color: 'emerald',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };
    const result = adaptUser(prismaUser);
    expect(result).toEqual({
      id: 'u1',
      name: 'Juuso Mäkinen',
      ini: 'JM',
      role: 'Sales Lead',
      ac: 'emerald',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/adapters.test.ts -t "adaptUser"
```

Expected: FAIL — `adaptUser` not exported.

- [ ] **Step 3: Implement adaptUser**

Append to `src/lib/adapters.ts`:

```typescript
// ── Entity Adapters ──────────────────────────────────────────

// Prisma input types — defined inline to avoid importing @prisma/client
// (which requires a generated client). These match the Prisma model shapes.

export function adaptUser(u: {
  id: string;
  name: string;
  initials: string;
  role: string;
  color: string;
  [k: string]: unknown;
}): UIUser {
  return {
    id: u.id,
    name: u.name,
    ini: u.initials,
    role: u.role,
    ac: u.color,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/adapters.test.ts -t "adaptUser"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptUser adapter with test (T-04)"
```

---

### Task 7: adaptContact — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { adaptContact } from '../adapters';

describe('adaptContact', () => {
  it('maps EconomicBuyer role to Economic Buyer', () => {
    const prisma = {
      id: 'c1', name: 'Anna Virtanen', title: 'CFO',
      role: 'EconomicBuyer' as const, warmth: 'Warm' as const,
      email: 'anna@example.com', phone: null,
      linkedinUrl: null, createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1',
    };
    const result = adaptContact(prisma);
    expect(result.role).toBe('Economic Buyer');
    expect(result.id).toBe('c1');
    expect(result.phone).toBeUndefined();
  });

  it('passes through Champion role unchanged', () => {
    const prisma = {
      id: 'c2', name: 'Pekka', title: 'VP',
      role: 'Champion' as const, warmth: 'Strong' as const,
      email: 'p@e.com', phone: '+358123',
      linkedinUrl: null, createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1',
    };
    expect(adaptContact(prisma).role).toBe('Champion');
    expect(adaptContact(prisma).phone).toBe('+358123');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptContact**

```typescript
export function adaptContact(c: {
  id: string;
  name: string;
  title: string;
  role: string;
  warmth: string;
  email: string;
  phone: string | null;
  [k: string]: unknown;
}): UIContact {
  return {
    id: c.id,
    name: c.name,
    title: c.title,
    role: mapContactRole(c.role),
    warmth: c.warmth as UIContact['warmth'],
    email: c.email,
    ...(c.phone ? { phone: c.phone } : {}),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptContact adapter with test (T-04)"
```

---

### Task 8: adaptSignal — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { adaptSignal } from '../adapters';

describe('adaptSignal', () => {
  it('maps all divergent fields correctly', () => {
    const prisma = {
      id: 's1', type: 'ppa_announcement' as const, title: 'Nordic PPA deal',
      summary: 'A new PPA...', reasoning: 'Indicates expansion',
      source: 'Reuters Energy', sourceUrl: 'https://reuters.com/123',
      relevance: 85, confidence: 0.92,
      agent: 'Signal Hunter', status: 'new_signal' as const,
      detectedAt: new Date('2026-03-01T10:00:00Z'),
      createdAt: new Date('2026-03-01T10:00:00Z'),
      companies: ['Vattenfall'],
    };
    const result = adaptSignal(prisma);
    expect(result.src).toBe('Reuters Energy');
    expect(result.srcUrl).toBe('https://reuters.com/123');
    expect(result.at).toBe('2026-03-01T10:00:00.000Z');
    expect(result.sum).toBe('A new PPA...');
    expect(result.rel).toBe(85);
    expect(result.conf).toBe('0.92');
    expect(result.why).toBe('Indicates expansion');
    expect(result.status).toBe('new');
    expect(result.agent).toBe('Signal Hunter');
    // companies is dropped
    expect(result).not.toHaveProperty('companies');
  });

  it('handles null sourceUrl', () => {
    const prisma = {
      id: 's2', type: 'conference' as const, title: 'Event',
      summary: 'Sum', reasoning: 'Why',
      source: 'Manual', sourceUrl: null,
      relevance: 50, confidence: 0.5,
      agent: 'Signal Hunter', status: 'reviewed' as const,
      detectedAt: new Date(), createdAt: new Date(),
      companies: [],
    };
    expect(adaptSignal(prisma).srcUrl).toBeNull();
    expect(adaptSignal(prisma).status).toBe('reviewed');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptSignal**

```typescript
export function adaptSignal(s: {
  id: string;
  type: string;
  title: string;
  summary: string;
  reasoning: string;
  source: string;
  sourceUrl: string | null;
  relevance: number;
  confidence: number;
  agent: string;
  status: string;
  detectedAt: Date;
  [k: string]: unknown;
}): UISignal {
  return {
    id: s.id,
    type: s.type as UISignal['type'],
    title: s.title,
    src: s.source,
    srcUrl: s.sourceUrl,
    at: s.detectedAt.toISOString(),
    sum: s.summary,
    rel: s.relevance,
    conf: s.confidence.toFixed(2),
    why: s.reasoning,
    status: mapSignalStatus(s.status),
    agent: s.agent,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptSignal adapter with test (T-04)"
```

---

### Task 9: adaptLead — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { adaptLead } from '../adapters';

describe('adaptLead', () => {
  it('maps Prisma Lead with owner to UI Lead', () => {
    const prisma = {
      id: 'l1', company: 'Vattenfall', domain: 'vattenfall.com',
      source: 'Signal', signalId: 's1',
      type: 'Utility' as const, country: 'Sweden', region: 'Nordics',
      stage: 'New' as const, pain: 'Registry complexity',
      scoreFit: 80, scoreIntent: 70, scoreUrgency: 60,
      scoreAccess: 50, scoreCommercial: 90,
      moduleFit: ['GoO Trading', 'Registry'],
      confidence: 0.85,
      createdAt: new Date('2026-02-15T08:00:00Z'),
      updatedAt: new Date('2026-02-15'),
      ownerId: 'u1',
      owner: {
        id: 'u1', name: 'Juuso', initials: 'JM',
        email: 'j@e.fi', role: 'Sales', color: 'emerald',
        createdAt: new Date(), updatedAt: new Date(),
      },
    };
    const result = adaptLead(prisma);
    expect(result.src).toBe('Signal');
    expect(result.signalId).toBe('s1');
    expect(result.fit).toEqual(['GoO Trading', 'Registry']);
    expect(result.scores).toEqual({ f: 80, i: 70, u: 60, a: 50, c: 90 });
    expect(result.conf).toBe('0.85');
    expect(result.owner.ini).toBe('JM');
    expect(result.createdAt).toBe('2026-02-15T08:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptLead**

```typescript
export function adaptLead(l: {
  id: string;
  company: string;
  domain: string;
  source: string;
  signalId: string | null;
  type: string;
  country: string;
  region: string;
  stage: string;
  pain: string;
  scoreFit: number;
  scoreIntent: number;
  scoreUrgency: number;
  scoreAccess: number;
  scoreCommercial: number;
  moduleFit: string[];
  confidence: number;
  createdAt: Date;
  owner: Parameters<typeof adaptUser>[0];
  [k: string]: unknown;
}): UILead {
  return {
    id: l.id,
    company: l.company,
    domain: l.domain,
    src: l.source,
    signalId: l.signalId,
    type: l.type,
    country: l.country,
    region: l.region,
    stage: l.stage as UILead['stage'],
    pain: l.pain,
    fit: l.moduleFit,
    scores: adaptFIUAC(l),
    conf: l.confidence.toFixed(2),
    owner: adaptUser(l.owner),
    createdAt: l.createdAt.toISOString(),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptLead adapter with test (T-04)"
```

---

## Chunk 3: Entity Adapters — Complex Entities

### Task 10: adaptAccount — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { adaptAccount } from '../adapters';

describe('adaptAccount', () => {
  it('maps Prisma Account with owner and contacts', () => {
    const owner = {
      id: 'u1', name: 'Juuso', initials: 'JM',
      email: 'j@e.fi', role: 'Sales', color: 'emerald',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = {
      id: 'a1', name: 'Vattenfall', type: 'Utility' as const,
      country: 'Sweden', countryCode: 'SE', region: 'Nordics',
      status: 'Active' as const, schemes: ['GoO', 'EECS'],
      scoreFit: 85, scoreIntent: 70, scoreUrgency: 60,
      scoreAccess: 50, scoreCommercial: 80,
      pipelineValue: 250000, lastActivityAt: new Date('2026-03-10T14:00:00Z'),
      pain: 'Manual reconciliation', whyNow: 'Audit deadline',
      moduleFit: ['GoO Trading'], competitors: 'Competitor A',
      aiConfidence: 0.88, aiUpdatedAt: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
      ownerId: 'u1', owner,
      contacts: [{
        id: 'c1', name: 'Anna', title: 'CFO',
        role: 'EconomicBuyer' as const, warmth: 'Warm' as const,
        email: 'a@v.com', phone: null,
        linkedinUrl: null, createdAt: new Date(), updatedAt: new Date(),
        accountId: 'a1',
      }],
    };
    const result = adaptAccount(prisma);
    expect(result.cc).toBe('SE');
    expect(result.pipe).toBe(250000);
    expect(result.lastAct).toBe('2026-03-10T14:00:00.000Z');
    expect(result.fit).toEqual(['GoO Trading']);
    expect(result.aiConf).toBe(0.88);
    expect(result.scores).toEqual({ f: 85, i: 70, u: 60, a: 50, c: 80 });
    expect(result.owner.ini).toBe('JM');
    expect(result.contacts[0].role).toBe('Economic Buyer');
    expect(result.pain).toBe('Manual reconciliation');
    expect(result.whyNow).toBe('Audit deadline');
    expect(result.competitors).toBe('Competitor A');
    expect(result.schemes).toEqual(['GoO', 'EECS']);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptAccount**

```typescript
export function adaptAccount(a: {
  id: string;
  name: string;
  type: string;
  country: string;
  countryCode: string;
  region: string;
  status: string;
  schemes: string[];
  scoreFit: number;
  scoreIntent: number;
  scoreUrgency: number;
  scoreAccess: number;
  scoreCommercial: number;
  pipelineValue: number;
  lastActivityAt: Date;
  pain: string;
  whyNow: string;
  moduleFit: string[];
  competitors: string | null;
  aiConfidence: number;
  owner: Parameters<typeof adaptUser>[0];
  contacts: Parameters<typeof adaptContact>[0][];
  [k: string]: unknown;
}): UIAccount {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    country: a.country,
    cc: a.countryCode,
    region: a.region,
    status: a.status as UIAccount['status'],
    schemes: a.schemes as UIAccount['schemes'],
    scores: adaptFIUAC(a),
    owner: adaptUser(a.owner),
    pipe: a.pipelineValue,
    lastAct: a.lastActivityAt.toISOString(),
    pain: a.pain,
    whyNow: a.whyNow,
    fit: a.moduleFit,
    aiConf: a.aiConfidence,
    ...(a.competitors != null ? { competitors: a.competitors } : {}),
    contacts: a.contacts.map(adaptContact),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptAccount adapter with test (T-04)"
```

---

### Task 11: adaptOpportunity — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { adaptOpportunity } from '../adapters';

describe('adaptOpportunity', () => {
  const owner = {
    id: 'u1', name: 'Juuso', initials: 'JM',
    email: 'j@e.fi', role: 'Sales', color: 'emerald',
    createdAt: new Date(), updatedAt: new Date(),
  };

  it('maps all fields including health and stage', () => {
    const prisma = {
      id: 'o1', name: 'GoO Platform Deal',
      stage: 'SolutionFit' as const,
      amount: 120000, probability: 50,
      closeDate: new Date('2026-06-30T00:00:00Z'),
      healthEngagement: 75, healthStakeholders: 40,
      healthCompetitive: 60, healthTimeline: 80,
      nextAction: 'Send proposal', nextActionDate: new Date('2026-03-20T00:00:00Z'),
      winNotes: null, competitorBeaten: null,
      lossReason: null, lossCompetitor: null, lossNotes: null,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1', ownerId: 'u1',
      account: { id: 'a1', name: 'Vattenfall' },
      owner,
    };
    const result = adaptOpportunity(prisma);
    expect(result.stage).toBe('Solution Fit');
    expect(result.amt).toBe(120000);
    expect(result.prob).toBe(50);
    expect(result.close).toBe('2026-06-30T00:00:00.000Z');
    expect(result.health).toEqual({ eng: 75, stake: 40, comp: 60, time: 80 });
    expect(result.next).toBe('Send proposal');
    expect(result.nextDate).toBe('2026-03-20T00:00:00.000Z');
    expect(result.accName).toBe('Vattenfall');
    expect(result.accId).toBe('a1');
    expect(result.owner.ini).toBe('JM');
  });

  it('handles null closeDate and nextAction', () => {
    const prisma = {
      id: 'o2', name: 'Early Deal',
      stage: 'Identified' as const,
      amount: 0, probability: 5,
      closeDate: null,
      healthEngagement: 50, healthStakeholders: 30,
      healthCompetitive: 50, healthTimeline: 70,
      nextAction: null, nextActionDate: null,
      winNotes: null, competitorBeaten: null,
      lossReason: null, lossCompetitor: null, lossNotes: null,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1', ownerId: 'u1',
      account: { id: 'a1', name: 'Vattenfall' },
      owner,
    };
    const result = adaptOpportunity(prisma);
    expect(result.close).toBe('');
    expect(result.next).toBe('');
    expect(result.nextDate).toBe('');
  });

  it('includes lossComp when present', () => {
    const prisma = {
      id: 'o3', name: 'Lost Deal',
      stage: 'ClosedLost' as const,
      amount: 50000, probability: 0,
      closeDate: new Date('2026-02-01T00:00:00Z'),
      healthEngagement: 20, healthStakeholders: 20,
      healthCompetitive: 20, healthTimeline: 20,
      nextAction: null, nextActionDate: null,
      winNotes: null, competitorBeaten: null,
      lossReason: 'Price', lossCompetitor: 'CompetitorX', lossNotes: null,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1', ownerId: 'u1',
      account: { id: 'a1', name: 'Vattenfall' },
      owner,
    };
    const result = adaptOpportunity(prisma);
    expect(result.stage).toBe('Closed Lost');
    expect(result.lossReason).toBe('Price');
    expect(result.lossComp).toBe('CompetitorX');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptOpportunity**

```typescript
export function adaptOpportunity(o: {
  id: string;
  name: string;
  stage: string;
  amount: number;
  probability: number;
  closeDate: Date | null;
  healthEngagement: number;
  healthStakeholders: number;
  healthCompetitive: number;
  healthTimeline: number;
  nextAction: string | null;
  nextActionDate: Date | null;
  lossReason: string | null;
  lossCompetitor: string | null;
  account: { id: string; name: string };
  owner: Parameters<typeof adaptUser>[0];
  [k: string]: unknown;
}): UIOpportunity {
  return {
    id: o.id,
    name: o.name,
    accId: o.account.id,
    accName: o.account.name,
    stage: mapOppStage(o.stage),
    amt: o.amount,
    prob: o.probability,
    close: o.closeDate ? o.closeDate.toISOString() : '',
    owner: adaptUser(o.owner),
    health: adaptHealth(o),
    next: o.nextAction ?? '',
    nextDate: o.nextActionDate ? o.nextActionDate.toISOString() : '',
    ...(o.lossReason ? { lossReason: o.lossReason } : {}),
    ...(o.lossCompetitor ? { lossComp: o.lossCompetitor } : {}),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptOpportunity adapter with test (T-04)"
```

---

### Task 12: adaptTask + adaptTaskComment — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { adaptTask } from '../adapters';

describe('adaptTask', () => {
  const owner = {
    id: 'u1', name: 'Juuso', initials: 'JM',
    email: 'j@e.fi', role: 'Sales', color: 'emerald',
    createdAt: new Date(), updatedAt: new Date(),
  };

  it('maps Prisma Task with all relations', () => {
    const prisma = {
      id: 't1', title: 'Follow up with CFO',
      status: 'InProgress' as const,
      priority: 'High' as const,
      due: new Date('2026-03-15T00:00:00Z'),
      source: 'Pipeline Hygiene Agent',
      completedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1',
      account: { id: 'a1', name: 'Vattenfall' },
      ownerId: 'u1', owner,
      assignees: [owner],
      reviewerId: null, reviewer: null,
      goalId: 'g1', goal: null,
      comments: [{
        id: 'tc1', text: 'Sent email',
        mentions: ['u2'],
        createdAt: new Date('2026-03-12T09:00:00Z'),
        taskId: 't1', authorId: 'u1',
        author: owner,
      }],
    };
    const result = adaptTask(prisma);
    expect(result.status).toBe('In Progress');
    expect(result.pri).toBe('High');
    expect(result.src).toBe('Pipeline Hygiene Agent');
    expect(result.accName).toBe('Vattenfall');
    expect(result.accId).toBe('a1');
    expect(result.due).toBe('2026-03-15T00:00:00.000Z');
    expect(result.goalId).toBe('g1');
    expect(result.comments[0].by.ini).toBe('JM');
    expect(result.comments[0].at).toBe('2026-03-12T09:00:00.000Z');
    expect(result.comments[0].mentions).toEqual(['u2']);
    expect(result.assignees![0].ini).toBe('JM');
  });

  it('handles null account and optional fields', () => {
    const prisma = {
      id: 't2', title: 'General task',
      status: 'Open' as const,
      priority: 'Medium' as const,
      due: null, source: 'Manual', completedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: null, account: null,
      ownerId: 'u1', owner,
      assignees: [], reviewerId: null, reviewer: null,
      goalId: null, goal: null, comments: [],
    };
    const result = adaptTask(prisma);
    expect(result.accName).toBe('');
    expect(result.accId).toBe('');
    expect(result.due).toBe('');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptTaskComment and adaptTask**

```typescript
export function adaptTaskComment(c: {
  text: string;
  mentions: string[];
  createdAt: Date;
  author: Parameters<typeof adaptUser>[0];
  [k: string]: unknown;
}): UITaskComment {
  return {
    by: adaptUser(c.author),
    text: c.text,
    at: c.createdAt.toISOString(),
    ...(c.mentions.length ? { mentions: c.mentions } : {}),
  };
}

export function adaptTask(t: {
  id: string;
  title: string;
  status: string;
  priority: string;
  due: Date | null;
  source: string;
  completedAt: Date | null;
  account: { id: string; name: string } | null;
  owner: Parameters<typeof adaptUser>[0];
  assignees: Parameters<typeof adaptUser>[0][];
  reviewer: Parameters<typeof adaptUser>[0] | null;
  goalId: string | null;
  comments: Parameters<typeof adaptTaskComment>[0][];
  [k: string]: unknown;
}): UITask {
  return {
    id: t.id,
    title: t.title,
    accName: t.account?.name ?? '',
    accId: t.account?.id ?? '',
    due: t.due ? t.due.toISOString() : '',
    owner: adaptUser(t.owner),
    ...(t.assignees.length ? { assignees: t.assignees.map(adaptUser) } : {}),
    pri: t.priority as UITask['pri'],
    status: mapTaskStatus(t.status),
    src: t.source,
    ...(t.goalId ? { goalId: t.goalId } : {}),
    ...(t.reviewer ? { reviewer: adaptUser(t.reviewer) } : {}),
    comments: t.comments.map(adaptTaskComment),
    ...(t.completedAt ? { completedAt: t.completedAt.toISOString() } : {}),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptTask and adaptTaskComment adapters with tests (T-04)"
```

---

## Chunk 4: Entity Adapters — Remaining Entities

### Task 13: adaptGoal + adaptQueueItem — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { adaptGoal, adaptQueueItem } from '../adapters';

describe('adaptGoal', () => {
  it('maps Prisma Goal to UI Goal', () => {
    const owner = {
      id: 'u1', name: 'Juuso', initials: 'JM',
      email: 'j@e.fi', role: 'Sales', color: 'emerald',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = {
      id: 'g1', title: 'Close Vattenfall by Q2',
      status: 'active' as const,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1',
      account: { id: 'a1', name: 'Vattenfall' },
      ownerId: 'u1', owner,
    };
    const result = adaptGoal(prisma);
    expect(result.accName).toBe('Vattenfall');
    expect(result.accId).toBe('a1');
    expect(result.owner.ini).toBe('JM');
    expect(result.status).toBe('active');
  });

  it('handles null account', () => {
    const owner = {
      id: 'u1', name: 'Juuso', initials: 'JM',
      email: 'j@e.fi', role: 'Sales', color: 'emerald',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = {
      id: 'g2', title: 'General goal',
      status: 'active' as const,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: null, account: null,
      ownerId: 'u1', owner,
    };
    const result = adaptGoal(prisma);
    expect(result.accName).toBe('');
    expect(result.accId).toBe('');
  });
});

describe('adaptQueueItem', () => {
  it('maps Prisma QueueItem to UI QueueItem', () => {
    const prisma = {
      id: 'q1', type: 'outreach_draft' as const,
      title: 'Draft email for Vattenfall',
      accName: 'Vattenfall', accId: 'a1',
      agent: 'Outreach Writer', confidence: 0.82,
      confidenceBreakdown: { relevance: 0.9, timing: 0.7 },
      sources: [{ name: 'LinkedIn', url: 'https://li.com/123' }],
      payload: { draft: 'Hello...' },
      reasoning: 'Strong fit signal',
      status: 'pending' as const,
      priority: 'High' as const,
      createdAt: new Date('2026-03-12T08:00:00Z'),
      reviewedById: null, reviewedAt: null, rejReason: null,
      originalPayload: null,
    };
    const result = adaptQueueItem(prisma);
    expect(result.conf).toBe(0.82);
    expect(result.confBreak).toEqual({ relevance: 0.9, timing: 0.7 });
    expect(result.pri).toBe('High');
    expect(result.createdAt).toBe('2026-03-12T08:00:00.000Z');
    expect(result.sources).toEqual([{ name: 'LinkedIn', url: 'https://li.com/123' }]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptGoal and adaptQueueItem**

```typescript
export function adaptGoal(g: {
  id: string;
  title: string;
  status: string;
  account: { id: string; name: string } | null;
  owner: Parameters<typeof adaptUser>[0];
  [k: string]: unknown;
}): UIGoal {
  return {
    id: g.id,
    title: g.title,
    accName: g.account?.name ?? '',
    accId: g.account?.id ?? '',
    owner: adaptUser(g.owner),
    status: g.status as UIGoal['status'],
  };
}

export function adaptQueueItem(q: {
  id: string;
  type: string;
  title: string;
  accName: string;
  accId: string | null;
  agent: string;
  confidence: number;
  confidenceBreakdown: unknown;
  sources: unknown;
  payload: unknown;
  reasoning: string;
  status: string;
  priority: string;
  createdAt: Date;
  reviewedById?: string | null;
  reviewedAt?: Date | null;
  rejReason?: string | null;
  [k: string]: unknown;
}): UIQueueItem {
  return {
    id: q.id,
    type: q.type as UIQueueItem['type'],
    title: q.title,
    accName: q.accName,
    accId: q.accId,
    agent: q.agent,
    conf: q.confidence,
    confBreak: q.confidenceBreakdown as Record<string, number>,
    reasoning: q.reasoning,
    sources: q.sources as UIQueueItem['sources'],
    payload: q.payload as Record<string, unknown>,
    status: q.status as UIQueueItem['status'],
    pri: q.priority,
    createdAt: q.createdAt.toISOString(),
    ...(q.reviewedById ? { reviewedBy: q.reviewedById } : {}),
    ...(q.reviewedAt ? { reviewedAt: q.reviewedAt.toISOString() } : {}),
    ...(q.rejReason ? { rejReason: q.rejReason } : {}),
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptGoal and adaptQueueItem adapters with tests (T-04)"
```

---

### Task 14: adaptEmail — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { adaptEmail } from '../adapters';

describe('adaptEmail', () => {
  it('maps all InboxEmail fields to UI Email', () => {
    const prisma = {
      id: 'e1', subject: 'Re: GoO Platform',
      fromEmail: 'anna@vattenfall.com', fromName: 'Anna Virtanen',
      preview: 'Thanks for the proposal...',
      receivedAt: new Date('2026-03-11T14:30:00Z'),
      isUnread: true, isArchived: false,
      classification: 'positive_reply' as const,
      classificationConf: 0.95,
      classifierAgent: 'Inbox Classifier',
      isLinked: true, accountId: 'a1',
      accountName: 'Vattenfall', domain: 'vattenfall.com',
      createdAt: new Date(),
    };
    const result = adaptEmail(prisma);
    expect(result.subj).toBe('Re: GoO Platform');
    expect(result.from).toBe('anna@vattenfall.com');
    expect(result.fromName).toBe('Anna Virtanen');
    expect(result.prev).toBe('Thanks for the proposal...');
    expect(result.dt).toBe('2026-03-11T14:30:00.000Z');
    expect(result.unread).toBe(true);
    expect(result.archived).toBe(false);
    expect(result.cls).toBe('positive_reply');
    expect(result.clsConf).toBe(0.95);
    expect(result.linked).toBe(true);
    expect(result.acc).toBe('Vattenfall');
    expect(result.accId).toBe('a1');
    expect(result.domain).toBe('vattenfall.com');
    expect(result.agent).toBe('Inbox Classifier');
  });

  it('handles null optional fields', () => {
    const prisma = {
      id: 'e2', subject: 'Hello',
      fromEmail: 'spam@example.com', fromName: 'Spammer',
      preview: 'Buy now...',
      receivedAt: new Date(),
      isUnread: true, isArchived: false,
      classification: 'spam' as const,
      classificationConf: 0.99,
      classifierAgent: 'Inbox Classifier',
      isLinked: false, accountId: null,
      accountName: null, domain: null,
      createdAt: new Date(),
    };
    const result = adaptEmail(prisma);
    expect(result.acc).toBeUndefined();
    expect(result.accId).toBeUndefined();
    expect(result.domain).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptEmail**

```typescript
export function adaptEmail(e: {
  id: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  preview: string;
  receivedAt: Date;
  isUnread: boolean;
  isArchived: boolean;
  classification: string;
  classificationConf: number;
  classifierAgent: string;
  isLinked: boolean;
  accountId: string | null;
  accountName: string | null;
  domain: string | null;
  [k: string]: unknown;
}): UIEmail {
  return {
    id: e.id,
    subj: e.subject,
    from: e.fromEmail,
    fromName: e.fromName,
    prev: e.preview,
    dt: e.receivedAt.toISOString(),
    unread: e.isUnread,
    archived: e.isArchived,
    cls: e.classification as UIEmail['cls'],
    clsConf: e.classificationConf,
    linked: e.isLinked,
    ...(e.accountName != null ? { acc: e.accountName } : {}),
    ...(e.accountId != null ? { accId: e.accountId } : {}),
    ...(e.domain != null ? { domain: e.domain } : {}),
    agent: e.classifierAgent,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptEmail adapter with test (T-04)"
```

---

### Task 15: adaptMeeting + adaptActivity — Test + Implement

**Files:**
- Modify: `src/lib/__tests__/adapters.test.ts`
- Modify: `src/lib/adapters.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { adaptMeeting, adaptActivity } from '../adapters';

describe('adaptMeeting', () => {
  it('maps Prisma Meeting to UI Meeting', () => {
    const prisma = {
      id: 'm1', title: 'Q2 Review',
      startTime: '14:00', duration: '60 min',
      date: new Date('2026-03-12T00:00:00Z'),
      attendees: ['Anna Virtanen', 'Pekka Laine'],
      prepStatus: 'ready' as const,
      createdAt: new Date(),
      accountId: 'a1', accountName: 'Vattenfall',
    };
    const result = adaptMeeting(prisma);
    expect(result.time).toBe('14:00');
    expect(result.dur).toBe('60 min');
    expect(result.date).toBe('2026-03-12T00:00:00.000Z');
    expect(result.acc).toBe('Vattenfall');
    expect(result.accId).toBe('a1');
    expect(result.who).toEqual(['Anna Virtanen', 'Pekka Laine']);
    expect(result.prep).toBe('ready');
  });
});

describe('adaptActivity', () => {
  it('maps Prisma Activity with author and account', () => {
    const author = {
      id: 'u1', name: 'Juuso', initials: 'JM',
      email: 'j@e.fi', role: 'Sales', color: 'emerald',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = {
      id: 'act1', type: 'Email' as const,
      summary: 'Sent proposal to CFO',
      detail: 'Attached pricing document...',
      source: 'Outlook Sync',
      noteType: null,
      createdAt: new Date('2026-03-11T16:00:00Z'),
      accountId: 'a1',
      account: { id: 'a1', name: 'Vattenfall' },
      authorId: 'u1', author,
    };
    const result = adaptActivity(prisma);
    expect(result.type).toBe('Email');
    expect(result.date).toBe('2026-03-11T16:00:00.000Z');
    expect(result.accId).toBe('a1');
    expect(result.accName).toBe('Vattenfall');
    expect(result.sum).toBe('Sent proposal to CFO');
    expect(result.detail).toBe('Attached pricing document...');
    expect(result.who.ini).toBe('JM');
    expect(result.src).toBe('Outlook Sync');
  });

  it('handles null account', () => {
    const author = {
      id: 'u1', name: 'Juuso', initials: 'JM',
      email: 'j@e.fi', role: 'Sales', color: 'emerald',
      createdAt: new Date(), updatedAt: new Date(),
    };
    const prisma = {
      id: 'act2', type: 'Note' as const,
      summary: 'Team standup notes',
      detail: '', source: 'Manual', noteType: null,
      createdAt: new Date(),
      accountId: null, account: null,
      authorId: 'u1', author,
    };
    const result = adaptActivity(prisma);
    expect(result.accId).toBe('');
    expect(result.accName).toBe('');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement adaptMeeting and adaptActivity**

```typescript
export function adaptMeeting(m: {
  id: string;
  title: string;
  startTime: string;
  duration: string;
  date: Date;
  attendees: string[];
  prepStatus: string;
  accountId: string | null;
  accountName: string | null;
  [k: string]: unknown;
}): UIMeeting {
  return {
    id: m.id,
    title: m.title,
    time: m.startTime,
    dur: m.duration,
    date: m.date.toISOString(),
    acc: m.accountName ?? '',
    accId: m.accountId ?? '',
    who: m.attendees,
    prep: m.prepStatus as UIMeeting['prep'],
  };
}

export function adaptActivity(a: {
  id: string;
  type: string;
  summary: string;
  detail: string;
  source: string;
  createdAt: Date;
  accountId: string | null;
  account: { id: string; name: string } | null;
  author: Parameters<typeof adaptUser>[0];
  [k: string]: unknown;
}): UIActivity {
  return {
    id: a.id,
    type: a.type as UIActivity['type'],
    date: a.createdAt.toISOString(),
    accId: a.account?.id ?? '',
    accName: a.account?.name ?? '',
    sum: a.summary,
    detail: a.detail,
    who: adaptUser(a.author),
    src: a.source,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/adapters.ts src/lib/__tests__/adapters.test.ts
git commit -m "feat: add adaptMeeting and adaptActivity adapters with tests (T-04)"
```

---

### Task 16: Final — Run All Tests + Verify Build

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests PASS (should be ~20+ tests across all adapters).

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Verify Next.js build**

```bash
npm run build
```

Expected: Build succeeds. Adapters module is tree-shakeable — not imported by any page yet, so zero bundle impact.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete type system adapter module (T-01 through T-04)"
```
