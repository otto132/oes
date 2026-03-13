'use client';
import Link from 'next/link';
import { Shield, AlertTriangle, TrendingUp, ArrowRight, Zap, Signal, Calendar, Activity } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useHomeSummary } from '@/lib/queries/home';
import { healthAvg } from '@/lib/types';
import { fmt, fRelative } from '@/lib/utils';
import { Badge, HealthBar, AgentTag, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';

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

export default function HomePage() {
  const { data: session } = useSession();
  const { data, isLoading, error, refetch } = useHomeSummary();

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
    stats: { pipelineTotal: number; pipelineWeighted: number; openDeals: number; atRiskCount: number; pendingApprovals: number; newSignals: number; unreadEmails: number };
    nextBestActions: { type: string; title: string; meta: string; urgency: number; href: string }[];
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
    { l: 'Pipeline', v: fmt(stats.pipelineTotal), s: `${fmt(stats.pipelineWeighted)} weighted`, c: 'text-brand' },
    { l: 'Open Deals', v: stats.openDeals, s: '', c: 'text-info' },
    { l: 'At Risk', v: stats.atRiskCount, s: stats.atRiskCount ? '' : 'All healthy', c: stats.atRiskCount ? 'text-danger' : 'text-brand' },
    { l: 'Approvals', v: stats.pendingApprovals, s: stats.pendingApprovals ? 'Pending review' : 'All clear', c: stats.pendingApprovals ? 'text-warn' : 'text-brand' },
    { l: 'Signals', v: stats.newSignals, s: `${stats.newSignals} need review`, c: 'text-purple' },
  ];

  return (
    <div className="max-w-[1100px] page-enter">
      <div className="mb-5">
        <h1 className="text-[24px] md:text-[28px] font-semibold tracking-tight">{greeting}, <span className="text-brand">{firstName}</span></h1>
        <p className="text-[12px] text-muted mt-1">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {nextBestActions.length} actions pending</p>
      </div>

      <div className="hidden md:grid grid-cols-5 gap-2 mb-4">
        {statCards.map(s => (
          <div key={s.l} className="p-3.5 rounded-lg bg-[var(--elevated)] border border-[var(--border)]">
            <div className={`text-[9px] font-semibold tracking-[0.1em] uppercase ${s.c} mb-2`}>{s.l}</div>
            <div className="font-mono text-[20px] font-bold tracking-tight leading-none">{s.v}</div>
            <div className="text-[11px] text-muted mt-1">{s.s}</div>
          </div>
        ))}
      </div>

      <div className="md:hidden mb-3 p-3 rounded-lg bg-[var(--elevated)] border border-[var(--border)] flex flex-wrap justify-between gap-2">
        {statCards.map(s => (
          <div key={s.l} className="text-center min-w-[50px]">
            <div className={`text-[8px] font-semibold tracking-[0.1em] uppercase ${s.c}`}>{s.l}</div>
            <div className="font-mono text-[15px] font-bold">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-3">
        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-brand" />
                <span className="text-[13px] font-semibold">Next Best Actions</span>
                <Badge variant="ai" className="!text-[8px]">AI</Badge>
              </div>
              <span className="text-[10px] text-muted font-mono">{nextBestActions.length}</span>
            </div>
            {nextBestActions.map((a, i) => {
              const style = nbaStyle[a.type] ?? nbaStyle.next_action;
              return (
                <Link key={i} href={a.href} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors group">
                  <div className={`w-7 h-7 rounded-md bg-[var(--surface)] flex items-center justify-center flex-shrink-0 ${style.color}`}>{style.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium leading-tight">{a.title}</div>
                    <div className="text-[10.5px] text-muted mt-0.5">{a.meta}</div>
                  </div>
                  <span className="text-[10.5px] font-medium text-brand flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">{style.cta} →</span>
                </Link>
              );
            })}
          </div>

          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Signal className="w-3.5 h-3.5 text-info" />
                <span className="text-[13px] font-semibold">Top Signals</span>
              </div>
              <Link href="/signals" className="text-[10.5px] text-muted hover:text-brand transition-colors">View all →</Link>
            </div>
            {topSignals.map((s: UISignal) => (
              <Link key={s.id} href="/signals" className="flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
                <div className="w-7 h-7 rounded-md bg-[var(--surface)] text-info flex items-center justify-center flex-shrink-0">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium leading-tight">{s.title}</div>
                  <div className="mt-1"><AgentTag name={s.agent} className="!text-[8px]" /></div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
              <Calendar className="w-3.5 h-3.5 text-purple" />
              <span className="text-[13px] font-semibold">Today&apos;s Schedule</span>
            </div>
            {todayMeetings.length === 0 ? (
              <div className="p-6 text-center text-muted text-[12px]">No meetings today</div>
            ) : todayMeetings.map((m: UIMeeting) => (
              <div key={m.id} className="px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[11px] text-brand font-semibold">{m.time}</span>
                  <span className="text-[10px] text-muted font-mono">{m.dur}</span>
                  <Badge variant={m.prep === 'ready' ? 'ok' : 'warn'} className="!text-[8px]">{m.prep === 'ready' ? 'Prep ready' : 'Prep needed'}</Badge>
                </div>
                <div className="text-[12.5px] font-medium">{m.title}</div>
                <div className="text-[10px] text-muted mt-0.5">{m.who.join(', ')}</div>
              </div>
            ))}
          </div>

          {dealsAtRisk.length > 0 && (
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
                <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                <span className="text-[13px] font-semibold">Deals at Risk</span>
              </div>
              {dealsAtRisk.map((o: UIOpportunity) => (
                <Link key={o.id} href={`/pipeline/${o.id}`} className="block px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[12.5px] font-medium">{o.name}</span>
                    <HealthBar health={o.health} />
                  </div>
                  <div className="text-[10.5px] text-danger">Health: {healthAvg(o.health)} · {o.accName}</div>
                </Link>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
              <Activity className="w-3.5 h-3.5 text-sub" />
              <span className="text-[13px] font-semibold">Recent Activity</span>
            </div>
            {recentActivity.slice(0, 4).map((x: UIActivity) => (
              <div key={x.id} className="px-4 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors">
                {x.accId && <div className="text-[9px] font-semibold tracking-wide text-muted uppercase">{x.accName}</div>}
                <div className="text-[12px] font-medium mt-0.5">{x.sum}</div>
                <div className="text-[10px] text-muted mt-0.5">{x.who.ini} · {fRelative(x.date)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
