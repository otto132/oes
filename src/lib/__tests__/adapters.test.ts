import { describe, it, expect } from 'vitest';
import {
  mapOppStage,
  mapContactRole,
  mapSignalStatus,
  mapTaskStatus,
  adaptFIUAC,
  adaptHealth,
  adaptUser,
  adaptContact,
  adaptSignal,
  adaptLead,
  adaptAccount,
  adaptOpportunity,
  adaptTask,
  adaptTaskComment,
  adaptGoal,
  adaptQueueItem,
  adaptEmail,
  adaptMeeting,
  adaptActivity,
} from '../adapters';

// ── Helpers ──────────────────────────────────────────────────

const makeOwner = () => ({
  id: 'u1',
  name: 'Juuso Mäkinen',
  initials: 'JM',
  email: 'juuso@eco.fi',
  role: 'Sales Lead',
  color: 'emerald',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ── Enum Maps ────────────────────────────────────────────────

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

// ── Composite Type Helpers ───────────────────────────────────

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

// ── Entity Adapters ──────────────────────────────────────────

describe('adaptUser', () => {
  it('maps Prisma User to UI User', () => {
    const result = adaptUser(makeOwner());
    expect(result).toEqual({
      id: 'u1',
      name: 'Juuso Mäkinen',
      ini: 'JM',
      role: 'Sales Lead',
      ac: 'emerald',
    });
  });
});

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

  it('passes through Champion role and includes phone', () => {
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
      owner: makeOwner(),
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

describe('adaptAccount', () => {
  it('maps Prisma Account with owner and contacts', () => {
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
      ownerId: 'u1', owner: makeOwner(),
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

describe('adaptOpportunity', () => {
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
      owner: makeOwner(),
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
      owner: makeOwner(),
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
      owner: makeOwner(),
    };
    const result = adaptOpportunity(prisma);
    expect(result.stage).toBe('Closed Lost');
    expect(result.lossReason).toBe('Price');
    expect(result.lossComp).toBe('CompetitorX');
  });
});

describe('adaptTaskComment', () => {
  it('maps author and createdAt', () => {
    const comment = {
      id: 'tc1', text: 'Sent email',
      mentions: ['u2'],
      createdAt: new Date('2026-03-12T09:00:00Z'),
      taskId: 't1', authorId: 'u1',
      author: makeOwner(),
    };
    const result = adaptTaskComment(comment);
    expect(result.by.ini).toBe('JM');
    expect(result.at).toBe('2026-03-12T09:00:00.000Z');
    expect(result.text).toBe('Sent email');
    expect(result.mentions).toEqual(['u2']);
  });

  it('omits mentions when empty', () => {
    const comment = {
      id: 'tc2', text: 'Note',
      mentions: [],
      createdAt: new Date(),
      taskId: 't1', authorId: 'u1',
      author: makeOwner(),
    };
    const result = adaptTaskComment(comment);
    expect(result.mentions).toBeUndefined();
  });
});

describe('adaptTask', () => {
  it('maps Prisma Task with all relations', () => {
    const owner = makeOwner();
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
      ownerId: 'u1', owner: makeOwner(),
      assignees: [], reviewerId: null, reviewer: null,
      goalId: null, goal: null, comments: [],
    };
    const result = adaptTask(prisma);
    expect(result.accName).toBe('');
    expect(result.accId).toBe('');
    expect(result.due).toBe('');
  });
});

describe('adaptGoal', () => {
  it('maps Prisma Goal to UI Goal', () => {
    const prisma = {
      id: 'g1', title: 'Close Vattenfall by Q2',
      status: 'active' as const,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: 'a1',
      account: { id: 'a1', name: 'Vattenfall' },
      ownerId: 'u1', owner: makeOwner(),
    };
    const result = adaptGoal(prisma);
    expect(result.accName).toBe('Vattenfall');
    expect(result.accId).toBe('a1');
    expect(result.owner.ini).toBe('JM');
    expect(result.status).toBe('active');
  });

  it('handles null account', () => {
    const prisma = {
      id: 'g2', title: 'General goal',
      status: 'active' as const,
      createdAt: new Date(), updatedAt: new Date(),
      accountId: null, account: null,
      ownerId: 'u1', owner: makeOwner(),
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
    const prisma = {
      id: 'act1', type: 'Email' as const,
      summary: 'Sent proposal to CFO',
      detail: 'Attached pricing document...',
      source: 'Outlook Sync',
      noteType: null,
      createdAt: new Date('2026-03-11T16:00:00Z'),
      accountId: 'a1',
      account: { id: 'a1', name: 'Vattenfall' },
      authorId: 'u1', author: makeOwner(),
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
    const prisma = {
      id: 'act2', type: 'Note' as const,
      summary: 'Team standup notes',
      detail: '', source: 'Manual', noteType: null,
      createdAt: new Date(),
      accountId: null, account: null,
      authorId: 'u1', author: makeOwner(),
    };
    const result = adaptActivity(prisma);
    expect(result.accId).toBe('');
    expect(result.accName).toBe('');
  });
});
