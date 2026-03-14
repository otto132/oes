'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useOpportunityDetail, useMoveStage, useCloseWon, useCloseLost, useUpdateOpportunity } from '@/lib/queries/opportunities';
import { Badge, Avatar, HealthBar, StageBadge, AgentTag, Skeleton, SkeletonCard, ErrorState, Spinner } from '@/components/ui';
import { fmt, fDate, fR, isOverdue, weightedValue, cn, displayLabel } from '@/lib/utils';
import { STAGES, STAGE_COLOR, healthAvg } from '@/lib/types';
import type { Activity, Contact } from '@/lib/types';
import { useStore } from '@/lib/store';

function riskHex(h: { healthEngagement: number; healthStakeholders: number; healthCompetitive: number; healthTimeline: number }): string {
  const a = healthAvg(h);
  return a >= 60 ? '#33a882' : a >= 40 ? '#e8a838' : '#e05c5c';
}

const ACT_COLOR: Record<string, string> = { Email: '#5b9cf6', Meeting: '#33a882', Call: '#33a882', Note: '#e8a838' };


function LoadingSkeleton() {
  return (
    <div className="max-w-[1100px]">
      <SkeletonCard className="h-[260px] mb-3">
        <div className="flex gap-3.5 items-start flex-col md:flex-row mb-3">
          <div className="flex-1">
            <Skeleton className="h-3 w-28 mb-1" />
            <Skeleton className="h-5 w-56 mb-2" />
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <Skeleton className="h-7 w-24 mb-1 ml-auto" />
            <Skeleton className="h-3 w-20 mb-1 ml-auto" />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
        </div>
        <Skeleton className="h-1 w-full mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-2 rounded-md border border-[var(--border)]">
              <Skeleton className="h-2 w-16 mb-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </SkeletonCard>
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
        <SkeletonCard className="h-[300px] p-0 overflow-hidden">
          <Skeleton className="h-9 w-full rounded-none rounded-t-xl mb-0" />
          <div className="p-3.5 flex flex-col gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-2 w-12 mb-1" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4 mt-0.5" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <div className="flex flex-col gap-3">
          <SkeletonCard className="h-[120px] p-3.5">
            <Skeleton className="h-2 w-16 mb-2" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-b-0">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </SkeletonCard>
          <SkeletonCard className="h-[160px] p-3.5">
            <Skeleton className="h-2 w-20 mb-2" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-20 mb-0.5" />
                  <Skeleton className="h-2 w-14" />
                </div>
              </div>
            ))}
          </SkeletonCard>
          <SkeletonCard className="h-[280px] p-3.5">
            <Skeleton className="h-2 w-16 mb-2" />
            <div className="flex flex-col gap-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}

export default function OppDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error, refetch } = useOpportunityDetail(id);
  const move = useMoveStage();
  const closeWon = useCloseWon();
  const closeLost = useCloseLost();
  const updateOpp = useUpdateOpportunity();
  const { openDrawer, closeDrawer } = useStore();
  const addToast = useStore(s => s.addToast);

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="max-w-[1100px]">
        <ErrorState message="Failed to load opportunity." onRetry={() => refetch()} />
      </div>
    );
  }

  const o = data?.data?.opportunity;
  const acts = data?.data?.activities ?? [];
  const contacts = data?.data?.contacts ?? [];

  if (!o) return <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-5 text-[var(--sub)]">Opportunity not found.</div>;

  const sIdx = STAGES.indexOf(o.stage);
  const hAvg = healthAvg(o.health);
  const isMutating = move.isPending || closeWon.isPending || closeLost.isPending || updateOpp.isPending;

  function openCloseWonDrawer() {
    const state = { winNotes: '', competitorBeaten: '', keyStakeholders: '', lessonsLearned: '' };
    openDrawer({
      title: 'Close Won',
      subtitle: o!.name,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">What made us win this deal?</span>
            <textarea
              onChange={e => { state.winNotes = e.target.value; }}
              rows={3}
              placeholder="Key factors, differentiators, timing..."
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Competitor Beaten (optional)</span>
            <input
              onChange={e => { state.competitorBeaten = e.target.value; }}
              placeholder="e.g. Salesforce, HubSpot"
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Key Stakeholders (optional)</span>
            <input
              onChange={e => { state.keyStakeholders = e.target.value; }}
              placeholder="e.g. CTO Jane Doe, VP Sales John Smith"
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Lessons Learned (optional)</span>
            <textarea
              onChange={e => { state.lessonsLearned = e.target.value; }}
              rows={2}
              placeholder="What should we replicate in future deals?"
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
            />
          </label>
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
            disabled={closeWon.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              closeWon.mutate(
                {
                  id: o!.id,
                  winNotes: state.winNotes || undefined,
                  competitorBeaten: state.competitorBeaten || undefined,
                  keyStakeholders: state.keyStakeholders || undefined,
                  lessonsLearned: state.lessonsLearned || undefined,
                },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: 'Deal closed as Won ✓' });
                    closeDrawer();
                  },
                  onError: (err: unknown) => addToast({ type: 'error', message: `Failed to close deal: ${err instanceof Error ? err.message : 'Unknown error'}` }),
                }
              );
            }}
          >
            {closeWon.isPending && <Spinner className="h-3 w-3" />}Close as Won
          </button>
        </>
      ),
    });
  }

  function openCloseLostDrawer() {
    const state = { lossReason: '', lossCompetitor: '', lossNotes: '', lessonsLearned: '' };
    let competitorEl: HTMLDivElement | null = null;

    openDrawer({
      title: 'Close Lost',
      subtitle: o!.name,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Loss Reason</span>
            <select
              defaultValue=""
              onChange={e => {
                state.lossReason = e.target.value;
                if (competitorEl) competitorEl.style.display = e.target.value === 'Competitor' ? 'flex' : 'none';
              }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            >
              <option value="" disabled>Select a reason…</option>
              <option value="Price">Price</option>
              <option value="Timing">Timing</option>
              <option value="Competitor">Competitor</option>
              <option value="No Budget">No Budget</option>
              <option value="No Decision">No Decision</option>
              <option value="Champion Left">Champion Left</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <div ref={el => { competitorEl = el; }} className="flex flex-col gap-1" style={{ display: 'none' }}>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Who did we lose to?</span>
              <input
                onChange={e => { state.lossCompetitor = e.target.value; }}
                placeholder="e.g. Competitor name"
                className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">What could we have done differently? (optional)</span>
            <textarea
              onChange={e => { state.lossNotes = e.target.value; }}
              rows={3}
              placeholder="Lessons learned, what to improve..."
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Lessons Learned (optional)</span>
            <textarea
              onChange={e => { state.lessonsLearned = e.target.value; }}
              rows={2}
              placeholder="Broader takeaways for the team..."
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40 resize-y"
            />
          </label>
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
            disabled={closeLost.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-red-500/[.15] text-red-400 border border-red-500/[.2] rounded-md hover:bg-red-500/[.25] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!state.lossReason) {
                addToast({ type: 'error', message: 'Please select a loss reason' });
                return;
              }
              closeLost.mutate(
                {
                  id: o!.id,
                  lossReason: state.lossReason,
                  lossCompetitor: state.lossCompetitor || undefined,
                  lossNotes: state.lossNotes || undefined,
                  lessonsLearned: state.lessonsLearned || undefined,
                },
                {
                  onSuccess: () => {
                    addToast({ type: 'info', message: 'Deal closed as Lost' });
                    closeDrawer();
                  },
                  onError: (err: unknown) => addToast({ type: 'error', message: `Failed to close deal: ${err instanceof Error ? err.message : 'Unknown error'}` }),
                }
              );
            }}
          >
            {closeLost.isPending && <Spinner className="h-3 w-3" />}Close as Lost
          </button>
        </>
      ),
    });
  }

  function openEditDrawer() {
    const state = { name: o!.name, amount: o!.amount, closeDate: o!.closeDate ? o!.closeDate.slice(0, 10) : '' };
    openDrawer({
      title: 'Edit Opportunity',
      subtitle: o!.name,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Name</span>
            <input
              defaultValue={state.name}
              onChange={e => { state.name = e.target.value; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</span>
            <input
              type="number"
              min={0}
              defaultValue={state.amount}
              onChange={e => { state.amount = Number(e.target.value) || 0; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-[var(--muted)]">Close Date</span>
            <input
              type="date"
              defaultValue={state.closeDate}
              onChange={e => { state.closeDate = e.target.value; }}
              className="px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40"
            />
          </label>
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
            disabled={updateOpp.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium bg-brand text-brand-on rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              const data: Record<string, unknown> = {};
              if (state.name !== o!.name) data.name = state.name;
              if (state.amount !== o!.amount) data.amount = state.amount;
              if (state.closeDate !== (o!.closeDate ? o!.closeDate.slice(0, 10) : '')) data.closeDate = state.closeDate;

              if (Object.keys(data).length === 0) {
                closeDrawer();
                return;
              }

              updateOpp.mutate(
                { id: o!.id, data },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: 'Opportunity updated' });
                    closeDrawer();
                  },
                  onError: (err: unknown) => addToast({ type: 'error', message: `Update failed: ${err instanceof Error ? err.message : 'Unknown error'}` }),
                }
              );
            }}
          >
            {updateOpp.isPending && <Spinner className="h-3 w-3" />}Save
          </button>
        </>
      ),
    });
  }

  const healthDims = [
    { l: 'Engagement', v: o.health.healthEngagement }, { l: 'Stakeholders', v: o.health.healthStakeholders },
    { l: 'Competitive', v: o.health.healthCompetitive }, { l: 'Timeline', v: o.health.healthTimeline },
  ];

  return (
    <div className="max-w-[1100px] page-enter">
      {/* Hero card */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-[18px] mb-3">
        <div className="flex items-start justify-between flex-col md:flex-row gap-3 mb-3">
          <div>
            <Link href={`/accounts/${o.accountId}`} className="text-sm text-brand hover:underline mb-0.5 block">{o.accountName} →</Link>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{o.name}</h1>
              <button
                onClick={openEditDrawer}
                disabled={isMutating}
                className="px-2 py-0.5 text-2xs font-medium text-[var(--sub)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Edit
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <StageBadge stage={o.stage} />
              <Badge variant="neutral">{o.probability}%</Badge>
              <HealthBar health={o.health} />
              <span className="text-2xs" style={{ color: riskHex(o.health) }}>Health: {hAvg}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-mono font-semibold text-5xl text-[var(--text)]">{fmt(o.amount)}</div>
            <div className="text-xs text-[var(--sub)] mt-0.5">Close: {fDate(o.closeDate)}</div>
            <div className="text-2xs text-[var(--muted)]">{fmt(weightedValue(o.amount, o.stage))} weighted</div>
          </div>
        </div>

        {/* Stage progress */}
        <div className="text-2xs text-[var(--muted)] mb-1">Stage Progress</div>
        <div className="flex gap-0.5">
          {STAGES.slice(0, -2).map((s, i) => (
            <div key={s} className="flex-1 h-1 rounded-sm" style={{ background: i <= sIdx ? (STAGE_COLOR[s] || '#33a882') : 'var(--surface)' }} />
          ))}
        </div>

        {/* Next action */}
        {o.nextAction && (
          <div className="ai-box mt-3 flex items-center gap-2.5">
            <div className="flex-1">
              <div className="text-3xs font-semibold tracking-widest uppercase text-brand mb-0.5">Next Action</div>
              <div className="text-sm font-medium text-[var(--text)]">{o.nextAction}</div>
            </div>
            {o.nextActionDate && <span className={cn('text-2xs', isOverdue(o.nextActionDate) ? 'text-danger' : 'text-[var(--muted)]')}>{fDate(o.nextActionDate)}</span>}
            <AgentTag name="Pipeline Hygiene" className="!text-3xs" />
          </div>
        )}

        {/* Health grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-[var(--border)]">
          {healthDims.map(d => {
            const c = d.v >= 60 ? '#33a882' : d.v >= 40 ? '#e8a838' : '#e05c5c';
            return (
              <div key={d.l} className="p-2 rounded-md border border-[var(--border)]">
                <div className="text-3xs uppercase tracking-wide text-[var(--muted)] mb-0.5">{d.l}</div>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold text-base" style={{ color: c }}>{d.v}</span>
                  <div className="flex-1 h-[3px] rounded-full bg-[var(--surface)]">
                    <div className="h-full rounded-full" style={{ width: `${d.v}%`, background: c }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
        {/* Activity */}
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]"><span className="text-sm font-semibold text-[var(--text)]">Activity</span></div>
          {acts.length === 0 ? (
            <div className="p-5 text-center text-[var(--muted)] text-sm">No activity</div>
          ) : acts.slice(0, 6).map((x: Activity) => (
            <div key={x.id} className="px-3.5 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-3xs font-semibold uppercase tracking-wide" style={{ color: ACT_COLOR[x.type] || '#4f576b' }}>{x.type}</span>
                <span className="text-2xs text-[var(--muted)]">{fR(x.createdAt)}</span>
              </div>
              <div className="text-sm font-medium text-[var(--text)]">{x.summary}</div>
              <div className="text-xs text-[var(--sub)] mt-px">{x.detail}</div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-3">
          {/* Details */}
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
            <div className="text-3xs font-semibold tracking-widest uppercase text-[var(--muted)] mb-2">Details</div>
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)]">
              <span className="text-2xs text-[var(--muted)]">Owner</span>
              <div className="flex items-center gap-1"><Avatar initials={o.owner.initials} color={o.owner.color} size="xs" /><span className="text-xs text-[var(--text)]">{o.owner.name.split(' ')[0]}</span></div>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-2xs text-[var(--muted)]">Close</span>
              <span className={cn('font-mono text-xs', isOverdue(o.closeDate) ? 'text-danger' : 'text-[var(--sub)]')}>{fDate(o.closeDate)}</span>
            </div>
          </div>

          {/* Contacts */}
          {contacts.length > 0 && (
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
              <div className="text-3xs font-semibold tracking-widest uppercase text-[var(--muted)] mb-2">Key Contacts</div>
              {contacts.map((c: Contact) => (
                <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--sub)] flex items-center justify-center text-3xs font-semibold flex-shrink-0">
                    {c.name.split(' ').map((w: string) => w[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--text)]">{c.name}</div>
                    <div className="text-3xs text-[var(--muted)]">{c.title}</div>
                  </div>
                  <Badge variant={c.role === 'Champion' ? 'ok' : c.role === 'EconomicBuyer' ? 'info' : 'neutral'} className="!text-3xs">{displayLabel(c.role)}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Move Stage */}
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
            <div className="text-3xs font-semibold tracking-widest uppercase text-[var(--muted)] mb-2">Move Stage</div>
            <div className="flex flex-col gap-0.5">
              {STAGES.filter(s => !['ClosedWon', 'ClosedLost'].includes(s)).map(s => {
                const active = o.stage === s;
                return (
                  <button
                    key={s}
                    disabled={active || isMutating}
                    onClick={() => move.mutate(
                      { id: o.id, stage: s },
                      {
                        onSuccess: () => addToast({ type: 'success', message: `Stage → ${displayLabel(s)}` }),
                        onError: (err: unknown) => addToast({ type: 'error', message: `Move failed: ${err instanceof Error ? err.message : 'Unknown error'}` }),
                      }
                    )}
                    className={cn(
                      'text-left px-2 py-1.5 rounded-md text-xs transition-colors border disabled:opacity-50',
                      active ? 'border-brand/30 bg-brand/[.08] text-brand' : 'border-transparent text-[var(--sub)] hover:bg-[var(--hover)]'
                    )}
                  >
                    {active ? '✓ ' : ''}{displayLabel(s)}
                  </button>
                );
              })}
              <div className="h-px bg-[var(--border)] my-0.5" />
              <button
                disabled={isMutating}
                onClick={openCloseWonDrawer}
                className="text-left px-2 py-1.5 rounded-md text-xs text-brand font-medium hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                {displayLabel('ClosedWon')}
              </button>
              <button
                disabled={isMutating}
                onClick={openCloseLostDrawer}
                className="text-left px-2 py-1.5 rounded-md text-xs text-danger hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                {displayLabel('ClosedLost')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
