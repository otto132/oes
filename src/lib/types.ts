// Eco-Insight Revenue OS — Core Types
// ═══════════════════════════════════════════════════
// Field names match Prisma schema for direct data flow.

export type ID = string;

export interface User {
  id: ID; name: string; initials: string; role: string; color: string;
}

// ── FIUAC Scoring ────────────────────────────────
export interface FIUACScores {
  scoreFit: number; scoreIntent: number; scoreUrgency: number; scoreAccess: number; scoreCommercial: number;
}

export function compositeScore(s: FIUACScores): number {
  return Math.round(s.scoreFit * 0.25 + s.scoreIntent * 0.25 + s.scoreUrgency * 0.20 + s.scoreAccess * 0.15 + s.scoreCommercial * 0.15);
}

// ── Deal Health ──────────────────────────────────
export interface DealHealth {
  healthEngagement: number; healthStakeholders: number; healthCompetitive: number; healthTimeline: number;
}
export function healthAvg(h: DealHealth): number {
  return Math.round((h.healthEngagement + h.healthStakeholders + h.healthCompetitive + h.healthTimeline) / 4);
}
export function riskLevel(h: DealHealth): 'low' | 'medium' | 'high' {
  const a = healthAvg(h);
  return a >= 60 ? 'low' : a >= 40 ? 'medium' : 'high';
}

// ── Signals ──────────────────────────────────────
export type SignalType = 'ppa_announcement' | 'renewable_target' | 'job_posting' | 'market_entry' | 'conference' | 'registry_pain';
export type SignalStatus = 'new' | 'reviewed' | 'converted' | 'dismissed';

export interface Signal {
  id: ID; type: SignalType; title: string; source: string; sourceUrl: string | null;
  detectedAt: string; summary: string; relevance: number; confidence: number; reasoning: string;
  status: SignalStatus; agent: string;
}

// ── Leads ────────────────────────────────────────
export type LeadStage = 'New' | 'Researching' | 'Qualified' | 'Paused' | 'Converted' | 'Disqualified';

export interface Lead {
  id: ID; company: string; domain: string; source: string; signalId: ID | null;
  type: string; country: string; region: string; stage: LeadStage;
  pain: string; moduleFit: string[]; scores: FIUACScores; confidence: number;
  owner: User; createdAt: string;
  opportunityId?: ID | null; convertedAt?: string | null;
  disqualifyReason?: string | null; pausedUntil?: string | null;
}

// ── Contacts ─────────────────────────────────────
export type ContactRole = 'Champion' | 'EconomicBuyer' | 'TechnicalBuyer' | 'Influencer' | 'Blocker';
export type ContactWarmth = 'Strong' | 'Warm' | 'Cold';

export interface Contact {
  id: ID; name: string; title: string; role: ContactRole;
  warmth: ContactWarmth; email: string; phone?: string;
}

// ── Accounts ─────────────────────────────────────
export type AccountStatus = 'Prospect' | 'Active' | 'Customer' | 'Partner' | 'Churned';
export type CertScheme = 'GoO' | 'ELcert' | 'REGO' | 'I-REC' | 'EECS';

export interface Account {
  id: ID; name: string; type: string; country: string; countryCode: string;
  region: string; status: AccountStatus; schemes: CertScheme[];
  scores: FIUACScores; ownerId: string; owner: User; pipelineValue: number; lastActivityAt: string;
  pain: string; whyNow: string; moduleFit: string[];
  aiConfidence: number | string; competitors?: string;
  contacts: Contact[];
}

// ── Opportunities ────────────────────────────────
export type OppStage = 'Discovery' | 'Evaluation' | 'Proposal' | 'Negotiation' | 'Commit' | 'Won' | 'Lost';

export const STAGES: OppStage[] = ['Discovery','Evaluation','Proposal','Negotiation','Commit','Won','Lost'];
export const KANBAN_STAGES: OppStage[] = ['Discovery','Evaluation','Proposal','Negotiation','Commit'];
export const STAGE_PROB: Record<string, number> = { Discovery:15,Evaluation:35,Proposal:55,Negotiation:75,Commit:90,Won:100,Lost:0 };
export const STAGE_COLOR: Record<string, string> = { Discovery:'#3b82f6',Evaluation:'#8b5cf6',Proposal:'#f59e0b',Negotiation:'#f97316',Commit:'#ec4899' };
export const LEAD_STAGES: LeadStage[] = ['New','Researching','Qualified','Paused','Converted','Disqualified'];

export interface Opportunity {
  id: ID; name: string; accountId: ID; accountName: string;
  stage: OppStage; amount: number; probability: number; closeDate: string;
  owner: User; health: DealHealth;
  nextAction: string; nextActionDate: string;
  source?: string;
  lossReason?: string; lossCompetitor?: string;
  lessonsLearned?: string; keyStakeholders?: string;
}

// ── Queue ────────────────────────────────────────
export type QueueType = 'outreach_draft' | 'lead_qualification' | 'enrichment' | 'task_creation';
export type QueueStatus = 'pending' | 'approved' | 'rejected';

export interface QueueSource { name: string; url: string | null; }

export interface QueueItem {
  id: ID; type: QueueType; title: string; accountName: string; accountId: ID | null;
  agent: string; confidence: number;
  confidenceBreakdown: Record<string, number>;
  reasoning: string; sources: QueueSource[];
  payload: Record<string, any>;
  status: QueueStatus; priority: string; createdAt: string;
  reviewedBy?: string; reviewedAt?: string; rejectionReason?: string;
}

// ── Tasks ────────────────────────────────────────
export type TaskStatus = 'Open' | 'InProgress' | 'InReview' | 'Done';
export type TaskPriority = 'High' | 'Medium' | 'Low';

export interface Subtask {
  id: ID; title: string; done: boolean; position: number;
}

export interface TaskComment { author: User; text: string; createdAt: string; mentions?: string[]; }

export interface Task {
  id: ID; title: string; accountName: string; accountId: ID;
  dueDate: string; owner: User; assignees?: User[];
  priority: TaskPriority; status: TaskStatus; source: string;
  goalId?: ID; reviewer?: User; comments: TaskComment[];
  completedAt?: string; notes?: string;
  subtasksDone?: number; subtasksTotal?: number;
  subtasks?: Subtask[];
}

// ── Goals ────────────────────────────────────────
export interface Goal {
  id: ID; title: string; accountName: string; accountId: ID;
  owner: User; status: 'active' | 'completed' | 'archived';
}

// ── Activities ───────────────────────────────────
export type ActivityType = 'Email' | 'Meeting' | 'Call' | 'Note';

export interface Activity {
  id: ID; type: ActivityType; createdAt: string;
  accountId: ID; accountName: string; summary: string; detail: string;
  author: User; source: string;
}

// ── Emails ───────────────────────────────────────
export type EmailClassification = 'positive_reply' | 'question' | 'objection' | 'meeting_request' | 'bounce' | 'unsubscribe' | 'new_domain' | 'auto_reply' | 'internal' | 'spam';

export interface Email {
  id: ID; subject: string; fromEmail: string; fromName: string;
  preview: string; receivedAt: string; isUnread: boolean; isArchived?: boolean;
  classification: EmailClassification; classificationConf: number;
  isLinked: boolean; accountName?: string; accountId?: ID;
  domain?: string; classifierAgent: string;
  body?: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
  threadId?: string;
  snoozedUntil?: string; // ISO string
}

export interface EmailThread {
  threadId: string;
  emails: Email[];
  latestEmail: Email;
  accountName?: string;
  accountId?: string;
  isUnread: boolean;
  classification?: string;
  snoozedUntil?: string;
}

// ── Meetings ─────────────────────────────────────
export interface Meeting {
  id: ID; title: string; startTime: string; duration: string;
  accountName: string; accountId: ID; attendees: string[];
  prepStatus: 'draft' | 'ready'; date: string;
  rawNotes?: string;
  outcomeSummary?: string;
  outcomeRecordedAt?: string;
  sentimentTag?: string;
  noShow?: boolean;
}

// ── Weekly Digest ─────────────────────────────────
export interface WeeklyDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  pipelineSnapshot: {
    totalValue: number;
    valueDelta: number;
    valueDeltaPct: number;
    stageChanges: { name: string; from: string; to: string }[];
    closedWon: { name: string; amount: number; context: string }[];
    closedLost: { name: string; amount: number; context: string }[];
    newOpps: { name: string; accountName: string; amount: number }[];
    atRisk: { name: string; healthDrop: number }[];
  };
  accountHighlights: {
    accountName: string;
    accountId: string;
    narrative: string;
    activityCount: number;
  }[];
  weekAhead: {
    meetings: { id: string; title: string; date: string; accountName?: string; prepStatus: string }[];
    tasksDue: { id: string; title: string; dueDate: string; accountName?: string }[];
    overdue: { id: string; title: string; dueDate: string; accountName?: string }[];
  };
  renderedHtml: string;
  createdAt: string;
}

// ── Agent Config ─────────────────────────────────
export interface AgentConfig {
  name: string; status: string; desc: string; params: string[];
}
