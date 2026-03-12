// Formatting & display utilities
import { type FIUACScores, type DealHealth, compositeScore, healthAvg, STAGE_PROB } from './types';

export const fmt = (n: number) => n >= 1e6 ? '€' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '€' + (n / 1e3).toFixed(0) + 'K' : '€' + n;

export const fDate = (s: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export const fRelative = (s: string | null) => {
  if (!s) return 'Never';
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 864e5);
  if (d <= 0) return 'Today';
  if (d === 1) return '1d ago';
  if (d < 7) return d + 'd ago';
  if (d < 30) return Math.floor(d / 7) + 'w ago';
  return Math.floor(d / 30) + 'mo ago';
};

export const isOverdue = (s: string | null) => !!s && new Date(s) < new Date();

export const weightedValue = (amt: number, stage: string) => Math.round(amt * (STAGE_PROB[stage] || 0) / 100);

export const confColor = (n: number) => n >= 0.8 ? 'text-brand' : n >= 0.6 ? 'text-warn' : 'text-danger';
export const confLabel = (n: number) => Math.round(n * 100) + '%';

export const riskColor = (h: DealHealth) => {
  const a = healthAvg(h);
  return a >= 60 ? 'text-brand' : a >= 40 ? 'text-warn' : 'text-danger';
};

export const riskBorderColor = (h: DealHealth) => {
  const a = healthAvg(h);
  return a >= 60 ? 'border-brand' : a >= 40 ? 'border-warn' : 'border-danger';
};

export const signalLabel: Record<string, string> = {
  ppa_announcement: 'PPA', renewable_target: 'Target', job_posting: 'Hiring',
  market_entry: 'Market Entry', conference: 'Conference', registry_pain: 'Registry Pain',
};

export const signalColor: Record<string, string> = {
  ppa_announcement: 'text-brand', renewable_target: 'text-info', job_posting: 'text-purple',
  market_entry: 'text-warn', conference: 'text-teal', registry_pain: 'text-danger',
};

export const clsLabel: Record<string, string> = {
  positive_reply: 'Positive', question: 'Question', objection: 'Objection',
  meeting_request: 'Meeting Req', bounce: 'Bounce', unsubscribe: 'Unsub',
  new_domain: 'New Domain', auto_reply: 'Auto Reply', internal: 'Internal', spam: 'Spam',
};

export const queueTypeLabel: Record<string, string> = {
  outreach_draft: 'Outreach', lead_qualification: 'Lead', enrichment: 'Enrichment', task_creation: 'Task',
};

export const activityColor: Record<string, string> = {
  Email: 'text-info', Meeting: 'text-brand', Call: 'text-brand', Note: 'text-warn',
};

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ── Aliases for compatibility ────────────────────
export const fD = fDate;
export const fR = fRelative;
export const isOD = isOverdue;
export const weighted = weightedValue;
export const sigLabel = signalLabel;
export const sigColor = signalColor;
export const actColor = activityColor;
export { compositeScore, healthAvg } from './types';
export function confNum(c: number | string): number {
  if (typeof c === 'number') return c;
  return c === 'high' ? 0.85 : c === 'medium' ? 0.65 : 0.35;
}
