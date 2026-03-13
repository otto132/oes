'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useOpportunityDetail, useMoveStage, useCloseWon, useCloseLost } from '@/lib/queries/opportunities';
import { Badge, Avatar, HealthBar, StageBadge, AgentTag, Skeleton, SkeletonCard, ErrorState } from '@/components/ui';
import { fmt, fDate, fR, isOverdue, weightedValue, cn } from '@/lib/utils';
import { STAGES, STAGE_COLOR, healthAvg } from '@/lib/types';
import type { Activity, Contact } from '@/lib/types';
import { useStore } from '@/lib/store';
import { mapOppStage } from '@/lib/adapters';

function riskHex(h: { eng: number; stake: number; comp: number; time: number }): string {
  const a = healthAvg(h);
  return a >= 60 ? '#33a882' : a >= 40 ? '#e8a838' : '#e05c5c';
}

const ACT_COLOR: Record<string, string> = { Email: '#5b9cf6', Meeting: '#33a882', Call: '#33a882', Note: '#e8a838' };

// Map display stage names back to Prisma enum values for the API
const DISPLAY_TO_PRISMA: Record<string, string> = {
  'Solution Fit': 'SolutionFit',
  'Closed Won': 'ClosedWon',
  'Closed Lost': 'ClosedLost',
  'Verbal Commit': 'VerbalCommit',
};
function toPrismaStage(display: string): string {
  return DISPLAY_TO_PRISMA[display] ?? display;
}

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

  function openCloseWonDrawer() {
    const state = { winNotes: '', competitorBeaten: '' };

    openDrawer({
      title: 'Close Won',
      subtitle: o!.name,
      body: (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Win Notes</span>
            <textarea
              placeholder="What helped us win?"
              onChange={e => { state.winNotes = e.target.value; }}
              rows={3}
              className="px-2.5 py-1.5 text-[12px] rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-brand/40 resize-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Competitor Beaten (optional)</span>
            <input
              placeholder="Which competitor?"
              onChange={e => { state.competitorBeaten = e.target.value; }}
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
            disabled={closeWon.isPending}
            className="px-3.5 py-1.5 text-[12px] font-medium bg-[var(--brand)] text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              closeWon.mutate(
                {
                  id: o!.id,
                  winNotes: state.winNotes.trim() || undefined,
                  competitorBeaten: state.competitorBeaten.trim() || undefined,
                },
                {
                  onSuccess: () => {
                    addToast({ type: 'success', message: `Deal won! ${o!.name}` });
                    closeDrawer();
                  },
                  onError: (err) => addToast({ type: 'error', message: `Close failed: ${err.message}` }),
                }
              );
            }}
          >
            Confirm Win
          </button>
        </>
      ),
    });
  }

  const sIdx = STAGES.indexOf(o.stage);
  const hAvg = healthAvg(o.health);
  const isMutating = move.isPending || closeWon.isPending || closeLost.isPending;

  const healthDims = [
    { l: 'Engagement', v: o.health.eng }, { l: 'Stakeholders', v: o.health.stake },
    { l: 'Competitive', v: o.health.comp }, { l: 'Timeline', v: o.health.time },
  ];

  return (
    <div className="max-w-[1100px] page-enter">
      {/* Hero card */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-[18px] mb-3">
        <div className="flex items-start justify-between flex-col md:flex-row gap-3 mb-3">
          <div>
            <Link href={`/accounts/${o.accId}`} className="text-[12px] text-brand hover:underline mb-0.5 block">{o.accName} →</Link>
            <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">{o.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <StageBadge stage={o.stage} />
              <Badge variant="neutral">{o.prob}%</Badge>
              <HealthBar health={o.health} />
              <span className="text-[10px]" style={{ color: riskHex(o.health) }}>Health: {hAvg}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-mono font-semibold text-[26px] text-[var(--text)]">{fmt(o.amt)}</div>
            <div className="text-[11px] text-[var(--sub)] mt-0.5">Close: {fDate(o.close)}</div>
            <div className="text-[10.5px] text-[var(--muted)]">{fmt(weightedValue(o.amt, o.stage))} weighted</div>
          </div>
        </div>

        {/* Stage progress */}
        <div className="text-[10px] text-[var(--muted)] mb-1">Stage Progress</div>
        <div className="flex gap-0.5">
          {STAGES.slice(0, -2).map((s, i) => (
            <div key={s} className="flex-1 h-1 rounded-sm" style={{ background: i <= sIdx ? (STAGE_COLOR[s] || '#33a882') : 'var(--surface)' }} />
          ))}
        </div>

        {/* Next action */}
        {o.next && (
          <div className="ai-box mt-3 flex items-center gap-2.5">
            <div className="flex-1">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-0.5">Next Action</div>
              <div className="text-[12.5px] font-medium text-[var(--text)]">{o.next}</div>
            </div>
            {o.nextDate && <span className={cn('text-[10.5px]', isOverdue(o.nextDate) ? 'text-danger' : 'text-[var(--muted)]')}>{fDate(o.nextDate)}</span>}
            <AgentTag name="Pipeline Hygiene" className="!text-[8px]" />
          </div>
        )}

        {/* Health grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-[var(--border)]">
          {healthDims.map(d => {
            const c = d.v >= 60 ? '#33a882' : d.v >= 40 ? '#e8a838' : '#e05c5c';
            return (
              <div key={d.l} className="p-2 rounded-md border border-[var(--border)]">
                <div className="text-[9px] uppercase tracking-wide text-[var(--muted)] mb-0.5">{d.l}</div>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold text-[13px]" style={{ color: c }}>{d.v}</span>
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
          <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]"><span className="text-[12.5px] font-semibold text-[var(--text)]">Activity</span></div>
          {acts.length === 0 ? (
            <div className="p-5 text-center text-[var(--muted)] text-[12px]">No activity</div>
          ) : acts.slice(0, 6).map((x: Activity) => (
            <div key={x.id} className="px-3.5 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: ACT_COLOR[x.type] || '#4f576b' }}>{x.type}</span>
                <span className="text-[10px] text-[var(--muted)]">{fR(x.date)}</span>
              </div>
              <div className="text-[12px] font-medium text-[var(--text)]">{x.sum}</div>
              <div className="text-[11px] text-[var(--sub)] mt-px">{x.detail}</div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-3">
          {/* Details */}
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--muted)] mb-2">Details</div>
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)]">
              <span className="text-[10.5px] text-[var(--muted)]">Owner</span>
              <div className="flex items-center gap-1"><Avatar initials={o.owner.ini} color={o.owner.ac} size="xs" /><span className="text-[11px] text-[var(--text)]">{o.owner.name.split(' ')[0]}</span></div>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[10.5px] text-[var(--muted)]">Close</span>
              <span className={cn('font-mono text-[11px]', isOverdue(o.close) ? 'text-danger' : 'text-[var(--sub)]')}>{fDate(o.close)}</span>
            </div>
          </div>

          {/* Contacts */}
          {contacts.length > 0 && (
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--muted)] mb-2">Key Contacts</div>
              {contacts.map((c: Contact) => (
                <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--sub)] flex items-center justify-center text-[8px] font-semibold flex-shrink-0">
                    {c.name.split(' ').map((w: string) => w[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-[var(--text)]">{c.name}</div>
                    <div className="text-[9px] text-[var(--muted)]">{c.title}</div>
                  </div>
                  <Badge variant={c.role === 'Champion' ? 'ok' : c.role === 'Economic Buyer' ? 'info' : 'neutral'} className="!text-[8px]">{c.role}</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Move Stage */}
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--muted)] mb-2">Move Stage</div>
            <div className="flex flex-col gap-0.5">
              {STAGES.filter(s => !['Closed Won', 'Closed Lost'].includes(s)).map(s => {
                const active = o.stage === s;
                return (
                  <button
                    key={s}
                    disabled={active || isMutating}
                    onClick={() => move.mutate(
                      { id: o.id, stage: toPrismaStage(s) },
                      {
                        onSuccess: () => addToast({ type: 'success', message: `Stage → ${s}` }),
                        onError: (err: Error) => addToast({ type: 'error', message: `Move failed: ${err.message}` }),
                      }
                    )}
                    className={cn(
                      'text-left px-2 py-1.5 rounded-md text-[11.5px] transition-colors border disabled:opacity-50',
                      active ? 'border-brand/30 bg-brand/[.08] text-brand' : 'border-transparent text-[var(--sub)] hover:bg-[var(--hover)]'
                    )}
                  >
                    {active ? '✓ ' : ''}{s}
                  </button>
                );
              })}
              <div className="h-px bg-[var(--border)] my-0.5" />
              <button
                disabled={isMutating}
                onClick={openCloseWonDrawer}
                className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-brand font-medium hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                Closed Won
              </button>
              <button
                disabled={isMutating}
                onClick={() => closeLost.mutate({ id: o.id, lossReason: 'Unknown' })}
                className="text-left px-2 py-1.5 rounded-md text-[11.5px] text-danger hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              >
                Closed Lost
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
