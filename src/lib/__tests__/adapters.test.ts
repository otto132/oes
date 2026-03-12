import { describe, it, expect } from 'vitest';
import {
  mapOppStage,
  mapContactRole,
  mapSignalStatus,
  mapTaskStatus,
  adaptFIUAC,
  adaptHealth,
  adaptUser,
  adaptSignal,
  adaptContact,
  adaptQueueItem,
  adaptOpportunity,
  adaptLead,
  adaptAccount,
  adaptTask,
  adaptTaskComment,
  adaptGoal,
  adaptEmail,
  adaptMeeting,
  adaptActivity,
} from '@/lib/adapters';

// ── Shared Fixtures ────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    name: 'Alice Smith',
    initials: 'AS',
    role: 'AE',
    color: '#3b82f6',
    ...overrides,
  };
}

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Bob Jones',
    title: 'VP Engineering',
    role: 'EconomicBuyer',
    warmth: 'Warm',
    email: 'bob@acme.com',
    phone: null as string | null,
    ...overrides,
  };
}

// ── Enum Maps ──────────────────────────────────────────────

describe('mapOppStage', () => {
  it('maps SolutionFit to "Solution Fit"', () => {
    expect(mapOppStage('SolutionFit')).toBe('Solution Fit');
  });

  it('maps ClosedWon to "Closed Won"', () => {
    expect(mapOppStage('ClosedWon')).toBe('Closed Won');
  });

  it('maps ClosedLost to "Closed Lost"', () => {
    expect(mapOppStage('ClosedLost')).toBe('Closed Lost');
  });

  it('maps VerbalCommit to "Verbal Commit"', () => {
    expect(mapOppStage('VerbalCommit')).toBe('Verbal Commit');
  });

  it('passes through unmapped values like Discovery', () => {
    expect(mapOppStage('Discovery')).toBe('Discovery');
  });
});

describe('mapContactRole', () => {
  it('maps EconomicBuyer to "Economic Buyer"', () => {
    expect(mapContactRole('EconomicBuyer')).toBe('Economic Buyer');
  });

  it('maps TechnicalBuyer to "Technical Buyer"', () => {
    expect(mapContactRole('TechnicalBuyer')).toBe('Technical Buyer');
  });

  it('passes through unmapped values like Champion', () => {
    expect(mapContactRole('Champion')).toBe('Champion');
  });
});

describe('mapSignalStatus', () => {
  it('maps new_signal to "new"', () => {
    expect(mapSignalStatus('new_signal')).toBe('new');
  });

  it('passes through unmapped values like reviewed', () => {
    expect(mapSignalStatus('reviewed')).toBe('reviewed');
  });
});

describe('mapTaskStatus', () => {
  it('maps InProgress to "In Progress"', () => {
    expect(mapTaskStatus('InProgress')).toBe('In Progress');
  });

  it('maps InReview to "In Review"', () => {
    expect(mapTaskStatus('InReview')).toBe('In Review');
  });

  it('passes through unmapped values like Open', () => {
    expect(mapTaskStatus('Open')).toBe('Open');
  });
});

// ── Composite Type Helpers ─────────────────────────────────

describe('adaptFIUAC', () => {
  it('maps score fields to abbreviated keys', () => {
    const row = {
      scoreFit: 80,
      scoreIntent: 65,
      scoreUrgency: 90,
      scoreAccess: 50,
      scoreCommercial: 75,
    };
    expect(adaptFIUAC(row)).toEqual({
      f: 80, i: 65, u: 90, a: 50, c: 75,
    });
  });

  it('handles zero scores', () => {
    const row = {
      scoreFit: 0, scoreIntent: 0, scoreUrgency: 0,
      scoreAccess: 0, scoreCommercial: 0,
    };
    expect(adaptFIUAC(row)).toEqual({ f: 0, i: 0, u: 0, a: 0, c: 0 });
  });
});

describe('adaptHealth', () => {
  it('maps health fields to abbreviated keys', () => {
    const row = {
      healthEngagement: 7,
      healthStakeholders: 5,
      healthCompetitive: 8,
      healthTimeline: 6,
    };
    expect(adaptHealth(row)).toEqual({
      eng: 7, stake: 5, comp: 8, time: 6,
    });
  });
});

// ── Entity Adapters ────────────────────────────────────────

describe('adaptUser', () => {
  it('maps name, initials→ini, role, color→ac', () => {
    const result = adaptUser(makeUser());
    expect(result).toEqual({
      id: 'u1',
      name: 'Alice Smith',
      ini: 'AS',
      role: 'AE',
      ac: '#3b82f6',
    });
  });

  it('ignores extra properties on the input', () => {
    const result = adaptUser(makeUser({ email: 'alice@co.com', extraField: true }));
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('extraField');
  });
});

describe('adaptSignal', () => {
  const base = {
    id: 's1',
    type: 'ppa_announcement',
    title: 'New PPA signed',
    summary: 'Company signed a 10-year PPA',
    reasoning: 'Strong renewable commitment',
    source: 'NewsAPI',
    sourceUrl: 'https://example.com/article',
    relevance: 85,
    confidence: 0.923456,
    agent: 'signal-scanner',
    status: 'new_signal',
    detectedAt: new Date('2025-06-15T10:30:00Z'),
  };

  it('converts detectedAt Date to ISO string', () => {
    const result = adaptSignal(base);
    expect(result.at).toBe('2025-06-15T10:30:00.000Z');
  });

  it('formats confidence to two decimal places', () => {
    const result = adaptSignal(base);
    expect(result.conf).toBe('0.92');
  });

  it('maps source→src', () => {
    const result = adaptSignal(base);
    expect(result.src).toBe('NewsAPI');
  });

  it('maps status through mapSignalStatus', () => {
    const result = adaptSignal(base);
    expect(result.status).toBe('new');
  });

  it('preserves null sourceUrl as srcUrl', () => {
    const result = adaptSignal({ ...base, sourceUrl: null });
    expect(result.srcUrl).toBeNull();
  });

  it('includes all expected fields', () => {
    const result = adaptSignal(base);
    expect(result).toEqual({
      id: 's1',
      type: 'ppa_announcement',
      title: 'New PPA signed',
      src: 'NewsAPI',
      srcUrl: 'https://example.com/article',
      at: '2025-06-15T10:30:00.000Z',
      sum: 'Company signed a 10-year PPA',
      rel: 85,
      conf: '0.92',
      why: 'Strong renewable commitment',
      status: 'new',
      agent: 'signal-scanner',
    });
  });
});

describe('adaptContact', () => {
  it('maps role through mapContactRole', () => {
    const result = adaptContact(makeContact());
    expect(result.role).toBe('Economic Buyer');
  });

  it('omits phone when null', () => {
    const result = adaptContact(makeContact({ phone: null }));
    expect(result).not.toHaveProperty('phone');
  });

  it('includes phone when present', () => {
    const result = adaptContact(makeContact({ phone: '+1-555-0100' }));
    expect(result.phone).toBe('+1-555-0100');
  });

  it('passes through warmth as-is', () => {
    const result = adaptContact(makeContact({ warmth: 'Cold' }));
    expect(result.warmth).toBe('Cold');
  });

  it('returns full expected shape', () => {
    const result = adaptContact(makeContact({ role: 'Champion', phone: '123' }));
    expect(result).toEqual({
      id: 'c1',
      name: 'Bob Jones',
      title: 'VP Engineering',
      role: 'Champion',
      warmth: 'Warm',
      email: 'bob@acme.com',
      phone: '123',
    });
  });
});

describe('adaptOpportunity', () => {
  const base = {
    id: 'o1',
    name: 'Acme Expansion',
    stage: 'SolutionFit',
    amount: 150000,
    probability: 50,
    closeDate: new Date('2025-09-01T00:00:00Z'),
    healthEngagement: 70,
    healthStakeholders: 55,
    healthCompetitive: 80,
    healthTimeline: 60,
    nextAction: 'Send proposal',
    nextActionDate: new Date('2025-07-01T00:00:00Z'),
    lossReason: null as string | null,
    lossCompetitor: null as string | null,
    account: { id: 'a1', name: 'Acme Corp' },
    owner: makeUser(),
  };

  it('maps stage through mapOppStage', () => {
    const result = adaptOpportunity(base);
    expect(result.stage).toBe('Solution Fit');
  });

  it('adapts health sub-object', () => {
    const result = adaptOpportunity(base);
    expect(result.health).toEqual({
      eng: 70, stake: 55, comp: 80, time: 60,
    });
  });

  it('converts closeDate to ISO string', () => {
    const result = adaptOpportunity(base);
    expect(result.close).toBe('2025-09-01T00:00:00.000Z');
  });

  it('returns empty string for null closeDate', () => {
    const result = adaptOpportunity({ ...base, closeDate: null });
    expect(result.close).toBe('');
  });

  it('omits lossReason and lossComp when null', () => {
    const result = adaptOpportunity(base);
    expect(result).not.toHaveProperty('lossReason');
    expect(result).not.toHaveProperty('lossComp');
  });

  it('includes lossReason and lossComp when present', () => {
    const result = adaptOpportunity({
      ...base,
      lossReason: 'Price too high',
      lossCompetitor: 'RivalCo',
    });
    expect(result.lossReason).toBe('Price too high');
    expect(result.lossComp).toBe('RivalCo');
  });

  it('maps next and nextDate', () => {
    const result = adaptOpportunity(base);
    expect(result.next).toBe('Send proposal');
    expect(result.nextDate).toBe('2025-07-01T00:00:00.000Z');
  });

  it('returns empty strings for null nextAction/nextActionDate', () => {
    const result = adaptOpportunity({
      ...base,
      nextAction: null,
      nextActionDate: null,
    });
    expect(result.next).toBe('');
    expect(result.nextDate).toBe('');
  });
});

describe('adaptQueueItem', () => {
  const base = {
    id: 'q1',
    type: 'outreach_draft',
    title: 'Draft outreach for Acme',
    accName: 'Acme Corp',
    accId: 'a1' as string | null,
    agent: 'outreach-agent',
    confidence: 0.87,
    confidenceBreakdown: { relevance: 0.9, quality: 0.85 },
    sources: [{ name: 'CRM', url: null }],
    payload: { body: 'Hello...' },
    reasoning: 'High-fit prospect',
    status: 'pending',
    priority: 'High',
    createdAt: new Date('2025-05-20T14:00:00Z'),
  };

  it('converts createdAt to ISO string', () => {
    const result = adaptQueueItem(base);
    expect(result.createdAt).toBe('2025-05-20T14:00:00.000Z');
  });

  it('passes through JSON fields (confidenceBreakdown, sources, payload)', () => {
    const result = adaptQueueItem(base);
    expect(result.confBreak).toEqual({ relevance: 0.9, quality: 0.85 });
    expect(result.sources).toEqual([{ name: 'CRM', url: null }]);
    expect(result.payload).toEqual({ body: 'Hello...' });
  });

  it('omits reviewedBy and reviewedAt when absent', () => {
    const result = adaptQueueItem(base);
    expect(result).not.toHaveProperty('reviewedBy');
    expect(result).not.toHaveProperty('reviewedAt');
  });

  it('includes reviewedBy and reviewedAt when present', () => {
    const result = adaptQueueItem({
      ...base,
      reviewedById: 'u2',
      reviewedAt: new Date('2025-05-21T09:00:00Z'),
    });
    expect(result.reviewedBy).toBe('u2');
    expect(result.reviewedAt).toBe('2025-05-21T09:00:00.000Z');
  });

  it('includes rejReason when present', () => {
    const result = adaptQueueItem({
      ...base,
      rejReason: 'Low quality',
    });
    expect(result.rejReason).toBe('Low quality');
  });

  it('omits rejReason when null', () => {
    const result = adaptQueueItem({ ...base, rejReason: null });
    expect(result).not.toHaveProperty('rejReason');
  });
});

describe('adaptLead', () => {
  const base = {
    id: 'l1',
    company: 'GreenTech',
    domain: 'greentech.io',
    source: 'inbound',
    signalId: 's1' as string | null,
    type: 'Enterprise',
    country: 'Germany',
    region: 'DACH',
    stage: 'New',
    pain: 'Complex registry tracking',
    scoreFit: 80, scoreIntent: 70, scoreUrgency: 60,
    scoreAccess: 50, scoreCommercial: 90,
    moduleFit: ['GoO Tracking', 'Analytics'],
    confidence: 0.756,
    createdAt: new Date('2025-04-10T08:00:00Z'),
    owner: makeUser(),
  };

  it('maps scores through adaptFIUAC', () => {
    const result = adaptLead(base);
    expect(result.scores).toEqual({ f: 80, i: 70, u: 60, a: 50, c: 90 });
  });

  it('formats confidence to two decimals', () => {
    const result = adaptLead(base);
    expect(result.conf).toBe('0.76');
  });

  it('converts createdAt to ISO string', () => {
    const result = adaptLead(base);
    expect(result.createdAt).toBe('2025-04-10T08:00:00.000Z');
  });

  it('maps source→src and moduleFit→fit', () => {
    const result = adaptLead(base);
    expect(result.src).toBe('inbound');
    expect(result.fit).toEqual(['GoO Tracking', 'Analytics']);
  });

  it('nests adapted owner', () => {
    const result = adaptLead(base);
    expect(result.owner.ini).toBe('AS');
    expect(result.owner.ac).toBe('#3b82f6');
  });
});

describe('adaptAccount', () => {
  const base = {
    id: 'a1',
    name: 'Acme Corp',
    type: 'Enterprise',
    country: 'Netherlands',
    countryCode: 'NL',
    region: 'Benelux',
    status: 'Active',
    schemes: ['GoO', 'EECS'],
    scoreFit: 85, scoreIntent: 75, scoreUrgency: 65,
    scoreAccess: 55, scoreCommercial: 80,
    pipelineValue: 500000,
    lastActivityAt: new Date('2025-06-01T12:00:00Z'),
    pain: 'Manual certificate management',
    whyNow: 'CSRD deadline',
    moduleFit: ['GoO Tracking'],
    competitors: null as string | null,
    aiConfidence: 0.91,
    owner: makeUser(),
    contacts: [makeContact()],
  };

  it('maps countryCode→cc', () => {
    const result = adaptAccount(base);
    expect(result.cc).toBe('NL');
  });

  it('maps pipelineValue→pipe', () => {
    const result = adaptAccount(base);
    expect(result.pipe).toBe(500000);
  });

  it('omits competitors when null', () => {
    const result = adaptAccount(base);
    expect(result).not.toHaveProperty('competitors');
  });

  it('includes competitors when present', () => {
    const result = adaptAccount({ ...base, competitors: 'RivalCo' });
    expect(result.competitors).toBe('RivalCo');
  });

  it('adapts nested contacts', () => {
    const result = adaptAccount(base);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].role).toBe('Economic Buyer');
  });
});

describe('adaptTask', () => {
  const base = {
    id: 't1',
    title: 'Follow up with Acme',
    status: 'InProgress',
    priority: 'High',
    due: new Date('2025-07-15T00:00:00Z'),
    source: 'manual',
    completedAt: null as Date | null,
    account: { id: 'a1', name: 'Acme Corp' } as { id: string; name: string } | null,
    owner: makeUser(),
    assignees: [] as ReturnType<typeof makeUser>[],
    reviewer: null as ReturnType<typeof makeUser> | null,
    goalId: null as string | null,
    comments: [] as { text: string; mentions: string[]; createdAt: Date; author: ReturnType<typeof makeUser> }[],
  };

  it('maps status through mapTaskStatus', () => {
    const result = adaptTask(base);
    expect(result.status).toBe('In Progress');
  });

  it('converts due Date to ISO string', () => {
    const result = adaptTask(base);
    expect(result.due).toBe('2025-07-15T00:00:00.000Z');
  });

  it('returns empty string for null due', () => {
    const result = adaptTask({ ...base, due: null });
    expect(result.due).toBe('');
  });

  it('omits assignees when empty', () => {
    const result = adaptTask(base);
    expect(result).not.toHaveProperty('assignees');
  });

  it('includes assignees when present', () => {
    const result = adaptTask({ ...base, assignees: [makeUser({ id: 'u2', initials: 'XY' })] });
    expect(result.assignees).toHaveLength(1);
    expect(result.assignees![0].ini).toBe('XY');
  });

  it('omits goalId when null', () => {
    const result = adaptTask(base);
    expect(result).not.toHaveProperty('goalId');
  });

  it('includes goalId when present', () => {
    const result = adaptTask({ ...base, goalId: 'g1' });
    expect(result.goalId).toBe('g1');
  });

  it('omits reviewer when null', () => {
    const result = adaptTask(base);
    expect(result).not.toHaveProperty('reviewer');
  });

  it('includes reviewer when present', () => {
    const result = adaptTask({ ...base, reviewer: makeUser({ id: 'u3' }) });
    expect(result.reviewer!.id).toBe('u3');
  });

  it('omits completedAt when null', () => {
    const result = adaptTask(base);
    expect(result).not.toHaveProperty('completedAt');
  });

  it('includes completedAt when present', () => {
    const result = adaptTask({ ...base, completedAt: new Date('2025-07-14T16:00:00Z') });
    expect(result.completedAt).toBe('2025-07-14T16:00:00.000Z');
  });

  it('handles null account', () => {
    const result = adaptTask({ ...base, account: null });
    expect(result.accName).toBe('');
    expect(result.accId).toBe('');
  });
});

describe('adaptTaskComment', () => {
  it('maps author→by and createdAt→at', () => {
    const result = adaptTaskComment({
      text: 'Looks good',
      mentions: [],
      createdAt: new Date('2025-06-10T09:00:00Z'),
      author: makeUser(),
    });
    expect(result.by.name).toBe('Alice Smith');
    expect(result.at).toBe('2025-06-10T09:00:00.000Z');
  });

  it('omits mentions when empty', () => {
    const result = adaptTaskComment({
      text: 'OK', mentions: [],
      createdAt: new Date(), author: makeUser(),
    });
    expect(result).not.toHaveProperty('mentions');
  });

  it('includes mentions when present', () => {
    const result = adaptTaskComment({
      text: 'cc @bob', mentions: ['u2'],
      createdAt: new Date(), author: makeUser(),
    });
    expect(result.mentions).toEqual(['u2']);
  });
});

describe('adaptGoal', () => {
  it('maps fields and adapts nested owner', () => {
    const result = adaptGoal({
      id: 'g1', title: 'Close Acme deal', status: 'active',
      account: { id: 'a1', name: 'Acme Corp' },
      owner: makeUser(),
    });
    expect(result).toEqual({
      id: 'g1',
      title: 'Close Acme deal',
      accName: 'Acme Corp',
      accId: 'a1',
      owner: { id: 'u1', name: 'Alice Smith', ini: 'AS', role: 'AE', ac: '#3b82f6' },
      status: 'active',
    });
  });

  it('handles null account', () => {
    const result = adaptGoal({
      id: 'g2', title: 'General goal', status: 'completed',
      account: null, owner: makeUser(),
    });
    expect(result.accName).toBe('');
    expect(result.accId).toBe('');
  });
});

describe('adaptEmail', () => {
  const base = {
    id: 'e1',
    subject: 'Re: Proposal',
    fromEmail: 'bob@acme.com',
    fromName: 'Bob Jones',
    preview: 'Thanks for the proposal...',
    receivedAt: new Date('2025-06-12T15:30:00Z'),
    isUnread: true,
    isArchived: false,
    classification: 'positive_reply',
    classificationConf: 0.95,
    classifierAgent: 'email-classifier',
    isLinked: true,
    accountId: 'a1' as string | null,
    accountName: 'Acme Corp' as string | null,
    domain: 'acme.com' as string | null,
  };

  it('maps field names correctly', () => {
    const result = adaptEmail(base);
    expect(result.subj).toBe('Re: Proposal');
    expect(result.from).toBe('bob@acme.com');
    expect(result.dt).toBe('2025-06-12T15:30:00.000Z');
    expect(result.unread).toBe(true);
    expect(result.archived).toBe(false);
    expect(result.cls).toBe('positive_reply');
    expect(result.clsConf).toBe(0.95);
    expect(result.linked).toBe(true);
    expect(result.agent).toBe('email-classifier');
  });

  it('includes optional acc, accId, domain when present', () => {
    const result = adaptEmail(base);
    expect(result.acc).toBe('Acme Corp');
    expect(result.accId).toBe('a1');
    expect(result.domain).toBe('acme.com');
  });

  it('omits acc, accId, domain when null', () => {
    const result = adaptEmail({
      ...base,
      accountId: null,
      accountName: null,
      domain: null,
    });
    expect(result).not.toHaveProperty('acc');
    expect(result).not.toHaveProperty('accId');
    expect(result).not.toHaveProperty('domain');
  });
});

describe('adaptMeeting', () => {
  const base = {
    id: 'm1',
    title: 'Discovery Call',
    startTime: '10:00',
    duration: '30min',
    date: new Date('2025-06-20T00:00:00Z'),
    attendees: ['Alice', 'Bob'],
    prepStatus: 'ready',
    accountId: 'a1' as string | null,
    accountName: 'Acme Corp' as string | null,
  };

  it('maps all fields correctly', () => {
    const result = adaptMeeting(base);
    expect(result).toEqual({
      id: 'm1',
      title: 'Discovery Call',
      time: '10:00',
      dur: '30min',
      date: '2025-06-20T00:00:00.000Z',
      acc: 'Acme Corp',
      accId: 'a1',
      who: ['Alice', 'Bob'],
      prep: 'ready',
    });
  });

  it('defaults acc/accId to empty string when null', () => {
    const result = adaptMeeting({ ...base, accountId: null, accountName: null });
    expect(result.acc).toBe('');
    expect(result.accId).toBe('');
  });
});

describe('adaptActivity', () => {
  it('maps all fields and adapts nested author', () => {
    const result = adaptActivity({
      id: 'act1',
      type: 'Email',
      summary: 'Sent follow-up',
      detail: 'Discussed pricing',
      source: 'gmail',
      createdAt: new Date('2025-06-18T11:00:00Z'),
      accountId: 'a1',
      account: { id: 'a1', name: 'Acme Corp' },
      author: makeUser(),
    });
    expect(result).toEqual({
      id: 'act1',
      type: 'Email',
      date: '2025-06-18T11:00:00.000Z',
      accId: 'a1',
      accName: 'Acme Corp',
      sum: 'Sent follow-up',
      detail: 'Discussed pricing',
      who: { id: 'u1', name: 'Alice Smith', ini: 'AS', role: 'AE', ac: '#3b82f6' },
      src: 'gmail',
    });
  });

  it('handles null account', () => {
    const result = adaptActivity({
      id: 'act2', type: 'Note', summary: 'Internal note',
      detail: '', source: 'manual',
      createdAt: new Date(), accountId: null, account: null,
      author: makeUser(),
    });
    expect(result.accId).toBe('');
    expect(result.accName).toBe('');
  });
});
