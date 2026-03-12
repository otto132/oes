'use client';
import { AlertTriangle } from 'lucide-react';
import { useLeadsQuery } from '@/lib/queries/leads';
import { Badge, Avatar, FIUACBars, ScorePill, EmptyState } from '@/components/ui';
import { compositeScore } from '@/lib/utils';
import type { Lead } from '@/lib/types';

export default function LeadsPage() {
  const { data, isLoading, error, refetch } = useLeadsQuery();
  const leads: Lead[] = data?.data ?? [];

  const stageMeta: Record<string, { variant: 'info' | 'warn' | 'ok' }> = {
    New: { variant: 'info' }, Researching: { variant: 'warn' }, Qualified: { variant: 'ok' },
  };

  if (isLoading) {
    return (
      <div className="max-w-[1200px]">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <div className="h-[18px] w-24 bg-[var(--surface)] rounded animate-pulse" />
            <div className="h-3.5 w-56 bg-[var(--surface)] rounded animate-pulse mt-1" />
          </div>
        </div>

        {/* Desktop kanban skeleton */}
        <div className="hidden md:flex gap-2.5 overflow-x-auto pb-4">
          {['New', 'Researching', 'Qualified'].map(stage => (
            <div key={stage} className="flex-shrink-0 w-[260px]">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <div className="h-5 w-20 bg-[var(--surface)] rounded animate-pulse" />
                <div className="h-3 w-4 bg-[var(--surface)] rounded animate-pulse" />
              </div>
              <div className="min-h-[50px] flex flex-col gap-1.5">
                {Array.from({ length: stage === 'New' ? 3 : 2 }).map((_, i) => (
                  <div key={i} className="rounded-lg p-3 bg-[var(--elevated)] border border-[var(--border)]">
                    <div className="h-2.5 w-24 bg-[var(--surface)] rounded animate-pulse mb-1" />
                    <div className="h-3 w-36 bg-[var(--surface)] rounded animate-pulse mb-1.5" />
                    <div className="h-2.5 w-full bg-[var(--surface)] rounded animate-pulse mb-2" />
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex gap-1">
                        <div className="h-3.5 w-12 bg-[var(--surface)] rounded animate-pulse" />
                        <div className="h-3.5 w-12 bg-[var(--surface)] rounded animate-pulse" />
                      </div>
                      <div className="w-5 h-5 rounded-full bg-[var(--surface)] animate-pulse" />
                    </div>
                    <div className="h-2.5 w-full bg-[var(--surface)] rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile skeleton */}
        <div className="md:hidden flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg p-3 bg-[var(--elevated)] border border-[var(--border)]">
              <div className="flex items-center justify-between mb-1">
                <div className="h-3 w-32 bg-[var(--surface)] rounded animate-pulse" />
                <div className="h-3 w-16 bg-[var(--surface)] rounded animate-pulse" />
              </div>
              <div className="h-2.5 w-24 bg-[var(--surface)] rounded animate-pulse mb-1.5" />
              <div className="h-2.5 w-full bg-[var(--surface)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1200px] flex flex-col items-center justify-center py-20">
        <AlertTriangle className="w-10 h-10 text-danger mb-3" />
        <p className="text-[13px] font-medium mb-1">Failed to load leads</p>
        <p className="text-[11px] text-muted mb-4">{error.message}</p>
        <button onClick={() => refetch()} className="text-[12px] font-semibold text-brand border border-brand/30 rounded-md px-4 py-2 hover:bg-[var(--hover)] transition-colors">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] page-enter">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Leads</h1>
          <p className="text-[12.5px] text-sub mt-0.5">{leads.length} active leads · signal-sourced and manual</p>
        </div>
      </div>

      {/* Desktop kanban */}
      <div className="hidden md:flex gap-2.5 overflow-x-auto pb-4">
        {(['New', 'Researching', 'Qualified'] as const).map(stage => {
          const cards = leads.filter(l => l.stage === stage);
          return (
            <div key={stage} className="flex-shrink-0 w-[260px]">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <Badge variant={stageMeta[stage]?.variant || 'neutral'}>{stage}</Badge>
                <span className="font-mono text-[10px] text-muted">{cards.length}</span>
              </div>
              <div className="min-h-[50px]">
                {cards.length === 0 ? (
                  <div className="h-[50px] rounded-lg border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-muted">No items</div>
                ) : cards.map(l => (
                  <div key={l.id} className="rounded-lg p-3 mb-1.5 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:-translate-y-px hover:border-[var(--border-strong)] transition-all">
                    <div className="text-[10px] text-muted mb-0.5">{l.type || 'Unknown'} · {l.country || '—'}</div>
                    <div className="text-[12.5px] font-medium mb-1.5">{l.company}</div>
                    <div className="text-[11px] text-sub leading-tight line-clamp-2 mb-2">{l.pain || 'No pain hypothesis yet'}</div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">{l.fit.slice(0, 2).map(f => <Badge key={f} variant="ok" className="!text-[8px]">{f}</Badge>)}</div>
                      <Avatar initials={l.owner.ini} color={l.owner.ac} size="xs" />
                    </div>
                    <div className="flex items-center gap-1.5"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile list */}
      <div className="md:hidden flex flex-col gap-1.5">
        {leads.length === 0 ? (
          <EmptyState icon="🎯" title="No active leads" description="Convert signals or add leads manually." />
        ) : [...leads].sort((a, b) => compositeScore(b.scores) - compositeScore(a.scores)).map(l => (
          <div key={l.id} className="rounded-lg p-3 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] hover:border-[var(--border-strong)] transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12.5px] font-medium">{l.company}</span>
              <Badge variant={stageMeta[l.stage]?.variant || 'neutral'} className="!text-[9px]">{l.stage}</Badge>
            </div>
            <div className="text-[11px] text-sub mb-1.5">{l.type} · {l.country || '—'}</div>
            <div className="flex items-center gap-1.5"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
