'use client';
import { useLeadsQuery } from '@/lib/queries/leads';
import { Badge, Avatar, FIUACBars, ScorePill, EmptyState } from '@/components/ui';
import { compositeScore } from '@/lib/utils';
import type { Lead } from '@/lib/types';

export default function LeadsPage() {
  const { data: resp } = useLeadsQuery();
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
