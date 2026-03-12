'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useSignalsQuery } from '@/lib/queries/signals';
import { Badge, ConfBadge, AgentTag, EmptyState } from '@/components/ui';
import { signalLabel, signalColor, fR, cn, confNum } from '@/lib/utils';
import { Zap, Check } from 'lucide-react';
import type { Signal } from '@/lib/types';

const FILTERS = [
  { k: 'all', l: 'All' }, { k: 'ppa_announcement', l: 'PPA' }, { k: 'renewable_target', l: 'Target' },
  { k: 'job_posting', l: 'Hiring' }, { k: 'market_entry', l: 'Market Entry' },
  { k: 'registry_pain', l: 'Registry Pain' }, { k: 'conference', l: 'Conference' },
];

export default function SignalsPage() {
  const { openDrawer, closeDrawer } = useStore();
  const [filter, setFilter] = useState('all');
  const { data: resp } = useSignalsQuery(filter !== 'all' ? filter : undefined);
  const signals: Signal[] = resp?.data ?? [];

  const filtered = signals;

  function viewDetail(id: string) {
    const s = signals.find((x: any) => x.id === id);
    if (!s) return;
    openDrawer({
      title: 'Signal Detail',
      subtitle: `${signalLabel[s.type] || s.type} · ${s.src}`,
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="text-[15px] font-semibold leading-snug">{s.title}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="neutral">{signalLabel[s.type]}</Badge>
            <span className="text-[11px] text-[var(--muted)]">Relevance: <span className={`font-mono font-semibold ${s.rel > 80 ? 'text-[var(--brand)]' : 'text-[#eab308]'}`}>{s.rel}/100</span></span>
            <ConfBadge value={confNum(s.conf)} />
            <AgentTag name={s.agent} />
          </div>
          <div className="ai-box"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--brand)] mb-1">AI Analysis</div><p className="text-[12.5px] text-[var(--sub)] leading-relaxed">{s.sum}</p></div>
          <div className="ai-box"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--brand)] mb-1">AI Reasoning</div><p className="text-[12.5px] text-[var(--sub)] leading-relaxed">{s.why}</p></div>
          <div className="text-[10px] text-[var(--muted)] border-t border-[var(--border)] pt-2">
            <strong>Source:</strong>{' '}
            {s.srcUrl ? <a href={s.srcUrl} target="_blank" rel="noreferrer" className="text-[var(--brand)] underline decoration-dotted">{s.src}</a> : s.src}
            {' · Retrieved '}{fR(s.at)}
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12.5px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Dismiss</button>
          <button className="px-3.5 py-1.5 text-[12.5px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors" onClick={closeDrawer}>Convert to Lead</button>
        </>
      ),
    });
  }

  return (
    <div className="max-w-[900px] page-enter">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--text)]">Signals</h1>
          <p className="text-[12.5px] text-[var(--sub)] mt-0.5">{filtered.length} active · AI market monitoring</p>
        </div>
        <Badge variant="ai">Signal Hunter Agent</Badge>
      </div>

      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex gap-1.5 overflow-x-auto">
          {FILTERS.map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)} className={cn(
              'px-2.5 py-1 text-[11px] rounded-md font-medium whitespace-nowrap transition-colors',
              filter === f.k ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border-strong)]' : 'text-[var(--sub)] hover:bg-[var(--hover)] border border-transparent'
            )}>{f.l}</button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon="📶" title="No signals match this filter" description="Try a different filter or wait for the Signal Hunter agent to detect new activity." />
        ) : filtered.map((s: any) => {
          const converted = s.status === 'converted';
          return (
            <div key={s.id} className={cn('flex items-start gap-2.5 px-4 py-3.5 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors cursor-pointer', converted && 'opacity-60')} onClick={() => viewDetail(s.id)}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--surface)]">
                {converted ? <Check className="w-[15px] h-[15px] text-[var(--brand)]" /> : <Zap className={`w-[15px] h-[15px] ${signalColor[s.type] || 'text-[var(--muted)]'}`} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium leading-tight text-[var(--text)]">{s.title}</div>
                <div className="text-[12.5px] text-[var(--sub)] mt-0.5 line-clamp-2">{s.sum}</div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <Badge variant="neutral" className="!text-[9px]">{signalLabel[s.type]}</Badge>
                  <span className="text-[10px] text-[var(--muted)]">Rel: <span className={`font-mono font-semibold ${s.rel > 80 ? 'text-[var(--brand)]' : 'text-[#eab308]'}`}>{s.rel}</span></span>
                  <ConfBadge value={confNum(s.conf)} />
                  <AgentTag name={s.agent} />
                  <span className="text-[10px] text-[var(--muted)]">{s.src} · {fR(s.at)}</span>
                </div>
              </div>
              {!converted && (
                <div className="flex gap-1 flex-shrink-0 self-start mt-0.5">
                  <button className="px-2 py-1 text-[11px] font-medium rounded-md bg-[var(--brand)] text-[#09090b] hover:brightness-110 transition-colors" onClick={e => e.stopPropagation()}>→ Lead</button>
                  <button className="px-1.5 py-1 text-[11px] text-[var(--sub)] hover:bg-[var(--hover)] rounded-md transition-colors" onClick={e => e.stopPropagation()}>✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
