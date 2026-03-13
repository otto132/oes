'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useOpportunitiesQuery } from '@/lib/queries/opportunities';
import { Avatar, HealthBar, StageBadge, EmptyState, Skeleton, SkeletonCard, ErrorState } from '@/components/ui';
import { fmt, fDate, isOverdue, cn } from '@/lib/utils';
import { KANBAN_STAGES, healthAvg } from '@/lib/types';
import type { Opportunity } from '@/lib/types';

function riskHex(h: { eng: number; stake: number; comp: number; time: number }): string {
  const a = healthAvg(h);
  return a >= 60 ? '#33a882' : a >= 40 ? '#e8a838' : '#e05c5c';
}

function LoadingSkeleton() {
  return (
    <div className="max-w-[1400px]">
      <div className="mb-3.5">
        <Skeleton className="h-5 w-24 mb-1" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="hidden md:flex gap-2.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[230px]">
            <Skeleton className="h-4 w-20 mb-1.5 mx-1" />
            {Array.from({ length: 2 }).map((_, j) => (
              <SkeletonCard key={j} className="mb-1.5 h-[100px] p-3" />
            ))}
          </div>
        ))}
      </div>
      <div className="md:hidden flex flex-col gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="h-[72px] p-3" />
        ))}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data, isLoading, error, refetch } = useOpportunitiesQuery();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="max-w-[1400px]">
        <ErrorState message="Failed to load pipeline data." onRetry={() => refetch()} />
      </div>
    );
  }

  const open: Opportunity[] = data?.data ?? [];
  const totalPipe = data?.meta?.totalPipeline ?? 0;
  const totalWeighted = data?.meta?.weightedPipeline ?? 0;

  return (
    <div className="max-w-[1400px] page-enter">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">Pipeline</h1>
          <p className="text-[12.5px] text-[var(--sub)] mt-0.5">
            {open.length} open · <span className="font-mono font-semibold">{fmt(totalPipe)}</span> total · <span className="font-mono text-[var(--sub)]">{fmt(totalWeighted)}</span> weighted
          </p>
        </div>
        <div className="hidden md:flex border border-[var(--border)] rounded-md overflow-hidden">
          {(['kanban', 'table'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={cn(
              'px-2.5 py-1 text-[11px] capitalize transition-colors',
              view === v ? 'bg-[var(--surface)] text-[var(--text)]' : 'bg-transparent text-[var(--sub)] hover:bg-[var(--hover)]'
            )}>{v === 'kanban' ? 'Board' : 'Table'}</button>
          ))}
        </div>
      </div>

      {/* Desktop kanban */}
      {view === 'kanban' && (
        <div className="hidden md:flex gap-2.5 overflow-x-auto pb-4">
          {KANBAN_STAGES.map(stage => {
            const cards = open.filter(o => o.stage === stage);
            const stageAmt = cards.reduce((s, o) => s + o.amt, 0);
            return (
              <div key={stage} className="flex-shrink-0 w-[230px]">
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <StageBadge stage={stage} />
                  {stageAmt > 0 && <span className="font-mono text-[9px] uppercase text-[var(--muted)]">{fmt(stageAmt)}</span>}
                </div>
                <div className="min-h-[50px]">
                  {cards.length === 0 ? (
                    <div className="h-[50px] rounded-lg border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--muted)]">No items</div>
                  ) : cards.map(o => (
                    <Link key={o.id} href={`/pipeline/${o.id}`}>
                      <div className="rounded-lg p-3 mb-1.5 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:-translate-y-px hover:border-[var(--border-strong)] transition-all" style={{ borderLeft: `2px solid ${riskHex(o.health)}` }}>
                        <div className="text-[10px] text-[var(--muted)] mb-0.5">{o.accName}</div>
                        <div className="text-[11.5px] font-medium leading-tight mb-2 text-[var(--text)]">{o.name}</div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-semibold text-[11px] text-[var(--text)]">{fmt(o.amt)}</span>
                          <HealthBar health={o.health} />
                        </div>
                        <Avatar initials={o.owner.ini} color={o.owner.ac} size="xs" />
                        {o.next && <div className="text-[9.5px] text-[var(--muted)] mt-1.5 leading-tight line-clamp-2">→ {o.next}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Desktop table */}
      {view === 'table' && (
        <div className="hidden md:block rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>{['Opportunity', 'Stage', 'Amount', 'Health', 'Close', 'Owner'].map(h => (
                <th key={h} className="text-[9px] font-semibold uppercase tracking-wide text-[var(--muted)] text-left px-3.5 py-2 bg-[var(--surface)] border-b border-[var(--border)] whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {open.map(o => (
                <tr key={o.id} className="hover:bg-[var(--hover)] cursor-pointer transition-colors" onClick={() => window.location.href = `/pipeline/${o.id}`}>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><div className="font-medium text-[12.5px] text-[var(--text)]">{o.name}</div><div className="text-[10px] text-[var(--muted)]">{o.accName}</div></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><StageBadge stage={o.stage} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)] font-mono font-semibold text-[12px] text-[var(--text)]">{fmt(o.amt)}</td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><div className="flex items-center gap-1.5"><HealthBar health={o.health} /><span className="text-[10px]" style={{ color: riskHex(o.health) }}>{healthAvg(o.health)}</span></div></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className={`font-mono text-[11px] ${isOverdue(o.close) ? 'text-danger' : 'text-[var(--sub)]'}`}>{fDate(o.close)}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Avatar initials={o.owner.ini} color={o.owner.ac} size="xs" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile list */}
      <div className="md:hidden flex flex-col gap-1.5">
        {open.length === 0 ? (
          <EmptyState icon="↗" title="No open opportunities" description="Create one from an account or convert a qualified lead." />
        ) : open.sort((a, b) => healthAvg(a.health) - healthAvg(b.health)).map(o => (
          <Link key={o.id} href={`/pipeline/${o.id}`}>
            <div className="rounded-lg p-3 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] transition-colors" style={{ borderLeft: `3px solid ${riskHex(o.health)}` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12.5px] font-medium text-[var(--text)]">{o.name}</span>
                <span className="font-mono font-semibold text-[11px] text-[var(--text)]">{fmt(o.amt)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StageBadge stage={o.stage} />
                <HealthBar health={o.health} />
                <span className="text-[10px] text-[var(--muted)]">{o.accName}</span>
              </div>
              {o.next && <div className="text-[10px] text-[var(--muted)] mt-1">→ {o.next}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
