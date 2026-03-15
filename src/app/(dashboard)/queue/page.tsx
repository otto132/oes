'use client';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Shield, Eye, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useQueueQuery, useApproveQueueItem, useRejectQueueItem } from '@/lib/queries/queue';
import { leadKeys } from '@/lib/queries/leads';
import { taskKeys } from '@/lib/queries/tasks';
import { accountKeys } from '@/lib/queries/accounts';
import { fRelative, queueTypeLabel, cn, displayLabel } from '@/lib/utils';
import { Badge, ConfBadge, AgentTag, ScorePill, FIUACBars, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState, Spinner, HelpTip } from '@/components/ui';
import type { QueueItem } from '@/lib/types';
import { useStore } from '@/lib/store';
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
import { RotateCw } from 'lucide-react';

const TYPE_STYLE: Record<string, string> = {
  outreach_draft: 'text-info bg-info/[.06] border-info/[.10]',
  lead_qualification: 'text-brand bg-brand/[.06] border-brand/[.10]',
  enrichment: 'text-purple bg-purple/[.06] border-purple/[.10]',
  task_creation: 'text-warn bg-warn/[.06] border-warn/[.10]',
};

export default function QueuePage() {
  return <Suspense><QueuePageInner /></Suspense>;
}

function QueuePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<'pending' | 'completed'>((searchParams.get('tab') as 'pending' | 'completed') || 'pending');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    const defaults: Record<string, string> = { tab: 'pending', type: 'all' };
    for (const [key, value] of Object.entries(updates)) {
      if (value === defaults[key] || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);

  const { data: response, isLoading, error, refetch } = useQueueQuery(tab, typeFilter !== 'all' ? typeFilter : undefined);
  const approve = useApproveQueueItem();
  const reject = useRejectQueueItem();

  const { addToast, openDrawer, closeDrawer } = useStore();
  const qc = useQueryClient();
  const pendingIds = usePendingMutations(['queue']);
  const failedMutations = useFailedMutations(['queue']);

  function handleApproveSuccess(q: QueueItem) {
    const p = q.payload || {};
    switch (q.type) {
      case 'lead_qualification':
        addToast({
          type: 'success',
          message: `Lead created for ${p.company || q.accountName || 'company'}`,
          action: { label: 'View Leads →', href: '/leads' },
        });
        qc.invalidateQueries({ queryKey: leadKeys.all });
        break;
      case 'task_creation':
        addToast({
          type: 'success',
          message: `Task created: ${p.task || q.title || 'task'}`,
          action: { label: 'View Tasks →', href: '/tasks' },
        });
        qc.invalidateQueries({ queryKey: taskKeys.all });
        break;
      case 'enrichment':
        addToast({
          type: 'success',
          message: `Account updated: ${p.field || 'field'}`,
          action: q.accountId ? { label: 'View Account →', href: `/accounts/${q.accountId}` } : undefined,
        });
        if (q.accountId) qc.invalidateQueries({ queryKey: accountKeys.detail(q.accountId) });
        break;
      case 'outreach_draft':
        addToast({
          type: 'success',
          message: `Outreach logged for ${q.accountName || 'account'}`,
          action: q.accountId ? { label: 'View Account →', href: `/accounts/${q.accountId}` } : undefined,
        });
        if (q.accountId) qc.invalidateQueries({ queryKey: accountKeys.detail(q.accountId) });
        break;
      default:
        addToast({ type: 'success', message: 'Approved' });
    }
  }

  function openEditDrawer(q: QueueItem) {
    const p = q.payload || {};
    let fields: Record<string, { label: string; value: string; multiline?: boolean }> = {};
    if (q.type === 'outreach_draft') {
      fields = {
        subject: { label: 'Subject', value: p.subject || '' },
        body: { label: 'Body', value: p.body || '', multiline: true },
      };
    } else if (q.type === 'lead_qualification') {
      fields = {
        company: { label: 'Company', value: p.company || '' },
        pain: { label: 'Pain Point', value: p.pain || '' },
        type: { label: 'Type', value: p.type || '' },
      };
    } else if (q.type === 'enrichment') {
      fields = {
        after: { label: `New value for "${p.field}"`, value: p.after || '' },
      };
    } else if (q.type === 'task_creation') {
      fields = {
        task: { label: 'Task', value: p.task || '' },
        due: { label: 'Due Date', value: p.due || '' },
      };
    }

    const state = { ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value])) };

    openDrawer({
      title: 'Edit & Approve',
      subtitle: q.title,
      body: (
        <div className="flex flex-col gap-3">
          {Object.entries(fields).map(([key, f]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted">{f.label}</span>
              {f.multiline ? (
                <textarea
                  defaultValue={f.value}
                  onChange={e => { state[key] = e.target.value; }}
                  rows={5}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 resize-y"
                />
              ) : (
                <input
                  defaultValue={f.value}
                  onChange={e => { state[key] = e.target.value; }}
                  className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
                />
              )}
            </label>
          ))}
        </div>
      ),
      footer: (
        <>
          <button
            className="px-3 py-1.5 text-sm text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <button
            disabled={approve.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              // Validate required fields before approving
              const emptyRequired = Object.entries(state).filter(([key, val]) => {
                if (q.type === 'outreach_draft' && (key === 'subject' || key === 'body')) return !val?.trim();
                if (q.type === 'lead_qualification' && key === 'company') return !val?.trim();
                if (q.type === 'enrichment' && key === 'after') return !val?.trim();
                if (q.type === 'task_creation' && key === 'task') return !val?.trim();
                return false;
              });
              if (emptyRequired.length > 0) {
                addToast({ type: 'error', message: `Required fields cannot be empty: ${emptyRequired.map(([k]) => fields[k]?.label || k).join(', ')}` });
                return;
              }
              const editedPayload = { ...q.payload, ...state };
              approve.mutate(
                { id: q.id, editedPayload },
                {
                  onSuccess: () => {
                    handleApproveSuccess(q);
                    closeDrawer();
                  },
                  onError: (err: any) => addToast({ type: 'error', message: `Approve failed: ${err.message}` }),
                }
              );
            }}
          >
            {approve.isPending && <Spinner className="h-3 w-3" />}Save & Approve
          </button>
        </>
      ),
    });
  }

  const items = response?.data ?? [];
  const pendingCount = response?.meta.pendingCount ?? 0;
  const completedCount = response?.meta.completedCount ?? 0;
  const typeCounts = response?.meta.typeCounts ?? {};

  const types = [
    { k: 'all', l: 'All', ct: Object.values(typeCounts).reduce((a, b) => a + b, 0) || items.length },
    { k: 'outreach_draft', l: 'Outreach', ct: typeCounts['outreach_draft'] ?? 0 },
    { k: 'lead_qualification', l: 'Leads', ct: typeCounts['lead_qualification'] ?? 0 },
    { k: 'enrichment', l: 'Enrichment', ct: typeCounts['enrichment'] ?? 0 },
    { k: 'task_creation', l: 'Tasks', ct: typeCounts['task_creation'] ?? 0 },
  ];

  const REJECT_REASONS = ['Wrong contact', 'Tone needs rework', 'Bad timing', 'Not relevant', 'Other'];

  function QueueSkeleton() {
    return (
      <div className="page-enter space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-12 rounded-full" />
              <Skeleton className="h-4 w-20 rounded-full ml-auto" />
            </div>
            <SkeletonText className="w-3/4" />
            <SkeletonText className="w-full h-2" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <div className="flex gap-2 justify-end">
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-20 rounded-md" />
            </div>
          </SkeletonCard>
        ))}
      </div>
    );
  }

  function QueueCard({ q }: { q: QueueItem }) {
    const isExp = expanded === q.id;
    const isRej = rejectOpen === q.id;
    const isPending = pendingIds.has(q.id);
    const failedInfo = failedMutations.get(q.id);
    return (
      <div className={cn('rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] transition-colors relative', isPending && 'opacity-60 animate-pulse', failedInfo && 'border-l-2 border-l-red-500')}>
        {failedInfo && (
          <button
            onClick={() => approve.mutate({ id: q.id })}
            className="absolute top-2 right-2 p-1 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
            title={failedInfo.error}
          >
            <RotateCw className="w-3 h-3" />
          </button>
        )}
        {/* Header row */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('text-3xs font-semibold uppercase tracking-wide px-1.5 py-[1px] rounded border', TYPE_STYLE[q.type])}>{queueTypeLabel[q.type]}</span>
            {q.priority === 'High' && <Badge variant="err" className="!text-3xs">High</Badge>}
            <AgentTag name={q.agent} className="!text-3xs" />
            {q.status === 'approved' && <Badge variant="ok" className="!text-3xs">Approved</Badge>}
            {q.status === 'rejected' && <><Badge variant="err" className="!text-3xs">Rejected</Badge>{q.rejectionReason && <span className="text-3xs text-muted">{q.rejectionReason}</span>}</>}
          </div>
          <div className="flex items-center gap-1.5">
            <ConfBadge value={q.confidence} />
            <span className="text-2xs text-muted">{fRelative(q.createdAt)}</span>
          </div>
        </div>

        {/* Title */}
        <div className="text-base font-medium leading-tight mb-0.5">{q.title}</div>
        {q.accountName && <div className="text-2xs text-sub mb-1.5">{q.accountName}</div>}

        {/* Type-specific payload */}
        {q.type === 'outreach_draft' && q.payload && (
          <div className="text-xs text-muted bg-[var(--surface)] rounded-md p-2.5 mb-1 whitespace-pre-line leading-relaxed max-h-[110px] overflow-hidden border border-[var(--border)]">
            <strong className="text-sub">To:</strong> {q.payload.to}<br />
            <strong className="text-sub">Subj:</strong> {q.payload.subject}<br /><br />
            {(q.payload.body || '').slice(0, 200)}{(q.payload.body || '').length > 200 ? '…' : ''}
          </div>
        )}
        {q.type === 'lead_qualification' && q.payload && (
          <div className="mb-1">
            <div className="text-xs text-sub leading-relaxed mb-1">{q.payload.pain}</div>
            {q.payload.scores && <div className="flex items-center gap-1.5"><FIUACBars scores={q.payload.scores} /><ScorePill scores={q.payload.scores} /></div>}
          </div>
        )}
        {q.type === 'enrichment' && q.payload && (
          <div className="text-xs mb-1">
            <div className="text-muted mb-0.5">Update <span className="text-sub font-medium">{q.payload.field}</span>:</div>
            <div className="text-danger line-through opacity-60 mb-0.5">{q.payload.before}</div>
            <div className="text-brand">{q.payload.after}</div>
          </div>
        )}
        {q.type === 'task_creation' && q.payload && (
          <div className="text-xs text-sub">{q.payload.task}</div>
        )}

        {/* Reasoning toggle */}
        <button onClick={() => setExpanded(isExp ? null : q.id)} className="flex items-center gap-1 text-2xs text-brand mt-1.5 hover:underline">
          <Eye className="w-[10px] h-[10px]" /> Reasoning & Sources
        </button>
        {isExp && (
          <div className="text-xs text-sub leading-relaxed mt-1.5 p-2.5 bg-[var(--surface)] rounded-md border border-[var(--border)]">
            <div className="mb-1.5">{q.reasoning}</div>
            <div className="text-2xs text-muted border-t border-[var(--border)] pt-1.5">
              <strong>Sources:</strong> {q.sources.map((s, i) => <span key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-info underline decoration-dotted">{s.name}</a> : s.name}{i < q.sources.length - 1 ? ' · ' : ''}</span>)}
            </div>
            <div className="mt-1 text-3xs text-muted">Confidence: {Object.entries(q.confidenceBreakdown).map(([k, v]) => `${displayLabel(k)}: ${Math.round(v * 100)}%`).join(' · ')}</div>
          </div>
        )}

        {/* Actions */}
        {q.status === 'pending' && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--border)] relative">
            <div className="relative">
              <button onClick={() => setRejectOpen(isRej ? null : q.id)} className="px-2 py-1 text-xs font-medium rounded-md text-danger bg-danger/[.06] border border-danger/[.10] hover:bg-danger/[.12] transition-colors">Reject ▾</button>
              {isRej && (
                <div className="absolute bottom-full left-0 mb-1 bg-[var(--overlay)] border border-[var(--border-strong)] rounded-lg shadow-md min-w-[180px] z-10 p-1">
                  {REJECT_REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => {
                        reject.mutate(
                          { id: q.id, reason: r },
                          {
                            onSuccess: () => addToast({ type: 'info', message: `Rejected — ${r}` }),
                            onError: (err: any) => addToast({ type: 'error', message: `Reject failed: ${err.message}` }),
                          }
                        );
                        setRejectOpen(null);
                      }}
                      disabled={reject.isPending}
                      className="block w-full text-left px-2.5 py-1.5 text-xs text-sub rounded-md hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50 transition-colors"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => openEditDrawer(q)}
              className="px-2 py-1 text-xs font-medium rounded-md text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
            >
              Edit & Approve
            </button>
            <button
              onClick={() =>
                approve.mutate(
                  { id: q.id },
                  {
                    onSuccess: () => handleApproveSuccess(q),
                    onError: (err: any) => addToast({ type: 'error', message: `Approve failed: ${err.message}` }),
                  }
                )
              }
              disabled={approve.isPending}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-brand text-brand-on hover:brightness-110 ml-auto inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {approve.isPending ? <Spinner className="h-3 w-3" /> : <Check className="w-3 h-3" />} Approve
            </button>
          </div>
        )}
        {q.status !== 'pending' && q.reviewedBy && (
          <div className="mt-2 pt-2 border-t border-[var(--border)] text-2xs text-muted">{q.reviewedBy} · {q.reviewedAt}</div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[900px] page-enter">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5"><h1 className="text-2xl font-semibold tracking-tight">Approval Queue</h1><HelpTip text="AI agents suggest actions that require your approval before execution. Review reasoning and edit suggestions before approving." /></div>
          <p className="text-sm text-muted mt-0.5">{pendingCount} pending · Human-in-the-loop review</p>
        </div>
        <Badge variant="ai" className="gap-1"><Shield className="w-[10px] h-[10px]" /> AI Supervised</Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] mb-3 gap-0 overflow-x-auto">
        {(['pending', 'completed'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setTypeFilter('all'); updateParams({ tab: t, type: 'all' }); }} className={cn('px-3 py-2 text-sm border-b-2 -mb-px capitalize whitespace-nowrap transition-colors', tab === t ? 'text-[var(--text)] border-brand font-medium' : 'text-sub border-transparent hover:text-[var(--text)]')}>
            {t}<span className="ml-1 text-2xs font-mono text-muted">{t === 'pending' ? pendingCount : completedCount}</span>
          </button>
        ))}
      </div>

      {/* Type filters */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {types.filter(t => t.ct > 0 || t.k === 'all').map(t => (
          <button key={t.k} onClick={() => { setTypeFilter(t.k); updateParams({ type: t.k }); }} className={cn('px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors', typeFilter === t.k ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]' : 'text-muted hover:text-sub hover:bg-[var(--hover)]')}>
            {t.l}{t.ct > 0 && <span className="ml-1 font-mono text-3xs opacity-60">{t.ct}</span>}
          </button>
        ))}
      </div>

      {isLoading ? <QueueSkeleton /> : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={tab === 'pending' ? '✓' : '📋'} title={tab === 'pending' ? 'All clear — no pending approvals' : 'No completed items yet'} description={tab === 'pending' ? 'AI agents are running. Items will appear here when they need your review.' : 'Approved and rejected items will appear here.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {items.sort((a, b) => (a.priority === 'High' ? 0 : 1) - (b.priority === 'High' ? 0 : 1)).map(q => <QueueCard key={q.id} q={q} />)}
        </div>
      )}

    </div>
  );
}
