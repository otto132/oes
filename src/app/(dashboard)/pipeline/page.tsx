'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useOpportunitiesQuery, useCreateOpportunity, useMoveStage } from '@/lib/queries/opportunities';
import { Avatar, HealthBar, StageBadge, EmptyState, Skeleton, SkeletonCard, ErrorState } from '@/components/ui';
import { fmt, fDate, isOverdue, cn, displayLabel } from '@/lib/utils';
import { KANBAN_STAGES, STAGE_COLOR, STAGE_PROB, healthAvg } from '@/lib/types';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api-client';
import type { Opportunity } from '@/lib/types';

function riskHex(h: { healthEngagement: number; healthStakeholders: number; healthCompetitive: number; healthTimeline: number }): string {
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

function OpportunityCreateForm({
  prefilledAccountId,
  prefilledAccountName,
  onSubmit,
  registerSubmit,
}: {
  prefilledAccountId?: string;
  prefilledAccountName?: string;
  onSubmit: (data: { name: string; accountId: string; stage: string; amount: number; closeDate: string }) => void;
  registerSubmit: (fn: () => void) => void;
}) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(prefilledAccountId || '');
  const [accountQuery, setAccountQuery] = useState(prefilledAccountName || '');
  const [accountResults, setAccountResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAccountName, setSelectedAccountName] = useState(prefilledAccountName || '');
  const [stage, setStage] = useState('Contacted');
  const [amount, setAmount] = useState(0);
  const defaultClose = new Date(Date.now() + 90 * 864e5).toISOString().split('T')[0];
  const [closeDate, setCloseDate] = useState(defaultClose);

  // Debounced account search
  useEffect(() => {
    if (prefilledAccountId || !accountQuery.trim() || accountQuery === selectedAccountName) {
      setAccountResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.accounts.list({ q: accountQuery });
        const results = (res?.data ?? []).slice(0, 5);
        setAccountResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        setAccountResults([]);
        setShowDropdown(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [accountQuery, prefilledAccountId, selectedAccountName]);

  const handleSubmit = () => {
    onSubmit({ name, accountId, stage, amount, closeDate });
  };

  useEffect(() => { registerSubmit(handleSubmit); });

  const prob = STAGE_PROB[stage] ?? 0;

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(); }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Opportunity Name *</span>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Ørsted PPA Deal 2026"
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
        />
      </label>

      {/* Account typeahead */}
      <label className="flex flex-col gap-1 relative">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Account *</span>
        {prefilledAccountId ? (
          <div className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]">
            {prefilledAccountName}
          </div>
        ) : (
          <>
            <input
              value={accountQuery}
              onChange={e => { setAccountQuery(e.target.value); setAccountId(''); setSelectedAccountName(''); }}
              placeholder="Search for an account..."
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            />
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 z-10 mt-0.5 rounded-md bg-[var(--elevated)] border border-[var(--border)] shadow-lg max-h-[160px] overflow-y-auto">
                {accountResults.map((acc: any) => (
                  <button
                    key={acc.id}
                    type="button"
                    className="w-full text-left px-2.5 py-1.5 text-[12px] hover:bg-[var(--hover)] transition-colors flex items-center gap-1.5"
                    onMouseDown={e => {
                      e.preventDefault();
                      setAccountId(acc.id);
                      setAccountQuery(acc.name);
                      setSelectedAccountName(acc.name);
                      setShowDropdown(false);
                    }}
                  >
                    <span className="text-[var(--text)]">{acc.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--muted)]">{acc.type}</span>
                  </button>
                ))}
              </div>
            )}
            {accountQuery && !accountId && !showDropdown && accountQuery !== selectedAccountName && (
              <span className="text-[10px] text-warn">No account selected — search and pick one</span>
            )}
          </>
        )}
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Stage</span>
          <select
            value={stage}
            onChange={e => setStage(e.target.value)}
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          >
            {KANBAN_STAGES.map(s => <option key={s} value={s}>{displayLabel(s)}</option>)}
          </select>
          <span className="text-[10px] text-[var(--muted)]">Probability: {prob}%</span>
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</span>
          <input
            type="number"
            value={amount || ''}
            onChange={e => setAmount(Number(e.target.value) || 0)}
            placeholder="0"
            className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Close Date</span>
        <input
          type="date"
          value={closeDate}
          onChange={e => setCloseDate(e.target.value)}
          className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
        />
      </label>
    </div>
  );
}

export default function PipelinePage() {
  const { data, isLoading, error, refetch } = useOpportunitiesQuery();
  const createOpp = useCreateOpportunity();
  const moveStage = useMoveStage();
  const { openDrawer, closeDrawer, addToast } = useStore();
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  function openNewOppDrawer(prefilledAccountId?: string, prefilledAccountName?: string) {
    const submitRef = { current: () => {} };

    openDrawer({
      title: 'New Opportunity',
      subtitle: prefilledAccountName ? `For ${prefilledAccountName}` : 'Create a new deal',
      body: (
        <OpportunityCreateForm
          prefilledAccountId={prefilledAccountId}
          prefilledAccountName={prefilledAccountName}
          onSubmit={(data) => {
            if (!data.name.trim()) { addToast({ type: 'error', message: 'Name is required' }); return; }
            if (!data.accountId) { addToast({ type: 'error', message: 'Account is required' }); return; }
            createOpp.mutate(
              { name: data.name.trim(), accountId: data.accountId, stage: data.stage, amount: data.amount, closeDate: data.closeDate || undefined },
              {
                onSuccess: () => { addToast({ type: 'success', message: `Opportunity created: ${data.name}` }); closeDrawer(); },
                onError: (err) => addToast({ type: 'error', message: err.message }),
              }
            );
          }}
          registerSubmit={(fn) => { submitRef.current = fn; }}
        />
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-[12px] text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
          <button
            disabled={createOpp.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => submitRef.current()}
          >
            Create Opportunity
          </button>
        </>
      ),
    });
  }

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
        <div className="flex items-center gap-2">
          <div className="hidden md:flex border border-[var(--border)] rounded-md overflow-hidden">
            {(['kanban', 'table'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn(
                'px-2.5 py-1 text-[11px] capitalize transition-colors',
                view === v ? 'bg-[var(--surface)] text-[var(--text)]' : 'bg-transparent text-[var(--sub)] hover:bg-[var(--hover)]'
              )}>{v === 'kanban' ? 'Board' : 'Table'}</button>
            ))}
          </div>
          <button
            onClick={() => openNewOppDrawer()}
            className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors"
          >
            + New Opportunity
          </button>
        </div>
      </div>

      {/* Desktop kanban with drag & drop */}
      {view === 'kanban' && (
        <div className="hidden md:flex gap-2.5 overflow-x-auto pb-4">
          {KANBAN_STAGES.map(stage => {
            const cards = open.filter(o => o.stage === stage);
            const stageAmt = cards.reduce((s, o) => s + o.amount, 0);
            const isOver = dropStage === stage;
            return (
              <div
                key={stage}
                className={cn(
                  'flex-shrink-0 w-[230px] rounded-lg transition-colors',
                  isOver && 'bg-brand/5 ring-1 ring-brand/20'
                )}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDragEnter={() => {
                  dragCounter.current[stage] = (dragCounter.current[stage] || 0) + 1;
                  setDropStage(stage);
                }}
                onDragLeave={() => {
                  dragCounter.current[stage] = (dragCounter.current[stage] || 0) - 1;
                  if (dragCounter.current[stage] <= 0) {
                    dragCounter.current[stage] = 0;
                    setDropStage(prev => prev === stage ? null : prev);
                  }
                }}
                onDrop={e => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  dragCounter.current = {};
                  setDropStage(null);
                  setDragId(null);
                  if (id) {
                    const opp = open.find(o => o.id === id);
                    if (opp && opp.stage !== stage) {
                      moveStage.mutate(
                        { id, stage },
                        { onError: (err) => addToast({ type: 'error', message: err.message }) }
                      );
                    }
                  }
                }}
              >
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <StageBadge stage={stage} />
                  {stageAmt > 0 && <span className="font-mono text-[9px] uppercase text-[var(--muted)]">{fmt(stageAmt)}</span>}
                </div>
                <div className="min-h-[50px]">
                  {cards.length === 0 ? (
                    <div className={cn(
                      'h-[50px] rounded-lg border border-dashed flex items-center justify-center text-[10px] text-[var(--muted)] transition-colors',
                      isOver ? 'border-brand/40 bg-brand/5' : 'border-[var(--border)]'
                    )}>
                      {isOver ? 'Drop here' : 'No items'}
                    </div>
                  ) : cards.map(o => {
                    const stageIdx = KANBAN_STAGES.indexOf(o.stage);
                    const progress = ((stageIdx + 1) / KANBAN_STAGES.length) * 100;
                    const stageColor = STAGE_COLOR[o.stage] || '#3ecf8e';
                    return (
                    <Link key={o.id} href={`/pipeline/${o.id}`} draggable={false}>
                      <div
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('text/plain', o.id);
                          e.dataTransfer.effectAllowed = 'move';
                          requestAnimationFrame(() => setDragId(o.id));
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDropStage(null);
                          dragCounter.current = {};
                        }}
                        className={cn(
                          'stagger-item rounded-lg mb-1.5 bg-[var(--elevated)] border border-[var(--border)] cursor-grab hover:-translate-y-px hover:border-[var(--border-strong)] transition-all overflow-hidden',
                          dragId === o.id && 'opacity-40 scale-[0.97] shadow-lg rotate-[1deg]'
                        )}
                        style={{ borderLeft: `2px solid ${riskHex(o.health)}` }}
                      >
                        {/* Stage progress bar */}
                        <div className="h-[2px] bg-[var(--surface)]">
                          <div className="h-full rounded-r-full transition-all" style={{ width: `${progress}%`, background: stageColor }} />
                        </div>
                        <div className="p-3">
                          <div className="text-[10px] text-[var(--muted)] mb-0.5">{o.accountName}</div>
                          <div className="text-[11.5px] font-medium leading-tight mb-2 text-[var(--text)]">{o.name}</div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono font-semibold text-[11px] text-[var(--text)]">{fmt(o.amount)}</span>
                            <HealthBar health={o.health} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Avatar initials={o.owner.initials} color={o.owner.color} size="xs" />
                            <span className="text-[9px] text-[var(--muted)] bg-[var(--surface)] px-1.5 py-0.5 rounded">{STAGE_PROB[o.stage]}%</span>
                          </div>
                          {o.nextAction && <div className="text-[9.5px] text-[var(--muted)] mt-1.5 leading-tight line-clamp-2">→ {o.nextAction}</div>}
                        </div>
                      </div>
                    </Link>
                  );})}
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
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><div className="font-medium text-[12.5px] text-[var(--text)]">{o.name}</div><div className="text-[10px] text-[var(--muted)]">{o.accountName}</div></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><StageBadge stage={o.stage} /></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)] font-mono font-semibold text-[12px] text-[var(--text)]">{fmt(o.amount)}</td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><div className="flex items-center gap-1.5"><HealthBar health={o.health} /><span className="text-[10px]" style={{ color: riskHex(o.health) }}>{healthAvg(o.health)}</span></div></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><span className={`font-mono text-[11px] ${isOverdue(o.closeDate) ? 'text-danger' : 'text-[var(--sub)]'}`}>{fDate(o.closeDate)}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-[var(--border)]"><Avatar initials={o.owner.initials} color={o.owner.color} size="xs" /></td>
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
                <span className="font-mono font-semibold text-[11px] text-[var(--text)]">{fmt(o.amount)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StageBadge stage={o.stage} />
                <HealthBar health={o.health} />
                <span className="text-[10px] text-[var(--muted)]">{o.accountName}</span>
              </div>
              {o.nextAction && <div className="text-[10px] text-[var(--muted)] mt-1">→ {o.nextAction}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
