'use client';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useLeadsQuery, useCreateLead, useAdvanceLead, useDisqualifyLead, useConvertLead, usePauseLead, useRequalifyLead, usePausedLeadsQuery } from '@/lib/queries/leads';
import { Badge, Avatar, FIUACBars, ScorePill, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState, Spinner, HelpTip, BulkActionBar } from '@/components/ui';
import { useBulkAdvanceLeads, useBulkDisqualifyLeads, useBulkAssignLeads } from '@/lib/queries/bulk';
import { useTeamQuery } from '@/lib/queries/settings';
import { compositeScore, cn } from '@/lib/utils';
import type { Lead } from '@/lib/types';
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
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

// ── Convert Modal ──────────────────────────────────────────────────────────────
function ConvertModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const addToast = useStore(s => s.addToast);
  const convertLead = useConvertLead();

  const defaultOppName = `${lead.company} — ${lead.moduleFit?.[0] ?? 'New Deal'}`;
  const defaultCloseDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().split('T')[0];
  })();

  const [oppName, setOppName] = useState(defaultOppName);
  const [accountName, setAccountName] = useState(lead.company);
  const [accountType, setAccountType] = useState(lead.type || 'Unknown');
  const [amount, setAmount] = useState('0');
  const [closeDate, setCloseDate] = useState(defaultCloseDate);

  function handleSubmit() {
    if (!oppName.trim()) { addToast({ type: 'error', message: 'Opportunity name is required' }); return; }
    if (!accountName.trim()) { addToast({ type: 'error', message: 'Account name is required' }); return; }
    convertLead.mutate(
      {
        id: lead.id,
        accountName: accountName.trim(),
        accountType,
        oppName: oppName.trim(),
        oppAmount: amount ? Number(amount) : 0,
        closeDate,
      },
      {
        onSuccess: () => {
          addToast({ type: 'success', message: `Deal created for ${accountName}` });
          onClose();
        },
        onError: (err: any) => addToast({ type: 'error', message: err.message }),
      }
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[var(--elevated)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Create Deal</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">{lead.company}</p>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Opportunity Name *</span>
            <input
              autoFocus
              value={oppName}
              onChange={e => setOppName(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Account Name *</span>
            <input
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Account Type *</span>
            <select
              value={accountType}
              onChange={e => setAccountType(e.target.value)}
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
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Initial Stage</span>
            <span className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)]">Discovery</span>
          </label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Estimated Amount</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Expected Close</span>
              <input
                type="date"
                value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={convertLead.isPending}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {convertLead.isPending && <Spinner className="h-3 w-3" />}Create Deal
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Disqualify Dialog ─────────────────────────────────────────────────────────
const DISQUALIFY_REASONS = ['No Budget', 'No Pain', 'Wrong Segment', 'Competitor Locked', 'Bad Timing', 'Other'];

function DisqualifyDialog({ leadId, onClose, onConfirm }: { leadId: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('No Budget');
  const [otherText, setOtherText] = useState('');

  function handleConfirm() {
    const finalReason = reason === 'Other' ? (otherText.trim() || 'Other') : reason;
    onConfirm(finalReason);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[var(--elevated)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">Disqualify Lead</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Select a reason</p>
        </div>
        <div className="px-4 py-3 flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            {DISQUALIFY_REASONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="dq-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-[var(--brand)]"
                />
                <span className="text-sm text-[var(--text)]">{r}</span>
              </label>
            ))}
          </div>
          {reason === 'Other' && (
            <input
              autoFocus
              value={otherText}
              onChange={e => setOtherText(e.target.value)}
              placeholder="Describe the reason…"
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors">Cancel</button>
          <button onClick={handleConfirm} className="px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-md hover:brightness-110 transition-colors">Disqualify</button>
        </div>
      </div>
    </div>
  );
}

// ── Pause Dialog ──────────────────────────────────────────────────────────────
function PauseDialog({ leadId, onClose, onConfirm }: { leadId: string; onClose: () => void; onConfirm: (date: string) => void }) {
  const defaultDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  })();
  const [pausedUntil, setPausedUntil] = useState(defaultDate);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[var(--elevated)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text)]">Pause Lead</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">Resume automatically on this date</p>
        </div>
        <div className="px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Resume Date</span>
            <input
              type="date"
              value={pausedUntil}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setPausedUntil(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors">Cancel</button>
          <button onClick={() => onConfirm(pausedUntil)} className="px-3 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors">Pause</button>
        </div>
      </div>
    </div>
  );
}

// ── Paused Leads View ─────────────────────────────────────────────────────────
function PausedLeadsView() {
  const { data: resp, isLoading } = usePausedLeadsQuery();
  const requalify = useRequalifyLead();
  const addToast = useStore(s => s.addToast);
  const pausedLeads: Lead[] = resp?.data ?? [];

  if (isLoading) return <div className="py-8 text-center text-sm text-[var(--muted)]">Loading paused leads…</div>;
  if (pausedLeads.length === 0) return (
    <div className="py-12 text-center text-sm text-[var(--muted)]">No paused leads</div>
  );

  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
            <th className="text-left px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Company</th>
            <th className="text-left px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Resume Date</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {pausedLeads.map(l => (
            <tr key={l.id} className="border-b border-[var(--border)] last:border-0 bg-[var(--elevated)] hover:bg-[var(--hover)] transition-colors">
              <td className="px-4 py-3 font-medium text-[var(--text)]">{l.company}</td>
              <td className="px-4 py-3 text-[var(--muted)]">
                {(l as any).pausedUntil
                  ? new Date((l as any).pausedUntil).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  disabled={requalify.isPending}
                  onClick={() => requalify.mutate({ id: l.id }, {
                    onSuccess: () => addToast({ type: 'success', message: `${l.company} resumed` }),
                    onError: (err: any) => addToast({ type: 'error', message: err.message }),
                  })}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                >
                  {requalify.isPending && <Spinner className="h-3 w-3" />}Resume
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  return <Suspense><LeadsPageInner /></Suspense>;
}

function LeadsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: resp, isLoading, isError, refetch } = useLeadsQuery();
  const { data: pausedResp } = usePausedLeadsQuery();
  const { openDrawer, closeDrawer } = useStore();
  const addToast = useStore(s => s.addToast);
  const createLead = useCreateLead();
  const advance = useAdvanceLead();
  const disqualify = useDisqualifyLead();
  const pauseLead = usePauseLead();
  const pendingIds = usePendingMutations(['leads']);
  const failedMutations = useFailedMutations(['leads']);

  function updateParam(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }

  // Paused tab
  const [showPaused, setShowPaused] = useState(searchParams.get('view') === 'paused');
  const pausedCount = pausedResp?.data?.length ?? 0;

  // Convert modal
  const [convertLead, setConvertLead] = useState<Lead | null>(null);

  // Disqualify dialog
  const [disqualifyId, setDisqualifyId] = useState<string | null>(null);

  // Pause dialog
  const [pauseId, setPauseId] = useState<string | null>(null);

  // Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulkAdvance = useBulkAdvanceLeads();
  const bulkDisqualify = useBulkDisqualifyLeads();
  const bulkAssign = useBulkAssignLeads();
  const { data: teamData } = useTeamQuery();
  const [showAssignPicker, setShowAssignPicker] = useState(false);
  const [showBulkDisqualifyConfirm, setShowBulkDisqualifyConfirm] = useState(false);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      {/* Paused tab toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => { setShowPaused(false); updateParam('view', 'active', 'active'); }}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-full transition-colors',
            !showPaused
              ? 'bg-brand text-brand-on'
              : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
          )}
        >
          Active
        </button>
        <button
          onClick={() => { setShowPaused(true); updateParam('view', 'paused', 'active'); }}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-full transition-colors',
            showPaused
              ? 'bg-brand text-brand-on'
              : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
          )}
        >
          Paused {pausedCount > 0 && `(${pausedCount})`}
        </button>
      </div>

      {showPaused ? (
        <PausedLeadsView />
      ) : (
        <>
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
                      <div key={l.id} className={cn('group rounded-lg p-3 mb-1.5 bg-[var(--elevated)] border border-[var(--border)] cursor-pointer hover:-translate-y-px hover:border-[var(--border-strong)] transition-all relative', isPending && 'opacity-60 animate-pulse', failedInfo && 'border-l-2 border-l-red-500', selected.has(l.id) && 'ring-1 ring-brand/40')}>
                        <label className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(l.id)}
                            onChange={() => toggleSelect(l.id)}
                            className="rounded border-[var(--border)] accent-[var(--brand)]"
                          />
                        </label>
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

                        {/* Prominent CTA for Qualified cards */}
                        {l.stage === 'Qualified' && (
                          <button
                            onClick={() => setConvertLead(l)}
                            className="mt-2 w-full px-2 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-500 transition-colors"
                          >
                            Create Deal
                          </button>
                        )}

                        {/* Action buttons — visible on hover (desktop) */}
                        <div className="hidden group-hover:flex items-center gap-1 mt-2 pt-2 border-t border-[var(--border)]">
                          {l.stage !== 'Qualified' && (
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
                            onClick={() => setDisqualifyId(l.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-2xs text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                          >
                            Disqualify
                          </button>
                          <button
                            onClick={() => setPauseId(l.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-2xs text-[var(--muted)] rounded-md hover:bg-[var(--hover)] transition-colors"
                          >
                            Pause
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
                <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-[var(--border)]">
                  {l.stage === 'Qualified' ? (
                    <button
                      onClick={() => setConvertLead(l)}
                      className="flex-1 px-2 py-1 text-2xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-500 transition-colors"
                    >
                      Create Deal
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
                    onClick={() => setDisqualifyId(l.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-2xs text-danger rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                  >
                    Disqualify
                  </button>
                  <button
                    onClick={() => setPauseId(l.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-2xs text-[var(--muted)] rounded-md hover:bg-[var(--hover)] transition-colors"
                  >
                    Pause
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <BulkActionBar
        count={selected.size}
        actions={[
          {
            label: 'Advance',
            variant: 'brand',
            isPending: bulkAdvance.isPending,
            onClick: () => {
              bulkAdvance.mutate([...selected], {
                onSuccess: () => {
                  addToast({ type: 'success', message: `Leads advanced` });
                  setSelected(new Set());
                },
              });
            },
          },
          {
            label: 'Disqualify',
            variant: 'danger',
            isPending: bulkDisqualify.isPending,
            onClick: () => setShowBulkDisqualifyConfirm(true),
          },
          {
            label: 'Assign Owner',
            variant: 'default',
            onClick: () => setShowAssignPicker(true),
          },
        ]}
        onClear={() => setSelected(new Set())}
      />

      {showBulkDisqualifyConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--elevated)] border border-[var(--border)] rounded-lg p-4 max-w-xs mx-4">
            <p className="text-sm font-medium text-[var(--text)] mb-1">Disqualify {selected.size} leads?</p>
            <p className="text-xs text-[var(--muted)] mb-4">These leads will be marked as disqualified. You can requalify them later from the paused/disqualified view.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-sm text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
                onClick={() => setShowBulkDisqualifyConfirm(false)}
              >
                Cancel
              </button>
              <button
                disabled={bulkDisqualify.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-500 text-white rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
                onClick={() => {
                  bulkDisqualify.mutate([...selected], {
                    onSuccess: () => {
                      addToast({ type: 'info', message: `Leads disqualified` });
                      setSelected(new Set());
                      setShowBulkDisqualifyConfirm(false);
                    },
                  });
                }}
              >
                {bulkDisqualify.isPending && <Spinner className="h-3 w-3" />}Disqualify
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--elevated)] border border-[var(--border)] rounded-lg p-4 max-w-xs mx-4">
            <p className="text-sm font-medium text-[var(--text)] mb-3">Assign {selected.size} leads to:</p>
            <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
              {(teamData?.data ?? []).map((user: any) => (
                <button
                  key={user.id}
                  className="text-left px-3 py-2 text-sm rounded-md hover:bg-[var(--hover)] transition-colors"
                  onClick={() => {
                    bulkAssign.mutate(
                      { ids: [...selected], ownerId: user.id },
                      {
                        onSuccess: () => {
                          addToast({ type: 'success', message: `Leads assigned to ${user.name}` });
                          setSelected(new Set());
                          setShowAssignPicker(false);
                        },
                      }
                    );
                  }}
                >
                  {user.name}
                </button>
              ))}
            </div>
            <button
              className="mt-2 w-full text-center text-sm text-[var(--muted)] hover:text-[var(--text)]"
              onClick={() => setShowAssignPicker(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Convert modal */}
      {convertLead && (
        <ConvertModal lead={convertLead} onClose={() => setConvertLead(null)} />
      )}

      {/* Disqualify dialog */}
      {disqualifyId && (
        <DisqualifyDialog
          leadId={disqualifyId}
          onClose={() => setDisqualifyId(null)}
          onConfirm={(reason) => {
            disqualify.mutate({ id: disqualifyId, reason }, {
              onSuccess: () => addToast({ type: 'info', message: 'Lead disqualified' }),
              onError: (err: any) => addToast({ type: 'error', message: err.message }),
            });
            setDisqualifyId(null);
          }}
        />
      )}

      {/* Pause dialog */}
      {pauseId && (
        <PauseDialog
          leadId={pauseId}
          onClose={() => setPauseId(null)}
          onConfirm={(pausedUntil) => {
            pauseLead.mutate({ id: pauseId, pausedUntil }, {
              onSuccess: () => addToast({ type: 'success', message: 'Lead paused' }),
              onError: (err: any) => addToast({ type: 'error', message: err.message }),
            });
            setPauseId(null);
          }}
        />
      )}
    </div>
  );
}
