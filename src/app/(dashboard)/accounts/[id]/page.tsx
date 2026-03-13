'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAccountDetail } from '@/lib/queries/accounts';
import type { Account, Opportunity, Activity, Task, Goal } from '@/lib/types';
import { fmt, fRelative, fDate, isOverdue, cn, confNum } from '@/lib/utils';
import { Badge, ScorePill, FIUACBars, ConfBadge, AgentTag, Avatar, StageBadge, HealthBar, SectionTitle, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';

const ACT_COLOR: Record<string, string> = { Email: '#5b9cf6', Meeting: '#33a882', Call: '#33a882', Note: '#e8a838' };

export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading, error, refetch } = useAccountDetail(id);
  const [tab, setTab] = useState('overview');

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="max-w-[1100px] page-enter">
        <SkeletonCard className="p-[18px] mb-3">
          <div className="flex gap-3.5 items-start flex-col md:flex-row">
            <Skeleton className="w-11 h-11 rounded-lg flex-shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <div className="flex items-center gap-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <Skeleton className="h-5 w-16 mb-1 ml-auto" />
              <Skeleton className="h-3 w-24 mb-1 ml-auto" />
              <Skeleton className="h-3 w-20 ml-auto" />
            </div>
          </div>
          <div className="flex gap-2 mt-3.5 pt-3 border-t border-[var(--border)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} className="flex-1 min-w-[80px] p-2">
                <Skeleton className="h-2 w-12 mb-1.5" />
                <Skeleton className="h-4 w-16" />
              </SkeletonCard>
            ))}
          </div>
        </SkeletonCard>
        <div className="flex border-b border-[var(--border)] mb-4 gap-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3.5 py-2">
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
          <SkeletonCard className="p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mb-3">
                <Skeleton className="h-2 w-24 mb-1.5" />
                <SkeletonText />
              </div>
            ))}
          </SkeletonCard>
          <SkeletonCard className="p-3.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                <Skeleton className="w-[26px] h-[26px] rounded-full flex-shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-2 w-32" />
                </div>
              </div>
            ))}
          </SkeletonCard>
        </div>
      </div>
    );
  }

  /* ── Error / not found ── */
  if (error || !data?.data) {
    return (
      <div className="max-w-[1100px] page-enter">
        <ErrorState
          message={error ? 'Failed to load account.' : 'Account not found.'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const a: Account = data.data;
  const accOpps: Opportunity[] = data.opportunities ?? [];
  const accActs: Activity[] = (data.activities ?? []).sort((x: Activity, y: Activity) => new Date(y.date).getTime() - new Date(x.date).getTime());
  const accTasks: Task[] = data.tasks ?? [];
  const accGoals: Goal[] = data.goals ?? [];
  const openPipe = accOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage)).reduce((s, o) => s + o.amt, 0);
  const stale = (Date.now() - new Date(a.lastAct).getTime()) / 864e5 > 14;
  const conf = confNum(a.aiConf);

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts', count: a.contacts.length },
    { key: 'opps', label: 'Opportunities', count: accOpps.length },
    { key: 'activity', label: 'Activity', count: accActs.length },
    { key: 'tasks', label: 'Tasks', count: accTasks.filter(t => t.status !== 'Done').length },
  ];

  return (
    <div className="max-w-[1100px] page-enter">
      {/* ── Header card ── */}
      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-[18px] mb-3">
        <div className="flex gap-3.5 items-start flex-col md:flex-row">
          <div className="w-11 h-11 rounded-lg bg-brand/[.08] border border-brand/20 text-brand flex items-center justify-center text-lg font-semibold flex-shrink-0">
            {a.name[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-[18px] font-semibold tracking-tight">{a.name}</h1>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <Badge variant={a.status === 'Active' ? 'ok' : a.status === 'Partner' ? 'purple' : 'info'}>{a.status}</Badge>
              <Badge variant="neutral">{a.type} · {a.country}</Badge>
              {a.schemes.map(s => <Badge key={s} variant="neutral" className="!text-[9px]">{s}</Badge>)}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 justify-end">
              <ScorePill scores={a.scores} />
              <span className="text-[10px] text-muted">FIUAC</span>
            </div>
            <div className="mt-1"><FIUACBars scores={a.scores} /></div>
            <div className={cn('text-[10.5px] mt-1', stale ? 'text-warn' : 'text-muted')}>
              {stale && '\u26A0 '}Last: {fRelative(a.lastAct)}
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div className="flex gap-2 mt-3.5 pt-3 border-t border-[var(--border)] flex-wrap">
          {[
            { l: 'Pipeline', v: fmt(openPipe) },
            { l: 'Open Opps', v: accOpps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage)).length },
            { l: 'Contacts', v: a.contacts.length },
            { l: 'Confidence', v: `${Math.round(conf * 100)}%` },
          ].map(s => (
            <div key={s.l} className="flex-1 min-w-[80px] p-2 rounded-md bg-[var(--surface)] border border-[var(--border)]">
              <div className="text-[9px] font-semibold tracking-[0.1em] uppercase text-muted mb-0.5">{s.l}</div>
              <div className="text-[14px] font-semibold font-mono">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-[var(--border)] mb-4 gap-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-3.5 py-2 text-[12.5px] border-b-2 -mb-px whitespace-nowrap transition-colors',
              tab === t.key
                ? 'text-[var(--text)] border-brand font-medium'
                : 'text-sub border-transparent hover:text-[var(--text)]'
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1 text-[10px] font-semibold font-mono px-[5px] py-px rounded-full bg-[var(--surface)] text-muted">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
          {/* AI brief */}
          <div className="ai-box">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1.5">AI Account Brief</div>
            <div className="flex flex-col gap-2.5">
              <div>
                <SectionTitle>Pain Hypothesis</SectionTitle>
                <p className="text-[12.5px] leading-relaxed">{a.pain || 'Not yet assessed'}</p>
              </div>
              <div>
                <SectionTitle>Why Now</SectionTitle>
                <p className="text-[12.5px] leading-relaxed">{a.whyNow || 'No why-now signal yet'}</p>
              </div>
              <div>
                <SectionTitle>Module Fit</SectionTitle>
                <div className="flex flex-wrap gap-1">
                  {(a.fit || []).map(m => <Badge key={m} variant="ok">{m}</Badge>)}
                  {!a.fit?.length && <span className="text-[12px] text-muted">{'\u2014'}</span>}
                </div>
              </div>
              {a.competitors && (
                <div>
                  <SectionTitle>Competitive Landscape</SectionTitle>
                  <p className="text-[12.5px] leading-relaxed text-warn">{a.competitors}</p>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <AgentTag name="Account Enricher" />
              <ConfBadge value={conf} />
              <span className="text-[10px] text-muted">Last updated {fRelative(a.lastAct)}</span>
            </div>
          </div>

          {/* Buying committee sidebar */}
          <div>
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
              <div className="flex items-center justify-between mb-2">
                <SectionTitle>Buying Committee</SectionTitle>
                <Badge variant="ai" className="!text-[8px]">AI Mapped</Badge>
              </div>
              {a.contacts.length === 0 ? (
                <div className="text-[12px] text-muted text-center py-3">No contacts</div>
              ) : (
                a.contacts.map(c => (
                  <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-[var(--border)] last:border-b-0">
                    <Avatar initials={c.name.split(' ').map(w => w[0]).join('')} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] font-medium truncate">{c.name}</div>
                      <div className="text-[9.5px] text-muted truncate">{c.title}</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <Badge variant={c.role === 'Champion' ? 'ok' : c.role === 'Economic Buyer' ? 'info' : 'neutral'} className="!text-[8.5px]">{c.role}</Badge>
                      <span className={cn('text-[9px]', c.warmth === 'Strong' ? 'text-brand' : c.warmth === 'Warm' ? 'text-warn' : 'text-info')}>{c.warmth}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Contacts ── */}
      {tab === 'contacts' && (
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5">
          {a.contacts.length === 0 ? (
            <EmptyState icon="\uD83D\uDC65" title="No contacts" description="Add contacts to build the buying committee map." />
          ) : (
            a.contacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
                <Avatar initials={c.name.split(' ').map(w => w[0]).join('')} size="lg" color="green" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium">{c.name}</div>
                  <div className="text-[10.5px] text-sub">{c.title}</div>
                  {c.email && <div className="text-[10.5px] text-info mt-0.5">{c.email}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant={c.role === 'Champion' ? 'ok' : c.role === 'Economic Buyer' ? 'info' : 'neutral'}>{c.role}</Badge>
                  <Badge variant={c.warmth === 'Strong' ? 'ok' : c.warmth === 'Warm' ? 'warn' : 'info'}>{c.warmth}</Badge>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Opportunities ── */}
      {tab === 'opps' && (
        accOpps.length === 0 ? (
          <EmptyState icon="\uD83D\uDCCA" title="No opportunities" description="Create one or convert a qualified lead." />
        ) : (
          <div className="flex flex-col gap-2">
            {accOpps.map(o => (
              <Link key={o.id} href={`/pipeline/${o.id}`}>
                <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3.5 cursor-pointer hover:border-[var(--border-strong)] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-semibold">{o.name}</span>
                    <StageBadge stage={o.stage} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{fmt(o.amt)}</span>
                    <div className="flex items-center gap-2">
                      <HealthBar health={o.health} />
                      <span className="text-[10.5px] text-sub">Close: {fDate(o.close)}</span>
                    </div>
                  </div>
                  {o.next && <div className="text-[10.5px] text-muted mt-1">{'\u2192'} {o.next}</div>}
                </div>
              </Link>
            ))}
          </div>
        )
      )}

      {/* ── Activity ── */}
      {tab === 'activity' && (
        accActs.length === 0 ? (
          <EmptyState icon="\uD83D\uDCC5" title="No activity" description="Activity from emails, meetings, and notes will appear here." />
        ) : (
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-4">
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-0 bottom-0 w-px bg-[var(--border)]" />
              {accActs.map(x => (
                <div key={x.id} className="relative pb-4 last:pb-0">
                  <div
                    className="absolute -left-[13px] top-[3px] w-2 h-2 rounded-full border-2 border-[var(--elevated)]"
                    style={{ background: ACT_COLOR[x.type] || '#4f576b' }}
                  />
                  <div
                    className="text-[9px] font-semibold uppercase tracking-wide mb-0.5 flex items-center gap-1.5"
                    style={{ color: ACT_COLOR[x.type] || '#4f576b' }}
                  >
                    {x.type}
                    <Badge variant="neutral" className="!text-[8.5px]">{x.src}</Badge>
                  </div>
                  <div className="text-[12.5px] font-medium mb-0.5">{x.sum}</div>
                  <div className="text-[11.5px] text-sub leading-relaxed">{x.detail}</div>
                  <div className="text-[10px] text-muted mt-0.5">{x.who.name} · {fRelative(x.date)}</div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* ── Tasks ── */}
      {tab === 'tasks' && (
        <div className="flex flex-col gap-1.5">
          {accTasks.filter(t => t.status !== 'Done').length === 0 ? (
            <EmptyState icon="\u2611" title="No open tasks" description="Tasks for this account will appear here." />
          ) : (
            accTasks.filter(t => t.status !== 'Done').map(t => {
              const od = isOverdue(t.due);
              return (
                <div key={t.id} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors">
                  <div className={cn('w-3.5 h-3.5 rounded border-[1.5px] flex-shrink-0', od ? 'border-danger' : 'border-[var(--border-strong)]')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium truncate">{t.title}</div>
                  </div>
                  <Badge variant={t.pri === 'High' ? 'err' : 'neutral'} className="!text-[9px]">{t.pri}</Badge>
                  <span className={cn('font-mono text-[10.5px] flex-shrink-0', od ? 'text-danger' : 'text-sub')}>{fDate(t.due)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
