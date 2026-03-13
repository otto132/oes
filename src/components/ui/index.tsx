// Eco-Insight UI primitives — strict design system
import { type FIUACScores, type DealHealth, compositeScore, healthAvg } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

/* ── Badge ── */
type BadgeVariant = 'ok' | 'err' | 'warn' | 'info' | 'neutral' | 'purple' | 'ai';
const badgeStyles: Record<BadgeVariant, string> = {
  ok:      'text-brand bg-brand/[.06] border-brand/[.12]',
  err:     'text-danger bg-danger/[.06] border-danger/[.10]',
  warn:    'text-warn bg-warn/[.06] border-warn/[.10]',
  info:    'text-info bg-info/[.06] border-info/[.10]',
  neutral: 'text-sub bg-[var(--surface)] border-[var(--border)]',
  purple:  'text-purple bg-purple/[.06] border-purple/[.10]',
  ai:      'text-brand bg-brand/[.06] border-brand/[.12] tracking-wide',
};

export function Badge({ variant = 'neutral', children, className }: { variant?: BadgeVariant; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[1px] rounded border whitespace-nowrap', badgeStyles[variant], className)}>
      {children}
    </span>
  );
}

/* ── Score Pill ── */
export function ScorePill({ scores }: { scores: FIUACScores }) {
  const c = compositeScore(scores);
  const cls = c >= 70 ? 'score-strong' : c >= 45 ? 'score-moderate' : 'score-weak';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-[2px] rounded text-[11px] font-bold font-mono ${cls}`} title={`F:${scores.f} I:${scores.i} U:${scores.u} A:${scores.a} C:${scores.c}`}>
      <svg width="12" height="12" viewBox="0 0 36 36" className="shrink-0">
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="3" />
        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${c * 0.942} 100`} transform="rotate(-90 18 18)" />
      </svg>
      {c}
    </span>
  );
}

/* ── FIUAC Bars ── */
const dims: { key: keyof FIUACScores; label: string; color: string }[] = [
  { key: 'f', label: 'F', color: 'bg-brand' },
  { key: 'i', label: 'I', color: 'bg-info' },
  { key: 'u', label: 'U', color: 'bg-warn' },
  { key: 'a', label: 'A', color: 'bg-purple' },
  { key: 'c', label: 'C', color: 'bg-teal' },
];

export function FIUACBars({ scores }: { scores: FIUACScores }) {
  return (
    <div className="flex items-center gap-1">
      {dims.map(d => (
        <div key={d.key} className="flex items-center gap-0.5" title={`${d.label}: ${scores[d.key]}`}>
          <span className="text-[7px] font-semibold text-muted">{d.label}</span>
          <div className="w-6 h-[3px] rounded-full bg-white/[.04] overflow-hidden">
            <div className={`h-full rounded-full ${d.color}`} style={{ width: `${scores[d.key]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Health Bar ── */
export function HealthBar({ health }: { health: DealHealth }) {
  const avg = healthAvg(health);
  const filled = Math.round(avg / 20);
  const cls = avg >= 60 ? 'bg-brand' : avg >= 40 ? 'bg-warn' : 'bg-danger';
  return (
    <div className="flex gap-[2px] items-center" title={`Health: ${avg}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn('w-[4px] h-[12px] rounded-sm', i < filled ? cls : 'bg-white/[.04]')} />
      ))}
    </div>
  );
}

/* ── Confidence Badge ── */
export function ConfBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const dotCls = value >= 0.8 ? 'conf-high' : value >= 0.6 ? 'conf-med' : 'conf-low';
  const textCls = value >= 0.8 ? 'text-brand' : value >= 0.6 ? 'text-warn' : 'text-danger';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold font-mono ${textCls}`}>
      <span className={`conf-dot ${dotCls}`} />{pct}%
    </span>
  );
}

/* ── Agent Tag ── */
export function AgentTag({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-[1px] rounded bg-brand/[.06] text-brand border border-brand/[.10]', className)}>
      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
      {name}
    </span>
  );
}

/* ── Avatar ── */
const colorMap: Record<string, string> = {
  green: 'bg-emerald-900/40 text-emerald-400 border border-emerald-500/10',
  blue: 'bg-blue-900/40 text-blue-400 border border-blue-500/10',
  purple: 'bg-purple-900/40 text-purple-400 border border-purple-500/10',
  default: 'bg-[var(--surface)] text-sub border border-[var(--border)]',
};
const sizeMap = { xs: 'w-5 h-5 text-[8px]', sm: 'w-6 h-6 text-[9px]', md: 'w-8 h-8 text-[11px]', lg: 'w-10 h-10 text-[13px]' };

export function Avatar({ initials, color = 'default', size = 'sm' }: { initials: string; color?: string; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cn('rounded-md flex items-center justify-center font-semibold shrink-0', colorMap[color] || colorMap.default, sizeMap[size])}>
      {initials}
    </div>
  );
}

/* ── Stage Badge ── */
const stageColors: Record<string, string> = {
  Contacted: 'text-blue-400 border-blue-400/12 bg-blue-400/[.05]',
  Discovery: 'text-purple border-purple/12 bg-purple/[.05]',
  Qualified: 'text-teal border-teal/12 bg-teal/[.05]',
  'Solution Fit': 'text-brand border-brand/12 bg-brand/[.05]',
  Proposal: 'text-warn border-warn/12 bg-warn/[.05]',
  Negotiation: 'text-orange-400 border-orange-400/12 bg-orange-400/[.05]',
  'Verbal Commit': 'text-pink-400 border-pink-400/12 bg-pink-400/[.05]',
  'Closed Won': 'text-brand border-brand/12 bg-brand/[.05]',
  'Closed Lost': 'text-muted border-[var(--border)] bg-white/[.02]',
};

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[1px] rounded border whitespace-nowrap ${stageColors[stage] || stageColors.Contacted}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />{stage}
    </span>
  );
}

/* ── Section Title ── */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-muted mb-2">{children}</div>;
}

/* ── Empty State ── */
export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="py-12 px-6 text-center">
      <div className="text-2xl mb-2 opacity-30">{icon}</div>
      <div className="text-[13px] font-medium text-sub mb-1">{title}</div>
      <div className="text-[12px] text-muted leading-relaxed max-w-[280px] mx-auto">{description}</div>
    </div>
  );
}

/* ── Skeleton Primitives ── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-[var(--card-hover)] rounded', className)} />;
}

export function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3 w-full', className)} />;
}

export function SkeletonCard({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl bg-[var(--elevated)] border border-[var(--border)] p-3.5', className)}>
      {children}
    </div>
  );
}

/* ── Error State ── */
export function ErrorState({ message = 'Something went wrong', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="py-16 px-6 text-center">
      <AlertTriangle className="w-8 h-8 text-[var(--sub)] mx-auto mb-3 opacity-40" />
      <div className="text-[13px] font-medium text-[var(--sub)] mb-3">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-[12px] font-medium text-[var(--brand)] hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
