'use client';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { ApiError } from '@/lib/api-client';
import { useSignalsQuery, useConvertSignal, useDismissSignal } from '@/lib/queries/signals';
import { Badge, ConfBadge, AgentTag, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
import { signalLabel, signalColor, fR, cn, confNum } from '@/lib/utils';
import { Zap, Check } from 'lucide-react';
import type { Signal } from '@/lib/types';

const FILTERS = [
  { k: 'all', l: 'All' }, { k: 'ppa_announcement', l: 'PPA' }, { k: 'renewable_target', l: 'Target' },
  { k: 'job_posting', l: 'Hiring' }, { k: 'market_entry', l: 'Market Entry' },
  { k: 'registry_pain', l: 'Registry Pain' }, { k: 'conference', l: 'Conference' },
];

function SignalsSkeleton() {
  return (
    <div className="page-enter space-y-4">
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <SkeletonText className="w-3/4" />
          <SkeletonText className="w-full" />
          <SkeletonText className="w-1/2" />
        </SkeletonCard>
      ))}
    </div>
  );
}

export default function SignalsPage() {
  const { openDrawer, closeDrawer } = useStore();
  const [filter, setFilter] = useState('all');
  const { data: resp, isLoading, isError, refetch } = useSignalsQuery(filter !== 'all' ? filter : undefined);
  const signals: Signal[] = resp?.data ?? [];
  const convert = useConvertSignal();
  const dismiss = useDismissSignal();
  const addToast = useStore(s => s.addToast);

  if (isLoading) return <SignalsSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const filtered = signals;

  function openConvertDrawer(s: Signal) {
    const state = { company: s.title, type: 'Unknown', country: '' };

    openDrawer({
      title: 'Convert to Lead',
      subtitle: `From signal: ${s.title.slice(0, 50)}`,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Company Name</span>
            <input
              defaultValue={state.company}
              onChange={e => { state.company = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
            <select
              defaultValue={state.type}
              onChange={e => { state.type = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="Unknown">Unknown</option>
              <option value="PPA Buyer">PPA Buyer</option>
              <option value="Certificate Trader">Certificate Trader</option>
              <option value="Corporate Offtaker">Corporate Offtaker</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Country (optional)</span>
            <input
              defaultValue={state.country}
              onChange={e => { state.country = e.target.value; }}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
        </div>
      ),
      footer: (
        <>
          <button
            className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <button
            className="px-3.5 py-1.5 text-[12px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors"
            onClick={() => {
              if (!state.company.trim()) {
                addToast({ type: 'error', message: 'Company name is required' });
                return;
              }
              convert.mutate(
                { id: s.id, company: state.company.trim(), type: state.type, country: state.country.trim() || undefined },
                {
                  onSuccess: () => {
                    addToast({
                      type: 'success',
                      message: `Lead created for ${state.company}`,
                      action: { label: 'View Leads →', href: '/leads' },
                    });
                    closeDrawer();
                  },
                  onError: (err) => {
                    if (err instanceof ApiError && err.status === 409) {
                      addToast({ type: 'error', message: `Lead or account already exists for ${state.company}` });
                    } else {
                      addToast({ type: 'error', message: `Failed to convert signal: ${err.message}` });
                    }
                  },
                }
              );
            }}
          >
            Create Lead
          </button>
        </>
      ),
    });
  }

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
          <button className="px-3.5 py-1.5 text-[12.5px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Close</button>
          <button className="px-3.5 py-1.5 text-[12.5px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors" onClick={() => { closeDrawer(); openConvertDrawer(s); }}>Convert to Lead</button>
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
                  <button
                    className="px-2 py-1 text-[11px] font-medium rounded-md bg-[var(--brand)] text-[#09090b] hover:brightness-110 transition-colors"
                    onClick={e => { e.stopPropagation(); openConvertDrawer(s); }}
                  >
                    → Lead
                  </button>
                  <button
                    className="px-1.5 py-1 text-[11px] text-[var(--sub)] hover:bg-[var(--hover)] rounded-md transition-colors"
                    onClick={e => {
                      e.stopPropagation();
                      dismiss.mutate(s.id, {
                        onSuccess: () => addToast({ type: 'info', message: 'Signal dismissed' }),
                        onError: (err) => addToast({ type: 'error', message: err.message }),
                      });
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
