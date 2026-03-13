// Eco-Insight Revenue OS — Core Types
// ═══════════════════════════════════════════════════

export type ID = string;

export interface User {
  id: ID; name: string; ini: string; role: string; ac: string;
  // Aliases for compatibility
  initials?: string; color?: string;
}

// ── FIUAC Scoring ────────────────────────────────
export interface FIUACScores {
  f: number; i: number; u: number; a: number; c: number;
}

export function compositeScore(s: FIUACScores): number {
  return Math.round(s.f * 0.25 + s.i * 0.25 + s.u * 0.20 + s.a * 0.15 + s.c * 0.15);
}

// ── Deal Health ──────────────────────────────────
export interface DealHealth {
  eng: number; stake: number; comp: number; time: number;
}
export function healthAvg(h: DealHealth): number {
  return Math.round((h.eng + h.stake + h.comp + h.time) / 4);
}
export function riskLevel(h: DealHealth): 'low' | 'medium' | 'high' {
  const a = healthAvg(h);
  return a >= 60 ? 'low' : a >= 40 ? 'medium' : 'high';
}

// ── Signals ──────────────────────────────────────
export type SignalType = 'ppa_announcement' | 'renewable_target' | 'job_posting' | 'market_entry' | 'conference' | 'registry_pain';
export type SignalStatus = 'new' | 'reviewed' | 'converted' | 'dismissed';

export interface Signal {
  id: ID; type: SignalType; title: string; src: string; srcUrl: string | null;
  at: string; sum: string; rel: number; conf: string; why: string;
  status: SignalStatus; agent: string;
}

// ── Leads ────────────────────────────────────────
export type LeadStage = 'New' | 'Researching' | 'Qualified' | 'Converted' | 'Disqualified';

export interface Lead {
  id: ID; company: string; domain: string; src: string; signalId: ID | null;
  type: string; country: string; region: string; stage: LeadStage;
  pain: string; fit: string[]; scores: FIUACScores; conf: string;
  owner: User; createdAt: string;
}

// ── Contacts ─────────────────────────────────────
export type ContactRole = 'Champion' | 'Economic Buyer' | 'Technical Buyer' | 'Influencer' | 'Blocker';
export type ContactWarmth = 'Strong' | 'Warm' | 'Cold';

export interface Contact {
  id: ID; name: string; title: string; role: ContactRole;
  warmth: ContactWarmth; email: string; phone?: string;
}

// ── Accounts ─────────────────────────────────────
export type AccountStatus = 'Prospect' | 'Active' | 'Partner' | 'Churned';
export type CertScheme = 'GoO' | 'ELcert' | 'REGO' | 'I-REC' | 'EECS';

export interface Account {
  id: ID; name: string; type: string; country: string; cc: string;
  region: string; status: AccountStatus; schemes: CertScheme[];
  scores: FIUACScores; ownerId: string; owner: User; pipe: number; lastAct: string;
  pain: string; whyNow: string; fit: string[];
  aiConf: number | string; competitors?: string;
  contacts: Contact[];
}

// ── Opportunities ────────────────────────────────
export type OppStage = 'Identified' | 'Contacted' | 'Discovery' | 'Qualified' | 'Solution Fit' | 'Proposal' | 'Negotiation' | 'Verbal Commit' | 'Closed Won' | 'Closed Lost';

export const STAGES: OppStage[] = ['Identified','Contacted','Discovery','Qualified','Solution Fit','Proposal','Negotiation','Verbal Commit','Closed Won','Closed Lost'];
export const KANBAN_STAGES: OppStage[] = ['Contacted','Discovery','Qualified','Solution Fit','Proposal','Negotiation','Verbal Commit'];
export const STAGE_PROB: Record<string, number> = { Identified:5,Contacted:10,Discovery:20,Qualified:35,'Solution Fit':50,Proposal:65,Negotiation:80,'Verbal Commit':90,'Closed Won':100,'Closed Lost':0 };
export const STAGE_COLOR: Record<string, string> = { Contacted:'#3b82f6',Discovery:'#8b5cf6',Qualified:'#14b8a6','Solution Fit':'#33a882',Proposal:'#f59e0b',Negotiation:'#f97316','Verbal Commit':'#ec4899' };
export const LEAD_STAGES: LeadStage[] = ['New','Researching','Qualified','Converted','Disqualified'];

export interface Opportunity {
  id: ID; name: string; accId: ID; accName: string;
  stage: OppStage; amt: number; prob: number; close: string;
  owner: User; health: DealHealth;
  next: string; nextDate: string;
  lossReason?: string; lossComp?: string;
}

// ── Queue ────────────────────────────────────────
export type QueueType = 'outreach_draft' | 'lead_qualification' | 'enrichment' | 'task_creation';
export type QueueStatus = 'pending' | 'approved' | 'rejected';

export interface QueueSource { name: string; url: string | null; }

export interface QueueItem {
  id: ID; type: QueueType; title: string; accName: string; accId: ID | null;
  agent: string; conf: number;
  confBreak: Record<string, number>;
  reasoning: string; sources: QueueSource[];
  payload: Record<string, any>;
  status: QueueStatus; pri: string; createdAt: string;
  reviewedBy?: string; reviewedAt?: string; rejReason?: string;
}

// ── Tasks ────────────────────────────────────────
export type TaskStatus = 'Open' | 'In Progress' | 'In Review' | 'Done';
export type TaskPriority = 'High' | 'Medium' | 'Low';

export interface TaskComment { by: User; text: string; at: string; mentions?: string[]; }

export interface Task {
  id: ID; title: string; accName: string; accId: ID;
  due: string; owner: User; assignees?: User[];
  pri: TaskPriority; status: TaskStatus; src: string;
  goalId?: ID; reviewer?: User; comments: TaskComment[];
  completedAt?: string;
}

// ── Goals ────────────────────────────────────────
export interface Goal {
  id: ID; title: string; accName: string; accId: ID;
  owner: User; status: 'active' | 'completed' | 'archived';
}

// ── Activities ───────────────────────────────────
export type ActivityType = 'Email' | 'Meeting' | 'Call' | 'Note';

export interface Activity {
  id: ID; type: ActivityType; date: string;
  accId: ID; accName: string; sum: string; detail: string;
  who: User; src: string;
}

// ── Emails ───────────────────────────────────────
export type EmailClassification = 'positive_reply' | 'question' | 'objection' | 'meeting_request' | 'bounce' | 'unsubscribe' | 'new_domain' | 'auto_reply' | 'internal' | 'spam';

export interface Email {
  id: ID; subj: string; from: string; fromName: string;
  prev: string; dt: string; unread: boolean; archived?: boolean;
  cls: EmailClassification; clsConf: number;
  linked: boolean; acc?: string; accId?: ID;
  domain?: string; agent: string;
}

// ── Meetings ─────────────────────────────────────
export interface Meeting {
  id: ID; title: string; time: string; dur: string;
  acc: string; accId: ID; who: string[];
  prep: 'draft' | 'ready'; date: string;
}

// ── Agent Config ─────────────────────────────────
export interface AgentConfig {
  name: string; status: string; desc: string; params: string[];
}
