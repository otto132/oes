'use client';
import { useState } from 'react';
import { Shield, Eye, Check } from 'lucide-react';
import { useQueueQuery, useApproveQueueItem, useRejectQueueItem } from '@/lib/queries/queue';
import { fRelative, queueTypeLabel, cn, confNum } from '@/lib/utils';
import { Badge, ConfBadge, AgentTag, ScorePill, FIUACBars, EmptyState } from '@/components/ui';
import type { QueueItem } from '@/lib/types';

const TYPE_STYLE: Record<string, string> = {
  outreach_draft: 'bg-info/[.08] text-info border-info/[.15]',
  lead_qualification: 'bg-brand-dim text-brand border-brand-border',
  enrichment: 'bg-purple/[.08] text-purple border-purple/[.15]',
  task_creation: 'bg-warn/[.08] text-warn border-warn/[.15]',
};

export default function QueuePage() {
  const [tab, setTab] = useState<'pending' | 'completed'>('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);

  const { data: response, isLoading, error, refetch } = useQueueQuery(
    tab,
    typeFilter !== 'all' ? typeFilter : undefined,
  );
  const approve = useApproveQueueItem();
  const reject = useRejectQueueItem();

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
              <div className="h-4 w-16 rounded bg-[var(--surface)] shimmer" />
              <div className="h-4 w-20 rounded bg-[var(--surface)] shimmer" />
            </div>
            <div className="h-4 w-3/4 rounded bg-[var(--surface)] shimmer mb-1.5" />
            <div className="h-3 w-1/3 rounded bg-[var(--surface)] shimmer mb-2" />
            <div className="h-16 w-full rounded bg-[var(--surface)] shimmer mb-2" />
            <div className="flex gap-1.5 pt-2 border-t border-[var(--border)]">
              <div className="h-7 w-16 rounded bg-[var(--surface)] shimmer" />
              <div className="h-7 w-24 rounded bg-[var(--surface)] shimmer" />
              <div className="h-7 w-20 rounded bg-[var(--surface)] shimmer ml-auto" />
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
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('text-[9px] font-semibold uppercase tracking-wide px-[7px] py-[2px] rounded border', TYPE_STYLE[q.type])}>{queueTypeLabel[q.type]}</span>
            {q.pri === 'High' && <Badge variant="err" className="!text-[8px]">High Priority</Badge>}
            <AgentTag name={q.agent} className="!text-[8px]" />
            {q.status === 'approved' && <Badge variant="ok" className="!text-[8px]">Approved ✓</Badge>}
            {q.status === 'rejected' && <><Badge variant="err" className="!text-[8px]">Rejected</Badge>{q.rejReason && <span className="text-[9px] text-muted">{q.rejReason}</span>}</>}
          </div>
          <div className="flex items-center gap-1.5">
            <ConfBadge value={q.conf} />
            <span className="text-[10px] text-muted">{fRelative(q.createdAt)}</span>
          </div>
        </div>

        <div className="text-[13px] font-medium leading-tight mb-1">{q.title}</div>
        {q.accName && <div className="text-[10.5px] text-sub mb-1.5">{q.accName}</div>}

        {q.type === 'outreach_draft' && q.payload && (
          <div className="text-[11px] text-muted bg-[var(--card-hover)] rounded-md p-2.5 mb-1 whitespace-pre-line leading-relaxed max-h-[120px] overflow-hidden">
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

        <button onClick={() => setExpanded(isExp ? null : q.id)} className="flex items-center gap-1 text-[10px] text-brand mt-1.5 hover:underline">
          <Eye className="w-[10px] h-[10px]" /> Reasoning & Sources
        </button>
        {isExp && (
          <div className="text-[11px] text-sub leading-relaxed mt-1.5 p-2 bg-[var(--card-hover)] rounded-md">
            <div className="mb-1.5">{q.reasoning}</div>
            <div className="text-[10px] text-muted border-t border-[var(--border)] pt-1.5">
              <strong>Sources:</strong> {q.sources.map((s, i) => <span key={i}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-info underline decoration-dotted">{s.name}</a> : s.name}{i < q.sources.length - 1 ? ' · ' : ''}</span>)}
            </div>
            <div className="mt-1 text-[9px] text-muted">Confidence: {Object.entries(q.confBreak).map(([k, v]) => `${k}: ${Math.round(v * 100)}%`).join(' · ')}</div>
          </div>
        )}

        {q.status === 'pending' && (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[var(--border)] relative">
            <div className="relative">
              <button onClick={() => setRejectOpen(isRej ? null : q.id)} className="px-2 py-1 text-[11px] font-medium rounded-md text-danger bg-danger/10 border border-danger/15 hover:bg-danger/[.18]">Reject ▾</button>
              {isRej && (
                <div className="absolute bottom-full left-0 mb-1 bg-[var(--overlay)] border border-[var(--border-strong)] rounded-lg shadow-lg min-w-[200px] z-10 p-1">
                  {REJECT_REASONS.map(r => (
                    <button key={r} onClick={() => { reject.mutate({ id: q.id, reason: r }); setRejectOpen(null); }} disabled={reject.isPending} className="block w-full text-left px-2.5 py-1.5 text-[11.5px] text-sub rounded-md hover:bg-[var(--card-hover)] hover:text-[var(--text)] disabled:opacity-50">{r}</button>
                  ))}
                </div>
              )}
            </div>
            <button className="px-2 py-1 text-[11px] font-medium rounded-md text-[var(--text)] bg-[var(--card-hover)] border border-[var(--border)] hover:bg-brand-dim">Edit & Approve</button>
            <button onClick={() => approve.mutate({ id: q.id })} disabled={approve.isPending} className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-brand text-white border border-brand/50 hover:brightness-110 ml-auto flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
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
    <div className="max-w-[900px]">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h1 className="text-xl font-semibold">Approval Queue</h1>
          <p className="text-[12px] text-sub mt-0.5">{pendingCount} pending · Human-in-the-loop review</p>
        </div>
        <Badge variant="ai" className="gap-1"><Shield className="w-[10px] h-[10px]" /> AI Supervised</Badge>
      </div>

      <div className="flex border-b border-[var(--border)] mb-3 gap-0 overflow-x-auto">
        {(['pending', 'completed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-3.5 py-2 text-[12.5px] border-b-2 -mb-px capitalize whitespace-nowrap', tab === t ? 'text-[var(--text)] border-brand font-medium' : 'text-sub border-transparent hover:text-[var(--text)]')}>
            {t}<span className="ml-1 text-[10px] font-semibold px-[5px] py-px rounded-full bg-[var(--card-hover)] text-muted">{t === 'pending' ? pendingCount : completedCount}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {types.filter(t => t.ct > 0 || t.k === 'all').map(t => (
          <button key={t.k} onClick={() => setTypeFilter(t.k)} className={cn('px-2 py-1 text-[11.5px] font-medium rounded-md whitespace-nowrap', typeFilter === t.k ? 'bg-[var(--card-hover)] text-[var(--text)]' : 'text-sub hover:bg-[var(--card-hover)]')}>
            {t.l}{t.ct > 0 && <span className="ml-1 font-mono text-[9px] opacity-70">{t.ct}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <QueueSkeleton />
      ) : error ? (
        <div>
          <EmptyState icon="!" title="Failed to load queue" description={error.message} />
          <div className="flex justify-center mt-2">
            <button onClick={() => refetch()} className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-brand text-white hover:brightness-110">Retry</button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={tab === 'pending' ? '✓' : '📋'} title={tab === 'pending' ? 'All clear — no pending approvals' : 'No completed items yet'} description={tab === 'pending' ? 'AI agents are running. Items will appear here when they need your review.' : 'Approved and rejected items will appear here.'} />
      ) : (
        <div className="flex flex-col gap-2">
          {items.sort((a, b) => (a.pri === 'High' ? 0 : 1) - (b.pri === 'High' ? 0 : 1)).map(q => <QueueCard key={q.id} q={q} />)}
        </div>
      )}

      <div className="hidden md:flex gap-3.5 mt-4 text-[10px] text-muted">
        <span><kbd className="font-mono text-[10px] px-[5px] py-px rounded bg-[var(--card-hover)] border border-[var(--border)]">j</kbd><kbd className="font-mono text-[10px] px-[5px] py-px rounded bg-[var(--card-hover)] border border-[var(--border)] ml-0.5">k</kbd> nav</span>
        <span><kbd className="font-mono text-[10px] px-[5px] py-px rounded bg-[var(--card-hover)] border border-[var(--border)]">a</kbd> approve</span>
        <span><kbd className="font-mono text-[10px] px-[5px] py-px rounded bg-[var(--card-hover)] border border-[var(--border)]">r</kbd> reject</span>
      </div>
    </div>
  );
}
