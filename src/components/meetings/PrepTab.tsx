'use client';
import { useState } from 'react';
import { useMeetingPrep } from '@/lib/queries/meetings';
import { Badge, Spinner, Skeleton, SkeletonText } from '@/components/ui';
import { cn, fR } from '@/lib/utils';
import { Sparkles, Clock, User, Briefcase, ListTodo, RefreshCw } from 'lucide-react';

interface Props {
  meetingId: string;
}

export function PrepTab({ meetingId }: Props) {
  const { data, isLoading, refetch, isFetching } = useMeetingPrep(meetingId);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-20 w-full" />
        <SkeletonText />
        <SkeletonText className="w-3/4" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const prep = data?.data;
  if (!prep) {
    return (
      <div className="p-4 text-center text-muted">
        <p className="text-sm">No prep data available.</p>
        <button onClick={() => refetch()} className="mt-2 text-xs text-brand hover:underline">Generate prep</button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Last meeting outcome - prominent */}
      {prep.lastMeetingOutcome && (
        <div className="rounded-lg border border-brand/20 bg-brand/[.03] p-3">
          <div className="text-3xs font-semibold tracking-widest uppercase text-brand mb-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Last Meeting
          </div>
          <div className="text-sm font-medium">{prep.lastMeetingOutcome.title}</div>
          <div className="text-2xs text-muted mb-1">{new Date(prep.lastMeetingOutcome.date).toLocaleDateString()}</div>
          {prep.lastMeetingOutcome.summary && (
            <p className="text-xs text-sub mt-1">{prep.lastMeetingOutcome.summary}</p>
          )}
        </div>
      )}

      {/* AI talking points */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-3xs font-semibold tracking-widest uppercase text-muted flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-brand" /> Talking Points
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 text-2xs text-brand hover:underline disabled:opacity-50"
          >
            {isFetching ? <Spinner className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>
        <div className="text-sm text-sub whitespace-pre-wrap leading-relaxed">{prep.talkingPoints}</div>
      </div>

      {/* Account context */}
      {prep.account && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="text-3xs font-semibold tracking-widest uppercase text-muted flex items-center gap-1 mb-2">
            <Briefcase className="w-3 h-3" /> Account
          </div>
          <div className="text-sm font-medium">{prep.account.name}</div>
          {prep.account.pain && <p className="text-xs text-sub mt-1">{prep.account.pain}</p>}
        </div>
      )}

      {/* Attendees */}
      {prep.attendees?.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="text-3xs font-semibold tracking-widest uppercase text-muted flex items-center gap-1 mb-2">
            <User className="w-3 h-3" /> Attendees
          </div>
          <div className="space-y-1.5">
            {prep.attendees.map((a: string, i: number) => (
              <div key={i} className="text-sm">{a}</div>
            ))}
          </div>
        </div>
      )}

      {/* Open tasks */}
      {prep.openTasks?.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="text-3xs font-semibold tracking-widest uppercase text-muted flex items-center gap-1 mb-2">
            <ListTodo className="w-3 h-3" /> Open Tasks
          </div>
          {prep.openTasks.map((t: any) => (
            <div key={t.id} className="text-sm text-sub py-1 border-b border-[var(--border)] last:border-0">{t.title}</div>
          ))}
        </div>
      )}

      {/* Opportunities */}
      {prep.opportunities?.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--elevated)] p-3">
          <div className="text-3xs font-semibold tracking-widest uppercase text-muted flex items-center gap-1 mb-2">
            <Briefcase className="w-3 h-3" /> Opportunities
          </div>
          {prep.opportunities.map((o: any) => (
            <div key={o.id} className="flex items-center justify-between py-1 text-sm">
              <span>{o.name}</span>
              <Badge variant="info" className="!text-3xs">{o.stage}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
