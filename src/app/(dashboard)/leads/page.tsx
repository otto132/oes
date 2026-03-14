'use client';
import { useStore } from '@/lib/store';
import { useLeadsQuery, useCreateLead, useAdvanceLead, useDisqualifyLead, useConvertLead } from '@/lib/queries/leads';
import { Badge, Avatar, FIUACBars, ScorePill, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState, Spinner, HelpTip } from '@/components/ui';
import { compositeScore, cn } from '@/lib/utils';
import type { Lead } from '@/lib/types';
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useState } from 'react';
import { RotateCw } from 'lucide-react';

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
  const createLead = useCreateLead();
  const advance = useAdvanceLead();
  const disqualify = useDisqualifyLead();
  const convertLead = useConvertLead();
  const pendingIds = usePendingMutations(['leads']);
  const failedMutations = useFailedMutations(['leads']);
  const [confirmDisqualify, setConfirmDisqualify] = useState<string | null>(null);

  function openCreateLeadDrawer() {
    const state = { company: '', type: 'Unknown', country: '', pain: '' };

    openDrawer({
      title: 'New Lead',
      subtitle: 'Add a lead manually',
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Company *</span>
            <input
              autoFocus
              defaultValue={state.company}
              onChange={e => { state.company = e.target.value; }}
              placeholder="e.g. Ørsted Energy"
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Type</span>
              <select
                defaultValue={state.type}
                onChange={e => { state.type = e.target.value; }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Unknown">Unknown</option>
                <option value="Utility">Utility</option>
                <option value="IPP">IPP</option>
                <option value="Corporate">Corporate</option>
                <option value="Trader">Trader</option>
                <option value="Registry">Registry</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Country</span>
              <input
                defaultValue={state.country}
                onChange={e => { state.country = e.target.value; }}
                placeholder="e.g. Norway"
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Pain Point</span>
            <textarea
              defaultValue={state.pain}
              onChange={e => { state.pain = e.target.value; }}
              rows={2}
              placeholder="What problem does this lead have?"
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-none"
            />
          </label>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Cancel</button>
          <button
            disabled={createLead.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.company.trim()) { addToast({ type: 'error', message: 'Company name is required' }); return; }
              createLead.mutate(
                { company: state.company.trim(), type: state.type || undefined, country: state.country || undefined, pain: state.pain || undefined },
                {
                  onSuccess: () => { addToast({ type: 'success', message: `Lead created: ${state.company}` }); closeDrawer(); },
                  onError: (err: unknown) => addToast({ type: 'error', message: err instanceof Error ? err.message : 'An error occurred' }),
                }
              );
            }}
          >
            {createLead.isPending && <Spinner className="h-3 w-3" />}Create Lead
          </button>
        </>
      ),
    });
  }

  function openConvertDrawer(l: Lead) {
    const state = {
      accountName: l.company,
      accountType: l.type || 'Unknown',
      country: l.country || '',
      createOpp: false,
      oppName: `${l.company} — Opportunity`,
      oppAmount: '',
      oppStage: 'Discovery',
    };

    openDrawer({
      title: 'Convert to Account',
      subtitle: l.company,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Account Name</span>
            <input
              defaultValue={state.accountName}
              onChange={e => { state.accountName = e.target.value; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Account Type</span>
            <select
              defaultValue={state.accountType}
              onChange={e => { state.accountType = e.target.value; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="Unknown">Unknown</option>
              <option value="PPA Buyer">PPA Buyer</option>
              <option value="Certificate Trader">Certificate Trader</option>
              <option value="Corporate Offtaker">Corporate Offtaker</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Country</span>
            <input
              defaultValue={state.country}
              onChange={e => { state.country = e.target.value; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>

          {/* Opportunity toggle */}
          <label className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
            <input
              type="checkbox"
              defaultChecked={state.createOpp}
              onChange={e => {
                state.createOpp = e.target.checked;
                const oppSection = document.getElementById('opp-fields');
                if (oppSection) oppSection.style.display = e.target.checked ? 'flex' : 'none';
              }}
              className="rounded border-[var(--border)]"
            />
            <span className="text-xs font-medium text-[var(--text)]">Also create opportunity</span>
          </label>
          <div id="opp-fields" className="flex-col gap-3" style={{ display: 'none' }}>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Opportunity Name</span>
              <input
                defaultValue={state.oppName}
                onChange={e => { state.oppName = e.target.value; }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</span>
              <input
                type="number"
                placeholder="0"
                onChange={e => { state.oppAmount = e.target.value; }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Stage</span>
              <select
                defaultValue={state.oppStage}
                onChange={e => { state.oppStage = e.target.value; }}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              >
                <option value="Identified">Identified</option>
                <option value="Contacted">Contacted</option>
                <option value="Discovery">Discovery</option>
                <option value="Qualified">Qualified</option>
              </select>
            </label>
          </div>
        </div>
      ),
      footer: (
        <>
          <button
            className="px-3.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <button
            disabled={convertLead.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.accountName.trim()) {
                addToast({ type: 'error', message: 'Account name is required' });
                return;
              }
              if (state.createOpp && !state.oppName.trim()) {
                addToast({ type: 'error', message: 'Opportunity name is required' });
                return;
              }
              convertLead.mutate(
                {
                  id: l.id,
                  accountName: state.accountName.trim(),
                  accountType: state.accountType,
                  ...(state.createOpp ? {
                    oppName: state.oppName.trim(),
                    oppAmount: state.oppAmount ? Number(state.oppAmount) : undefined,
                    oppStage: state.oppStage,
                  } : {}),
                },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: `Account created: ${state.accountName}` });
                    closeDrawer();
                  },
                  onError: (err: any) => addToast({ type: 'error', message: err.message }),
                }
              );
            }}
          >
            {convertLead.isPending && <Spinner className="h-3 w-3" />}Convert
          </button>
        </>
      ),
    });
  }

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
          <div className="flex items-center gap-1.5"><h1 className="text-2xl font-semibold tracking-tight">Leads</h1><HelpTip label="FIUAC scores rate Fit, Intent, Urgency, Access, and Commercial on a 0-100 scale. Higher composite scores indicate stronger sales readiness." title="Lead Scoring" /></div>
          <p className="text-sm text-sub mt-0.5">{leads.length} active leads · signal-sourced and manual</p>
        </div>
        <button
          onClick={() => openCreateLeadDrawer()}
          className="px-3 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors"
        >
          + New Lead
        </button>
      </div>

      {/* Desktop kanban */}
      <div className="hidden md:flex gap-2.5 overflow-x-auto pb-4">
        {(['New', 'Researching', 'Qualified'] as const).map(stage => {
          const cards = leads.filter(l => l.stage === stage);
          return (
            <div key={stage} className="flex-shrink-0 w-[260px]">
              <div className="flex items-center justify-between mb-1.5 px-1">
                <Badge variant={stageMeta[stage]?.variant || 'neutral'}>{stage}</Badge>
                <span className="font-mono text-2xs text-muted">{cards.length}</span>
              </div>
              <div className="min-h-[50px]">
                {cards.length === 0 ? (
                  <div className="h-[50px] rounded-lg border border-dashed border-[var(--border)] flex items-center justify-center text-2xs text-muted">No items</div>
                ) : cards.map(l => {
                  const isPending = pendingIds.has(l.id);
                  const failedInfo = failedMutations.get(l.id);
                  return (
                  <div key={l.id} className={cn('group rounded-lg p-3 mb-1.5 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:-translate-y-px hover:border-[var(--border-strong)] transition-all relative', isPending && 'opacity-60 animate-pulse', failedInfo && 'border-l-2 border-l-red-500')}>
                    {failedInfo && (
                      <button
                        onClick={() => advance.mutate((failedInfo.variables as any))}
                        className="absolute top-1 right-1 p-0.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                        title={failedInfo.error}
                      >
                        <RotateCw className="w-2.5 h-2.5" />
                      </button>
                    )}
                    <div className="text-2xs text-muted mb-0.5">{l.type || 'Unknown'} · {l.country || '—'}</div>
                    <div className="text-sm font-medium mb-1.5">{l.company}</div>
                    <div className="text-xs text-sub leading-tight line-clamp-2 mb-2">{l.pain || 'No pain hypothesis yet'}</div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1">{l.moduleFit.slice(0, 2).map(f => <Badge key={f} variant="ok" className="!text-3xs">{f}</Badge>)}</div>
                      <Avatar initials={l.owner.initials} color={l.owner.color} size="xs" />
                    </div>
                    <div className="flex items-center gap-1.5"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
                    {/* Action buttons — visible on hover (desktop) */}
                    <div className="hidden group-hover:flex items-center gap-1 mt-2 pt-2 border-t border-[var(--border)]">
                      {l.stage === 'Qualified' ? (
                        <button
                          disabled={convertLead.isPending}
                          onClick={() => openConvertDrawer(l)}
                          className="flex-1 px-2 py-1 text-2xs font-medium rounded-md bg-brand text-brand-on hover:brightness-110 transition-colors disabled:opacity-50"
                        >
                          Convert
                        </button>
                      ) : (
                        <button
                          disabled={advance.isPending}
                          onClick={() => advance.mutate({ id: l.id }, {
                            onSuccess: (data: any) => addToast({ type: 'success', message: `Lead advanced to ${data?.data?.stage || 'next stage'}` }),
                            onError: (err: any) => addToast({ type: 'error', message: err.message }),
                          })}
                          className="inline-flex items-center justify-center gap-1 flex-1 px-2 py-1 text-2xs font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                        >
                          {advance.isPending && <Spinner className="h-3 w-3" />}Advance
                        </button>
                      )}
                      <button
                        disabled={disqualify.isPending}
                        onClick={() => setConfirmDisqualify(l.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-2xs text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                      >
                        {disqualify.isPending && <Spinner className="h-3 w-3" />}Disqualify
                      </button>
                    </div>
                  </div>
                );})}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile list */}
      <div className="md:hidden flex flex-col gap-1.5">
        {leads.length === 0 ? (
          <EmptyState icon="🎯" title="No active leads" description="Convert signals or add leads manually." action={{ label: 'Create Lead', onClick: () => openCreateLeadDrawer() }} />
        ) : [...leads].sort((a, b) => compositeScore(b.scores) - compositeScore(a.scores)).map(l => (
          <div key={l.id} className="rounded-lg p-3 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover)] hover:border-[var(--border-strong)] transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{l.company}</span>
              <Badge variant={stageMeta[l.stage]?.variant || 'neutral'} className="!text-3xs">{l.stage}</Badge>
            </div>
            <div className="text-xs text-sub mb-1.5">{l.type} · {l.country || '—'}</div>
            <div className="flex items-center gap-1.5 mb-2"><FIUACBars scores={l.scores} /><ScorePill scores={l.scores} /></div>
            {/* Action buttons — always visible on mobile */}
            <div className="flex items-center gap-1 pt-2 border-t border-[var(--border)]">
              {l.stage === 'Qualified' ? (
                <button
                  disabled={convertLead.isPending}
                  onClick={() => openConvertDrawer(l)}
                  className="flex-1 px-2 py-1 text-2xs font-medium rounded-md bg-brand text-brand-on hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  Convert
                </button>
              ) : (
                <button
                  disabled={advance.isPending}
                  onClick={() => advance.mutate({ id: l.id }, {
                    onSuccess: (data: any) => addToast({ type: 'success', message: `Lead advanced to ${data?.data?.stage || 'next stage'}` }),
                    onError: (err: any) => addToast({ type: 'error', message: err.message }),
                  })}
                  className="inline-flex items-center justify-center gap-1 flex-1 px-2 py-1 text-2xs font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                >
                  {advance.isPending && <Spinner className="h-3 w-3" />}Advance
                </button>
              )}
              <button
                disabled={disqualify.isPending}
                onClick={() => setConfirmDisqualify(l.id)}
                className="inline-flex items-center gap-1 px-2 py-1 text-2xs text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                {disqualify.isPending && <Spinner className="h-3 w-3" />}Disqualify
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmDisqualify}
        title="Disqualify Lead"
        message="Are you sure you want to disqualify this lead? This action cannot be undone."
        confirmLabel="Disqualify"
        onConfirm={() => {
          if (confirmDisqualify) {
            disqualify.mutate({ id: confirmDisqualify }, {
              onSuccess: () => addToast({ type: 'info', message: 'Lead disqualified' }),
              onError: (err: any) => addToast({ type: 'error', message: err.message }),
            });
          }
          setConfirmDisqualify(null);
        }}
        onCancel={() => setConfirmDisqualify(null)}
      />
    </div>
  );
}
