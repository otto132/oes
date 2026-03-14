// ═══════════════════════════════════════════════════════════════
// Eco-Insight — Prisma → UI Type Adapters
// ═══════════════════════════════════════════════════════════════
// Converts Prisma database records to UI types.
// Field names now match between Prisma and UI — adapters handle:
//   - Date → ISO string conversion
//   - Nested object flattening (account → accountId/accountName)
//   - Optional field spreading
//   - Meeting time/duration formatting

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
} from './types';

// ── Composite Type Helpers ───────────────────────────────────

export function adaptFIUAC(row: {
  scoreFit: number;
  scoreIntent: number;
  scoreUrgency: number;
  scoreAccess: number;
  scoreCommercial: number;
}): FIUACScores {
  return {
    scoreFit: row.scoreFit,
    scoreIntent: row.scoreIntent,
    scoreUrgency: row.scoreUrgency,
    scoreAccess: row.scoreAccess,
    scoreCommercial: row.scoreCommercial,
  };
}

export function adaptHealth(row: {
  healthEngagement: number;
  healthStakeholders: number;
  healthCompetitive: number;
  healthTimeline: number;
}): DealHealth {
  return {
    healthEngagement: row.healthEngagement,
    healthStakeholders: row.healthStakeholders,
    healthCompetitive: row.healthCompetitive,
    healthTimeline: row.healthTimeline,
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
    initials: u.initials,
    role: u.role,
    color: u.color,
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
    role: c.role as UIContact['role'],
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
    source: s.source,
    sourceUrl: s.sourceUrl,
    detectedAt: s.detectedAt.toISOString(),
    summary: s.summary,
    relevance: s.relevance,
    confidence: s.confidence,
    reasoning: s.reasoning,
    status: s.status as UISignal['status'],
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
    source: l.source,
    signalId: l.signalId,
    type: l.type,
    country: l.country,
    region: l.region,
    stage: l.stage as UILead['stage'],
    pain: l.pain,
    moduleFit: l.moduleFit,
    scores: adaptFIUAC(l),
    confidence: l.confidence,
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
    countryCode: a.countryCode,
    region: a.region,
    status: a.status as UIAccount['status'],
    schemes: a.schemes as UIAccount['schemes'],
    scores: adaptFIUAC(a),
    ownerId: a.ownerId,
    owner: adaptUser(a.owner),
    pipelineValue: a.pipelineValue,
    lastActivityAt: a.lastActivityAt.toISOString(),
    pain: a.pain,
    whyNow: a.whyNow,
    moduleFit: a.moduleFit,
    aiConfidence: a.aiConfidence,
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
    accountId: o.account.id,
    accountName: o.account.name,
    stage: o.stage as UIOpportunity['stage'],
    amount: o.amount,
    probability: o.probability,
    closeDate: o.closeDate ? o.closeDate.toISOString() : '',
    owner: adaptUser(o.owner),
    health: adaptHealth(o),
    nextAction: o.nextAction ?? '',
    nextActionDate: o.nextActionDate ? o.nextActionDate.toISOString() : '',
    ...(o.lossReason ? { lossReason: o.lossReason as string } : {}),
    ...(o.lossCompetitor ? { lossCompetitor: o.lossCompetitor as string } : {}),
    ...(o.lessonsLearned ? { lessonsLearned: o.lessonsLearned as string } : {}),
    ...(o.keyStakeholders ? { keyStakeholders: o.keyStakeholders as string } : {}),
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
    author: adaptUser(c.author),
    text: c.text,
    createdAt: c.createdAt.toISOString(),
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
  notes?: string | null;
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
    accountName: t.account?.name ?? '',
    accountId: t.account?.id ?? '',
    dueDate: t.due ? t.due.toISOString() : '',
    owner: adaptUser(t.owner),
    ...(t.assignees.length ? { assignees: t.assignees.map(adaptUser) } : {}),
    priority: t.priority as UITask['priority'],
    status: t.status as UITask['status'],
    source: t.source,
    ...(t.goalId ? { goalId: t.goalId } : {}),
    ...(t.reviewer ? { reviewer: adaptUser(t.reviewer) } : {}),
    comments: t.comments.map(adaptTaskComment),
    ...(t.completedAt ? { completedAt: t.completedAt.toISOString() } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
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
    accountName: g.account?.name ?? '',
    accountId: g.account?.id ?? '',
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
    accountName: q.accName,
    accountId: q.accId,
    agent: q.agent,
    confidence: q.confidence,
    confidenceBreakdown: q.confidenceBreakdown as Record<string, number>,
    reasoning: q.reasoning,
    sources: q.sources as UIQueueItem['sources'],
    payload: q.payload as Record<string, unknown>,
    status: q.status as UIQueueItem['status'],
    priority: q.priority,
    createdAt: q.createdAt.toISOString(),
    ...(q.reviewedById ? { reviewedBy: q.reviewedById } : {}),
    ...(q.reviewedAt ? { reviewedAt: q.reviewedAt.toISOString() } : {}),
    ...(q.rejReason ? { rejectionReason: q.rejReason } : {}),
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
    subject: e.subject,
    fromEmail: e.fromEmail,
    fromName: e.fromName,
    preview: e.preview,
    receivedAt: e.receivedAt.toISOString(),
    isUnread: e.isUnread,
    isArchived: e.isArchived,
    classification: e.classification as UIEmail['classification'],
    classificationConf: e.classificationConf,
    isLinked: e.isLinked,
    ...(e.accountName != null ? { accountName: e.accountName } : {}),
    ...(e.accountId != null ? { accountId: e.accountId } : {}),
    ...(e.domain != null ? { domain: e.domain } : {}),
    classifierAgent: e.classifierAgent,
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
  const startTime = `${hours}:${mins}`;

  // Format duration (minutes) to display string
  let duration: string;
  if (m.duration < 60) {
    duration = `${m.duration} min`;
  } else if (m.duration % 60 === 0) {
    duration = `${m.duration / 60}h`;
  } else {
    duration = `${Math.floor(m.duration / 60)}h ${m.duration % 60}m`;
  }

  return {
    id: m.id,
    title: m.title,
    startTime,
    duration,
    date: m.date.toISOString(),
    accountName: m.accountName ?? '',
    accountId: m.accountId ?? '',
    attendees: m.attendees,
    prepStatus: m.prepStatus as UIMeeting['prepStatus'],
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
    createdAt: a.createdAt.toISOString(),
    accountId: a.account?.id ?? '',
    accountName: a.account?.name ?? '',
    summary: a.summary,
    detail: a.detail,
    author: adaptUser(a.author),
    source: a.source,
  };
}

export function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const then = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return new Date(then).toLocaleDateString();
}
