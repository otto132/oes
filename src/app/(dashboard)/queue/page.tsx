'use client';
import { useState } from 'react';
import { Shield, Eye, Check } from 'lucide-react';
import { useQueueQuery, useApproveQueueItem, useRejectQueueItem } from '@/lib/queries/queue';
import { fRelative, queueTypeLabel, cn } from '@/lib/utils';
import { Badge, ConfBadge, AgentTag, ScorePill, FIUACBars, EmptyState } from '@/components/ui';
import type { QueueItem } from '@/lib/types';
import { useStore } from '@/lib/store';

const TYPE_STYLE: Record<string, string> = {
  outreach_draft: 'text-info bg-info/[.06] border-info/[.10]',
  lead_qualification: 'text-brand bg-brand/[.06] border-brand/[.10]',
  enrichment: 'text-purple bg-purple/[.06] border-purple/[.10]',
  task_creation: 'text-warn bg-warn/[.06] border-warn/[.10]',
};

export default function QueuePage() {
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);

  const { data: response, isLoading, error, refetch } = useQueueQuery(tab, typeFilter !== 'all' ? typeFilter : undefined);
  const approve = useApproveQueueItem();
  const reject = useRejectQueueItem();

  const { addToast, openDrawer, closeDrawer } = useStore();

  const SIDE_EFFECT_MSG: Record<string, string> = {
    lead_qualification: 'Lead created in pipeline',
    task_creation: 'Task created',
    enrichment: 'Account field updated',
    outreach_draft: 'Outreach logged as activity',
  };

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
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{f.label}</span>
              {f.multiline ? (
                <textarea
                  defaultValue={f.value}
                  onChange={e => { state[key] = e.target.value; }}
                  rows={5}
                  className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 resize-y"
                />
              ) : (
                <input
                  defaultValue={f.value}
                  onChange={e => { state[key] = e.target.value; }}
                  className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
                />
              )}
            </label>
          ))}
        </div>
      ),
      footer: (
        <>
          <button
            className="px-3 py-1.5 text-[12px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <button
            disabled={approve.isPending}
            className="px-3 py-1.5 text-[12px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              const editedPayload = { ...q.payload, ...state };
              approve.mutate(
                { id: q.id, editedPayload },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: `Approved (edited) — ${SIDE_EFFECT_MSG[q.type] || 'Done'}` });
                    closeDrawer();
                  },
                  onError: (err) => addToast({ type: 'error', message: `Approve failed: ${err.message}` }),
                }
              );
            }}
          >
            Save & Approve
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
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="h-4 w-16 rounded shimmer" />
              <div className="h-4 w-20 rounded shimmer" />
            </div>
            <div className="h-4 w-3/4 rounded shimmer mb-1.5" />
            <div className="h-3 w-1/3 rounded shimmer mb-2" />
            <div className="h-14 w-full rounded shimmer mb-2" />
            <div className="flex gap-1.5 pt-2 border-t border-[var(--border)]">
              <div className="h-7 w-16 rounded shimmer" />
              <div className="h-7 w-24 rounded shimmer" />
              <div className="h-7 w-20 rounded shimmer ml-auto" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  function QueueCard({ q }: { q: QueueItem }) {
    const isExp = expanded === q.id;
    const isRej = rejectOpen === q.id;
    return (
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4 hover:border-[var(--border-strong)] transition-colors">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('text-[9px] font-semibold uppercase tracking-wide px-1.5 py-[1px] rounded border', TYPE_STYLE[q.type])}>{queueTypeLabel[q.type]}</span>
            {q.pri === 'High' && <Badge variant="err" className="!text-[8px]">High</Badge>}
            <AgentTag name={q.agent} className="!text-[8px]" />
            {q.status === 'approved' && <Badge variant="ok" className="!text-[8px]">Approved</Badge>}
            {q.status === 'rejected' && <><Badge variant="err" className="!text-[8px]">Rejected</Badge>{q.rejReason && <span className="text-[9px] text-muted">{q.rejReason}</span>}</>}
          </div>
          <div className="flex items-center gap-1.5">
            <ConfBadge value={q.conf} />
            <span className="text-[10px] text-muted">{fRelative(q.createdAt)}</span>
          </div>
        </div>

        {/* Title */}
        <div className="text-[13px] font-medium leading-tight mb-0.5">{q.title}</div>
        {q.accName && <div className="text-[10.5px] text-sub mb-1.5">{q.accName}</div>}

        {/* Type-specific payload */}
        {q.type === 'outreach_draft' && q.payload && (
          <div className="text-[11px] text-muted bg-[var(--surface)] rounded-md p-2.5 mb-1 whitespace-pre-line leading-relaxed max-h-[110px] overflow-hidden border border-[var(--border)]">
            <strong className="text-sub">To:</strong> {q.payload.to}<br />
            <strong className="text-sub">Subj:</strong> {q.payload.subject}<br /><br />
            {(q.payload.body || '').slice(0, 200)}{(q.payload.body || '').length > 200 ? '…' : ''}
          </div>
        )}
        {q.type === 'lead_qualification' && q.payload && (
          <div className="mb-1">
            <div className="text-[11px] text-sub leading-relaxed mb-1">{q.payload.pain}</div>
            {q.payload.scores && <div className="flex items-center gap-1.5"><FIUACBars scores={q.payload.scores} /><ScorePill scores={q.payload.scores} /></div>}
          </div>
        )}
        {q.type === 'enrichment' && q.payload && (
          <div className="text-[11px] mb-1">
            <div className="text-muted mb-0.5">Update <span className="text-sub font-medium">{q.payload.field}</span>:</div>
            <div className="text-danger line-through opacity-60 mb-0.5">{q.payload.before}</div>
            <div className="text-brand">{q.payload.after}</div>
          </div>
        )}
        {q.type === 'task_creation' && q.payload && (
          <div className="text-[11px] text-sub">{q.payload.task}</div>
        )}

        {/* Reasoning toggle */}
        <button onClick={() => setExpanded(isExp ? null : q.id)} className="flex items-center gap-1 text-[10px] text-brand mt-1.5 hover:underline">
          <Eye className="w-[10px] h-[10px]" /> Reasoning & Sources
        </button>
        {isExp && (
          <div className="text-[11px] text-sub leading-relaxed mt-1.5 p-2.5 bg-[var(--surface)] rounded-md border border-[var(--border)]">
            <div className="mb-1.5">{q.reasoning}</div>
            <div className="text-[10px] text-muted border-t border-[var(--border)] pt-1.5">
              <strong>Sources:</strong> {q.sources.map((s, i) => <span key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-info underline decoration-dotted">{s.name}</a> : s.name}{i < q.sources.length - 1 ? ' · ' : ''}</span>)}
            </div>
            <div className="mt-1 text-[9px] text-muted">Confidence: {Object.entries(q.confBreak).map(([k, v]) => `${k}: ${Math.round(v * 100)}%`).join(' · ')}</div>
          </div>
        )}

        {/* Actions */}
        {q.status === 'pending' && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--border)] relative">
            <div className="relative">
              <button onClick={() => setRejectOpen(isRej ? null : q.id)} className="px-2 py-1 text-[11px] font-medium rounded-md text-danger bg-danger/[.06] border border-danger/[.10] hover:bg-danger/[.12] transition-colors">Reject ▾</button>
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
                            onError: (err) => addToast({ type: 'error', message: `Reject failed: ${err.message}` }),
                          }
                        );
                        setRejectOpen(null);
                      }}
                      disabled={reject.isPending}
                      className="block w-full text-left px-2.5 py-1.5 text-[11px] text-sub rounded-md hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50 transition-colors"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => openEditDrawer(q)}
              className="px-2 py-1 text-[11px] font-medium rounded-md text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors"
            >
              Edit & Approve
            </button>
            <button
              onClick={() =>
                approve.mutate(
                  { id: q.id },
                  {
                    onSuccess: () => addToast({ type: 'success', message: `Approved — ${SIDE_EFFECT_MSG[q.type] || 'Done'}` }),
                    onError: (err) => addToast({ type: 'error', message: `Approve failed: ${err.message}` }),
                  }
                )
              }
              disabled={approve.isPending}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110 ml-auto flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Check className="w-3 h-3" /> Approve
            </button>
          </div>
        )}
        {q.status !== 'pending' && q.reviewedBy && (
          <div className="mt-2 pt-2 border-t border-[var(--border)] text-[10px] text-muted">{q.reviewedBy} · {q.reviewedAt}</div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[900px] page-enter">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Approval Queue</h1>
          <p className="text-[12px] text-muted mt-0.5">{pendingCount} pending · Human-in-the-loop review</p>
        </div>
        <Badge variant="ai" className="gap-1"><Shield className="w-[10px] h-[10px]" /> AI Supervised</Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] mb-3 gap-0 overflow-x-auto">
        {(['pending', 'completed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-3 py-2 text-[12px] border-b-2 -mb-px capitalize whitespace-nowrap transition-colors', tab === t ? 'text-[var(--text)] border-brand font-medium' : 'text-sub border-transparent hover:text-[var(--text)]')}>
            {t}<span className="ml-1 text-[10px] font-mono text-muted">{t === 'pending' ? pendingCount : completedCount}</span>
          </button>
        ))}
      </div>

      {/* Type filters */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {types.filter(t => t.ct > 0 || t.k === 'all').map(t => (
          <button key={t.k} onClick={() => setTypeFilter(t.k)} className={cn('px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors', typeFilter === t.k ? 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]' : 'text-muted hover:text-sub hover:bg-[var(--hover)]')}>
            {t.l}{t.ct > 0 && <span className="ml-1 font-mono text-[9px] opacity-60">{t.ct}</span>}
          </button>
        ))}
      </div>

      {isLoading ? <QueueSkeleton /> : error ? (
        <div>
          <EmptyState icon="!" title="Failed to load queue" description={error.message} />
          <div className="flex justify-center mt-2">
            <button onClick={() => refetch()} className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-brand text-[#09090b] hover:brightness-110">Retry</button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={tab === 'pending' ? '✓' : '📋'} title={tab === 'pending' ? 'All clear — no pending approvals' : 'No completed items yet'} description={tab === 'pending' ? 'AI agents are running. Items will appear here when they need your review.' : 'Approved and rejected items will appear here.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {items.sort((a, b) => (a.pri === 'High' ? 0 : 1) - (b.pri === 'High' ? 0 : 1)).map(q => <QueueCard key={q.id} q={q} />)}
        </div>
      )}

      <div className="hidden md:flex gap-3 mt-4 text-[10px] text-muted">
        <span><kbd>j</kbd><kbd className="ml-0.5">k</kbd> nav</span>
        <span><kbd>a</kbd> approve</span>
        <span><kbd>r</kbd> reject</span>
      </div>
    </div>
  );
}
