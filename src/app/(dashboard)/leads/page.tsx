'use client';
import { useStore } from '@/lib/store';
import { useLeadsQuery, useAdvanceLead, useDisqualifyLead, useConvertLead } from '@/lib/queries/leads';
import { Badge, Avatar, FIUACBars, ScorePill, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
import { compositeScore } from '@/lib/utils';
import type { Lead } from '@/lib/types';

function LeadsSkeleton() {
  return (
    <div className="page-enter space-y-4">
      <div className="hidden md:grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="space-y-3">
            <Skeleton className="h-4 w-20" />
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} className="space-y-2">
                <SkeletonText className="w-2/3" />
                <SkeletonText className="w-full h-2" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-12 rounded-full" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
              </SkeletonCard>
            ))}
          </div>
        ))}
      </div>
      <div className="md:hidden space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-2">
            <SkeletonText className="w-2/3" />
            <SkeletonText className="w-full h-2" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const { data: resp, isLoading, isError, refetch } = useLeadsQuery();
  const { openDrawer, closeDrawer } = useStore();
  const addToast = useStore(s => s.addToast);
  const advance = useAdvanceLead();
  const disqualify = useDisqualifyLead();
  const convertLead = useConvertLead();

  if (isLoading) return <LeadsSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const leads: Lead[] = resp?.data ?? [];

  const stageMeta: Record<string, { variant: 'info' | 'warn' | 'ok' }> = {
    New: { variant: 'info' }, Researching: { variant: 'warn' }, Qualified: { variant: 'ok' },
  };

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
                  <div key={l.id} className="group rounded-lg p-3 mb-1.5 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:-translate-y-px hover:border-[var(--border-strong)] transition-all">
                    <div className="text-[10px] text-muted mb-0.5">{l.type || 'Unknown'} · {l.country || '—'}</div>
                    <div className="text-[12.5px] font-medium mb-1.5">{l.company}</div>
                    <div className="text-[11px] text-sub leading-tight line-clamp-2 mb-2">{l.pain || 'No pain hypothesis yet'}</div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">{l.fit.slice(0, 2).map(f => <Badge key={f} variant="ok" className="!text-[8px]">{f}</Badge>)}</div>
                      <Avatar initials={l.owner.ini} color={l.owner.ac} size="xs" />
                    </div>
                    <div className="flex items-center gap-1.5"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
                    {/* Action buttons — visible on hover (desktop) */}
                    <div className="hidden group-hover:flex items-center gap-1 mt-2 pt-2 border-t border-[var(--border)]">
                      {l.stage === 'Qualified' ? (
                        <button
                          disabled={convertLead.isPending}
                          onClick={() => openConvertDrawer(l)}
                          className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--brand)] text-[#09090b] hover:brightness-110 transition-colors disabled:opacity-50"
                        >
                          Convert
                        </button>
                      ) : (
                        <button
                          disabled={advance.isPending}
                          onClick={() => advance.mutate(l.id, {
                            onSuccess: (data: any) => addToast({ type: 'success', message: `Lead advanced to ${data?.data?.stage || 'next stage'}` }),
                            onError: (err: Error) => addToast({ type: 'error', message: err.message }),
                          })}
                          className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                        >
                          Advance
                        </button>
                      )}
                      <button
                        disabled={disqualify.isPending}
                        onClick={() => disqualify.mutate(l.id, {
                          onSuccess: () => addToast({ type: 'info', message: 'Lead disqualified' }),
                          onError: (err: Error) => addToast({ type: 'error', message: err.message }),
                        })}
                        className="px-2 py-1 text-[10px] text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                      >
                        Disqualify
                      </button>
                    </div>
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
            <div className="flex items-center gap-1.5 mb-2"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
            {/* Action buttons — always visible on mobile */}
            <div className="flex items-center gap-1 pt-2 border-t border-[var(--border)]">
              {l.stage === 'Qualified' ? (
                <button
                  disabled={convertLead.isPending}
                  onClick={() => openConvertDrawer(l)}
                  className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--brand)] text-[#09090b] hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  Convert
                </button>
              ) : (
                <button
                  disabled={advance.isPending}
                  onClick={() => advance.mutate(l.id, {
                    onSuccess: (data: any) => addToast({ type: 'success', message: `Lead advanced to ${data?.data?.stage || 'next stage'}` }),
                    onError: (err: Error) => addToast({ type: 'error', message: err.message }),
                  })}
                  className="flex-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                >
                  Advance
                </button>
              )}
              <button
                disabled={disqualify.isPending}
                onClick={() => disqualify.mutate(l.id, {
                  onSuccess: () => addToast({ type: 'info', message: 'Lead disqualified' }),
                  onError: (err: Error) => addToast({ type: 'error', message: err.message }),
                })}
                className="px-2 py-1 text-[10px] text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                Disqualify
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
