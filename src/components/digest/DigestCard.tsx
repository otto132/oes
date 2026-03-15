'use client';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { WeeklyDigest } from '@/lib/types';
import { TrendingUp, TrendingDown, Building2, Calendar, ListTodo, AlertTriangle } from 'lucide-react';

interface Props {
  digest: WeeklyDigest;
  expanded?: boolean;
  onClick?: () => void;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function DigestCard({ digest, expanded = false, onClick }: Props) {
  const ps = digest.pipelineSnapshot;
  const deltaPositive = ps.valueDelta >= 0;

  if (!expanded) {
    // Compact view for archive list
    return (
      <button onClick={onClick} className="w-full text-left p-3 rounded-lg border border-[var(--border)] bg-[var(--elevated)] hover:bg-[var(--hover)] transition-colors">
        <div className="text-sm font-medium">{formatDateRange(digest.weekStart, digest.weekEnd)}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-sub">
          <span className="font-mono">{formatCurrency(ps.totalValue)}</span>
          <span className={cn('inline-flex items-center gap-0.5', deltaPositive ? 'text-brand' : 'text-danger')}>
            {deltaPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {deltaPositive ? '+' : ''}{formatCurrency(ps.valueDelta)}
          </span>
        </div>
      </button>
    );
  }

  // Expanded view
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{formatDateRange(digest.weekStart, digest.weekEnd)}</h2>
        <p className="text-xs text-muted mt-1">Generated {new Date(digest.createdAt).toLocaleString()}</p>
      </div>

      {/* Pipeline Snapshot */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          <TrendingUp className="w-4 h-4 text-brand" /> Pipeline Snapshot
        </h3>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-2xl font-bold font-mono">{formatCurrency(ps.totalValue)}</span>
          <span className={cn('text-sm font-medium', deltaPositive ? 'text-brand' : 'text-danger')}>
            {deltaPositive ? '+' : ''}{formatCurrency(ps.valueDelta)} ({ps.valueDeltaPct > 0 ? '+' : ''}{ps.valueDeltaPct.toFixed(1)}%)
          </span>
        </div>

        {ps.stageChanges.length > 0 && (
          <div className="mb-3">
            <div className="text-3xs font-semibold tracking-widest uppercase text-muted mb-1">Stage Changes</div>
            {ps.stageChanges.map((sc, i) => (
              <div key={i} className="text-xs text-sub py-0.5">{sc.name}: {sc.from} → {sc.to}</div>
            ))}
          </div>
        )}

        {ps.closedWon.length > 0 && (
          <div className="mb-3">
            <div className="text-3xs font-semibold tracking-widest uppercase text-muted mb-1">Closed Won</div>
            {ps.closedWon.map((d, i) => (
              <div key={i} className="text-xs py-0.5"><Badge variant="ok" className="!text-3xs mr-1">Won</Badge>{d.name} — {formatCurrency(d.amount)}</div>
            ))}
          </div>
        )}

        {ps.closedLost.length > 0 && (
          <div className="mb-3">
            <div className="text-3xs font-semibold tracking-widest uppercase text-muted mb-1">Closed Lost</div>
            {ps.closedLost.map((d, i) => (
              <div key={i} className="text-xs py-0.5"><Badge variant="err" className="!text-3xs mr-1">Lost</Badge>{d.name} — {formatCurrency(d.amount)}</div>
            ))}
          </div>
        )}

        {ps.atRisk.length > 0 && (
          <div>
            <div className="text-3xs font-semibold tracking-widest uppercase text-muted mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-warn" /> At Risk
            </div>
            {ps.atRisk.map((d, i) => (
              <div key={i} className="text-xs py-0.5 text-warn">{d.name} (health dropped {d.healthDrop}pts)</div>
            ))}
          </div>
        )}
      </section>

      {/* Account Highlights */}
      {digest.accountHighlights.length > 0 && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-4">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Building2 className="w-4 h-4 text-brand" /> Account Highlights
          </h3>
          {digest.accountHighlights.map((ah, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{ah.accountName}</span>
                <Badge variant="neutral" className="!text-3xs">{ah.activityCount} activities</Badge>
              </div>
              <p className="text-xs text-sub leading-relaxed">{ah.narrative}</p>
            </div>
          ))}
        </section>
      )}

      {/* Week Ahead */}
      <section className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
          <Calendar className="w-4 h-4 text-brand" /> Week Ahead
        </h3>

        {digest.weekAhead.meetings.length > 0 && (
          <div className="mb-3">
            <div className="text-3xs font-semibold tracking-widest uppercase text-muted mb-1">Meetings</div>
            {digest.weekAhead.meetings.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1 text-xs">
                <span>{m.title} {m.accountName && <span className="text-muted">· {m.accountName}</span>}</span>
                <span className="text-muted">{new Date(m.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        )}

        {digest.weekAhead.tasksDue.length > 0 && (
          <div className="mb-3">
            <div className="text-3xs font-semibold tracking-widest uppercase text-muted mb-1 flex items-center gap-1">
              <ListTodo className="w-3 h-3" /> Tasks Due
            </div>
            {digest.weekAhead.tasksDue.map(t => (
              <div key={t.id} className="text-xs text-sub py-0.5">{t.title}</div>
            ))}
          </div>
        )}

        {digest.weekAhead.overdue.length > 0 && (
          <div>
            <div className="text-3xs font-semibold tracking-widest uppercase text-muted mb-1 text-warn">Overdue</div>
            {digest.weekAhead.overdue.map(t => (
              <div key={t.id} className="text-xs text-warn py-0.5">{t.title}</div>
            ))}
          </div>
        )}

        {digest.weekAhead.meetings.length === 0 && digest.weekAhead.tasksDue.length === 0 && digest.weekAhead.overdue.length === 0 && (
          <p className="text-xs text-muted">Nothing scheduled for next week.</p>
        )}
      </section>
    </div>
  );
}
