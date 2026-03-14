'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Shield, AlertTriangle, TrendingUp, ArrowRight, Zap, Signal, Calendar, Activity, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useHomeSummary } from '@/lib/queries/home';
import { useMeetingsQuery } from '@/lib/queries/meetings';
import { healthAvg } from '@/lib/types';
import { fmt, fRelative } from '@/lib/utils';
import { Badge, HealthBar, AgentTag, Skeleton, SkeletonCard, SkeletonText, ErrorState, HelpTip } from '@/components/ui';
import { WelcomeBanner } from '@/components/shell/WelcomeBanner';
import type { Meeting as MeetingType } from '@/lib/types';

import type { Signal as UISignal, Opportunity as UIOpportunity, Meeting as UIMeeting, Activity as UIActivity } from '@/lib/types';

function HomeSkeleton() {
  return (
    <div className="page-enter max-w-[1100px] mx-auto w-full space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-3.5 w-48" />
      </div>
      <div className="hidden md:grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="space-y-2">
            <SkeletonText className="w-1/2 h-2" />
            <Skeleton className="h-5 w-12" />
          </SkeletonCard>
        ))}
      </div>
      <div className="md:hidden flex flex-wrap gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-[calc(50%-6px)] rounded-xl" />
        ))}
      </div>
      <div className="grid md:grid-cols-[1fr,320px] gap-4">
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s} className="space-y-2">
              <SkeletonText className="w-24 h-2" />
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} className="h-14" />
              ))}
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <SkeletonText className="w-24 h-2" />
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} className="h-14" />
            ))}
          </div>
          <div className="space-y-2">
            <SkeletonText className="w-24 h-2" />
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} className="h-10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

export default function HomePage() {
  const { data: session } = useSession();
  const { data, isLoading, error, refetch } = useHomeSummary();
  const [scheduleOffset, setScheduleOffset] = useState(0);
  const scheduleDate = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + scheduleOffset); return d; }, [scheduleOffset]);
  const { data: meetingsResp } = useMeetingsQuery(scheduleOffset !== 0 ? toDateStr(scheduleDate) : undefined);
  const scheduleMeetings: MeetingType[] = scheduleOffset !== 0 ? (meetingsResp?.data ?? []) : [];

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = session?.user?.name?.split(' ')[0] ?? 'there';

  if (isLoading || (!data && !error)) {
    return <HomeSkeleton />;
  }

  if (error) {
    return (
      <div className="max-w-[1100px] page-enter flex flex-col items-center justify-center py-20">
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  if (!data) return null;

  const { stats, nextBestActions, topSignals, todayMeetings, dealsAtRisk, recentActivity } = data as {
    stats: { pipelineTotal: number; pipelineWeighted: number; openDeals: number; atRiskCount: number; pendingApprovals: number; newSignals: number; unreadEmails: number; accountCount: number };
    nextBestActions: { type: string; title: string; meta: string; urgency: number; href: string; reason?: string }[];
    topSignals: UISignal[];
    todayMeetings: UIMeeting[];
    dealsAtRisk: UIOpportunity[];
    recentActivity: UIActivity[];
  };

  // Map NBA types to icons and styles
  const nbaStyle: Record<string, { icon: React.ReactNode; color: string; cta: string }> = {
    approval: { icon: <Shield className="w-3.5 h-3.5" />, color: 'text-warn', cta: 'Review' },
    overdue_task: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-danger', cta: 'Handle' },
    at_risk: { icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'text-warn', cta: 'View' },
    next_action: { icon: <ArrowRight className="w-3.5 h-3.5" />, color: 'text-brand', cta: 'Open' },
    signals: { icon: <Signal className="w-3.5 h-3.5" />, color: 'text-info', cta: 'Review' },
  };

  const statCards = [
    { l: 'Pipeline', v: fmt(stats.pipelineTotal), s: `${fmt(stats.pipelineWeighted)} weighted`, c: 'text-brand', hex: '#3ecf8e', trend: [65, 70, 68, 75, 72, 80, 85] },
    { l: 'Open Deals', v: stats.openDeals, s: '', c: 'text-info', hex: '#3b82f6', trend: [8, 9, 8, 10, 11, 10, 12] },
    { l: 'At Risk', v: stats.atRiskCount, s: stats.atRiskCount ? '' : 'All healthy', c: stats.atRiskCount ? 'text-danger' : 'text-brand', hex: stats.atRiskCount ? '#ef4444' : '#3ecf8e', trend: [3, 4, 2, 3, 2, 1, stats.atRiskCount] },
    { l: 'Approvals', v: stats.pendingApprovals, s: stats.pendingApprovals ? 'Pending review' : 'All clear', c: stats.pendingApprovals ? 'text-warn' : 'text-brand', hex: stats.pendingApprovals ? '#eab308' : '#3ecf8e', trend: [5, 3, 4, 6, 4, 3, stats.pendingApprovals] },
    { l: 'Signals', v: stats.newSignals, s: `${stats.newSignals} need review`, c: 'text-purple', hex: '#a855f7', trend: [2, 4, 3, 5, 4, 6, stats.newSignals] },
  ];

  return (
    <div className="max-w-[1100px] page-enter">
      <div className="mb-5">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">{greeting}, <span className="text-brand">{firstName}</span></h1>
        <p className="text-sm text-muted mt-1">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {nextBestActions.length} actions pending</p>
      </div>

      <WelcomeBanner name={firstName} stats={{ accountCount: stats.accountCount, openDeals: stats.openDeals, newSignals: stats.newSignals }} />

      <div className="hidden md:grid grid-cols-5 gap-2 mb-4">
        {statCards.map(s => {
          const min = Math.min(...s.trend);
          const max = Math.max(...s.trend);
          const range = max - min || 1;
          const h = 24;
          const w = 100;
          const points = s.trend.map((v, i) => `${(i / (s.trend.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`).join(' ');
          const fillPoints = `${points} ${w},${h} 0,${h}`;
          const up = s.trend[s.trend.length - 1] >= s.trend[0];
          return (
            <div key={s.l} className="p-3.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)]">
              <div className={`text-3xs font-semibold tracking-[0.1em] uppercase ${s.c} mb-2`}>{s.l}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-bold tracking-tight leading-none">{s.v}</span>
                <span className="text-2xs" style={{ color: s.hex }}>{up ? '↑' : '↓'}</span>
              </div>
              <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-1.5 block w-full">
                <defs>
                  <linearGradient id={`sg-${s.l}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.hex} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={s.hex} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={fillPoints} fill={`url(#sg-${s.l})`} />
                <polyline points={points} fill="none" stroke={s.hex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {s.s && <div className="text-xs text-muted mt-1">{s.s}</div>}
            </div>
          );
        })}
      </div>

      <div className="md:hidden mb-3 p-3 rounded-lg bg-[var(--elevated)] border border-[var(--border)] flex flex-wrap justify-between gap-2">
        {statCards.map(s => (
          <div key={s.l} className="text-center min-w-[50px]">
            <div className={`text-3xs font-semibold tracking-[0.1em] uppercase ${s.c}`}>{s.l}</div>
            <div className="font-mono text-lg font-bold">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3">
        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-brand" />
                <span className="text-base font-semibold">Next Best Actions</span>
                <HelpTip label="AI-recommended actions ranked by predicted impact on deal progression" />
                <Badge variant="ai" className="!text-3xs">AI</Badge>
              </div>
              <span className="text-2xs text-muted font-mono">{nextBestActions.length}</span>
            </div>
            {nextBestActions.map((a, i) => {
              const style = nbaStyle[a.type] ?? nbaStyle.next_action;
              return (
                <Link key={i} href={a.href} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors group">
                  <div className={`w-7 h-7 rounded-md bg-[var(--surface)] flex items-center justify-center flex-shrink-0 ${style.color}`}>{style.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{a.title}</div>
                    <div className="text-2xs text-muted mt-0.5">{a.meta}</div>
                    {a.reason && (
                      <div className="flex items-start gap-1 mt-1">
                        <Lightbulb className="w-3 h-3 text-warn/60 flex-shrink-0 mt-px" />
                        <span className="text-3xs text-muted/60 leading-snug">{a.reason}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-2xs font-medium text-brand flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{style.cta} →</span>
                </Link>
              );
            })}
          </div>

          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Signal className="w-3.5 h-3.5 text-info" />
                <span className="text-base font-semibold">Top Signals</span>
              </div>
              <Link href="/signals" className="text-2xs text-muted hover:text-brand transition-colors">View all →</Link>
            </div>
            {topSignals.map((s: UISignal) => (
              <Link key={s.id} href={`/signals?open=${s.id}`} className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
                <div className="w-7 h-7 rounded-md bg-[var(--surface)] text-info flex items-center justify-center flex-shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight">{s.title}</div>
                  <div className="mt-1"><AgentTag name={s.agent} className="!text-3xs" /></div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
              <Calendar className="w-3.5 h-3.5 text-purple" />
              <span className="text-base font-semibold flex-1">
                {scheduleOffset === 0 ? "Today\u2019s Schedule" : scheduleDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setScheduleOffset(o => o - 1)} aria-label="Previous day" className="p-0.5 rounded hover:bg-[var(--hover)] transition-colors text-muted hover:text-[var(--text)]"><ChevronLeft className="w-3.5 h-3.5" /></button>
                {scheduleOffset !== 0 && <button onClick={() => setScheduleOffset(0)} className="text-2xs text-brand hover:underline">Today</button>}
                <button onClick={() => setScheduleOffset(o => o + 1)} aria-label="Next day" className="p-0.5 rounded hover:bg-[var(--hover)] transition-colors text-muted hover:text-[var(--text)]"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {(() => {
              const meetings = scheduleOffset === 0 ? todayMeetings : scheduleMeetings;
              return meetings.length === 0 ? (
                <div className="p-6 text-center text-muted text-sm">No meetings {scheduleOffset === 0 ? 'today' : 'on this day'}</div>
              ) : meetings.map((m: UIMeeting) => (
                <Link href={`/meetings/${m.id}`} key={m.id} className="block px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-brand font-semibold">{m.startTime}</span>
                    <span className="text-2xs text-muted font-mono">{m.duration}</span>
                    <Badge variant={m.prepStatus === 'ready' ? 'ok' : 'warn'} className="!text-3xs">{m.prepStatus === 'ready' ? 'Prep ready' : 'Prep needed'}</Badge>
                  </div>
                  <div className="text-sm font-medium">{m.title}</div>
                  <div className="text-2xs text-muted mt-0.5">{m.attendees.join(', ')}</div>
                </Link>
              ));
            })()}
          </div>

          {dealsAtRisk.length > 0 && (
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
                <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                <span className="text-base font-semibold">Deals at Risk</span>
                <HelpTip label="Real-time snapshot of deal flow, velocity, and risk across all stages" title="Pipeline Health" />
              </div>
              {dealsAtRisk.map((o: UIOpportunity) => (
                <Link key={o.id} href={`/pipeline/${o.id}`} className="block px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium">{o.name}</span>
                    <HealthBar health={o.health} />
                  </div>
                  <div className="text-2xs text-danger">Health: {healthAvg(o.health)} · {o.accountName}</div>
                </Link>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
              <Activity className="w-3.5 h-3.5 text-sub" />
              <span className="text-base font-semibold">Recent Activity</span>
            </div>
            {recentActivity.slice(0, 4).map((x: UIActivity) => (
              <div key={x.id} className="px-4 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
                {x.accountId && <div className="text-3xs font-semibold tracking-wide text-muted uppercase">{x.accountName}</div>}
                <div className="text-sm font-medium mt-0.5">{x.summary}</div>
                <div className="text-2xs text-muted mt-0.5">{x.author.initials} · {fRelative(x.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
