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

// ── Entity Adapters ──────────────────────────────────────────

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
  ownerId: string;
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
    ownerId: a.ownerId,
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

export function adaptMeeting(m: {
  id: string;
  title: string;
  startTime: Date;
  duration: number;
  date: Date;
  attendees: string[];
  prepStatus: string;
  accountId: string | null;
  accountName: string | null;
  [k: string]: unknown;
}): UIMeeting {
  // Format DateTime to "HH:MM" for display
  const hours = m.startTime.getUTCHours().toString().padStart(2, '0');
  const mins = m.startTime.getUTCMinutes().toString().padStart(2, '0');
  const time = `${hours}:${mins}`;

  // Format duration (minutes) to display string
  let dur: string;
  if (m.duration < 60) {
    dur = `${m.duration} min`;
  } else if (m.duration % 60 === 0) {
    dur = `${m.duration / 60}h`;
  } else {
    dur = `${Math.floor(m.duration / 60)}h ${m.duration % 60}m`;
  }

  return {
    id: m.id,
    title: m.title,
    time,
    dur,
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
