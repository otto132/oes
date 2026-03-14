'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, Clock, Users, CheckCircle2, ArrowLeft,
  FileText, TrendingUp,
} from 'lucide-react';
import { useMeetingDetail, useUpdateMeeting, useLogOutcome } from '@/lib/queries/meetings';
import { Badge, FIUACBars, StageBadge, EmptyState, Skeleton, SkeletonText, Spinner } from '@/components/ui';

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, error } = useMeetingDetail(id);
  const updateMeeting = useUpdateMeeting();
  const logOutcome = useLogOutcome(id);

  const [prepNotes, setPrepNotes] = useState('');
  const [prepNotesLoaded, setPrepNotesLoaded] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({
    summary: '',
    sentiment: 'neutral' as 'positive' | 'neutral' | 'negative',
    nextSteps: '',
    createFollowUp: false,
    followUpTitle: '',
    followUpDue: '',
  });

  if (isLoading) {
    return (
      <div className="max-w-[1100px] page-enter">
        <Skeleton className="w-[60%] h-8 mb-6" />
        <div className="space-y-3">
          <SkeletonText className="w-full h-3" />
          <SkeletonText className="w-full h-3" />
          <SkeletonText className="w-3/4 h-3" />
          <SkeletonText className="w-full h-3" />
          <SkeletonText className="w-5/6 h-3" />
          <SkeletonText className="w-full h-3" />
          <SkeletonText className="w-2/3 h-3" />
          <SkeletonText className="w-full h-3" />
        </div>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="max-w-[1100px] page-enter">
        <EmptyState icon="!" title="Meeting not found" description="This meeting does not exist or could not be loaded." />
      </div>
    );
  }

  const meeting = data.data;
  const account = data.account;
  const contacts = data.contacts ?? [];
  const activities = data.activities ?? [];
  const opportunities = data.opportunities ?? [];

  if (!prepNotesLoaded && meeting.prepNotes !== undefined) {
    setPrepNotes(meeting.prepNotes ?? '');
    setPrepNotesLoaded(true);
  }

  const isPast = new Date(meeting.date) < new Date();

  const handleSavePrepNotes = () => {
    updateMeeting.mutate({ id, data: { prepNotes } });
  };

  const handleMarkReady = () => {
    updateMeeting.mutate({ id, data: { prepStatus: 'ready' } });
  };

  const handleSubmitOutcome = () => {
    logOutcome.mutate(outcomeForm, {
      onSuccess: () => setShowOutcome(false),
    });
  };

  return (
    <div className="max-w-[1100px] page-enter">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand transition-colors mb-3">
          <ArrowLeft size={14} /> Back to Home
        </Link>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">{meeting.title}</h1>
            <div className="flex gap-4 text-muted text-sm mt-2">
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} />
                {new Date(meeting.date).toLocaleDateString()}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={14} />
                {meeting.startTime}{' \u00b7 '}{meeting.duration}{' \u00b7 '}{Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/.*\//, '').replace('_', ' ')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={14} />
                {meeting.attendees?.length ?? 0} attendees
              </span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Badge variant={meeting.prepStatus === 'ready' ? 'ok' : 'neutral'}>
              {meeting.prepStatus === 'ready' ? 'Ready' : 'Draft'}
            </Badge>
            {meeting.prepStatus !== 'ready' && (
              <button
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline disabled:opacity-50"
                onClick={handleMarkReady}
                disabled={updateMeeting.isPending}
              >
                {updateMeeting.isPending ? <Spinner className="h-3 w-3" /> : <CheckCircle2 size={14} />} Mark Ready
              </button>
            )}
          </div>
        </div>

        {account && (
          <Link href={`/accounts/${account.id}`} className="text-sm text-brand hover:underline mt-2 inline-block">
            {account.name}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Prep Panel */}
        <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <FileText size={16} className="text-brand" /> Meeting Prep
          </h2>

          <div className="mb-5">
            <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-1.5">Talking Points</label>
            <textarea
              className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm p-2.5 resize-y focus:outline-none focus:border-brand/40 transition-colors placeholder:text-muted/50"
              rows={4}
              value={prepNotes}
              onChange={(e) => setPrepNotes(e.target.value)}
              onBlur={handleSavePrepNotes}
              placeholder="Add your agenda or talking points..."
            />
          </div>

          {account && (
            <>
              {account.pain && (
                <div className="mb-3">
                  <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-1">Pain</label>
                  <p className="text-sm text-sub">{account.pain}</p>
                </div>
              )}
              {account.whyNow && (
                <div className="mb-3">
                  <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-1">Why Now</label>
                  <p className="text-sm text-sub">{account.whyNow}</p>
                </div>
              )}
              {account.scores && <FIUACBars scores={account.scores} />}
            </>
          )}

          {contacts.length > 0 && (
            <div className="mt-4">
              <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-2">Key Contacts</label>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted">
                    <th className="text-left pb-1.5">Name</th>
                    <th className="text-left pb-1.5">Role</th>
                    <th className="text-left pb-1.5">Warmth</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c: any) => (
                    <tr key={c.id} className="border-t border-[var(--border)]">
                      <td className="py-1.5">{c.name}</td>
                      <td className="py-1.5"><Badge variant="neutral">{c.role}</Badge></td>
                      <td className="py-1.5"><Badge variant={c.warmth === 'Strong' ? 'ok' : c.warmth === 'Warm' ? 'warn' : 'neutral'}>{c.warmth}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {opportunities.length > 0 && (
            <div className="mt-4">
              <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-2">Open Opportunities</label>
              {opportunities.map((opp: any) => (
                <div key={opp.id} className="flex justify-between items-center py-1.5 border-b border-[var(--border)] text-sm">
                  <span>{opp.name}</span>
                  <StageBadge stage={opp.stage} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Activity + Outcome */}
        <div className="flex flex-col gap-4">
          {activities.length > 0 && (
            <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-5">
              <h2 className="text-base font-semibold mb-3">Recent Activity</h2>
              {activities.map((a: any) => (
                <div key={a.id} className="py-2 border-b border-[var(--border)]">
                  <div className="flex justify-between items-start">
                    <span className="text-sm">{a.summary}</span>
                    <span className="text-2xs text-muted whitespace-nowrap ml-2">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-5">
            <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-brand" /> Meeting Outcome
            </h2>

            {!showOutcome ? (
              <button
                className={`w-full text-sm font-medium py-2 rounded-md border transition-colors ${
                  isPast
                    ? 'bg-brand/10 text-brand border-brand/20 hover:bg-brand/20'
                    : 'bg-[var(--surface)] text-sub border-[var(--border)] hover:bg-[var(--hover)]'
                }`}
                onClick={() => setShowOutcome(true)}
              >
                Log Outcome
              </button>
            ) : (
              <div>
                <div className="mb-3">
                  <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-1">Summary *</label>
                  <textarea
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm p-2.5 resize-y focus:outline-none focus:border-brand/40 transition-colors placeholder:text-muted/50"
                    rows={3}
                    value={outcomeForm.summary}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, summary: e.target.value })}
                    placeholder="What happened in the meeting?"
                  />
                </div>

                <div className="mb-3">
                  <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-1">Sentiment</label>
                  <select
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm p-2 focus:outline-none focus:border-brand/40 transition-colors"
                    value={outcomeForm.sentiment}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, sentiment: e.target.value as any })}
                  >
                    <option value="positive">Positive</option>
                    <option value="neutral">Neutral</option>
                    <option value="negative">Negative</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="text-3xs font-semibold tracking-[0.1em] uppercase text-muted block mb-1">Next Steps</label>
                  <textarea
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm p-2.5 resize-y focus:outline-none focus:border-brand/40 transition-colors placeholder:text-muted/50"
                    rows={2}
                    value={outcomeForm.nextSteps}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, nextSteps: e.target.value })}
                    placeholder="What happens next?"
                  />
                </div>

                <div className="mb-3">
                  <label className="flex items-center gap-2 text-sm text-sub cursor-pointer">
                    <input
                      type="checkbox"
                      checked={outcomeForm.createFollowUp}
                      onChange={(e) => setOutcomeForm({ ...outcomeForm, createFollowUp: e.target.checked })}
                      className="accent-[var(--brand)]"
                    />
                    Create follow-up task
                  </label>
                </div>

                {outcomeForm.createFollowUp && (
                  <div className="ml-6 mb-3 space-y-2">
                    <input
                      className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm p-2 focus:outline-none focus:border-brand/40 transition-colors placeholder:text-muted/50"
                      placeholder="Task title"
                      value={outcomeForm.followUpTitle}
                      onChange={(e) => setOutcomeForm({ ...outcomeForm, followUpTitle: e.target.value })}
                    />
                    <input
                      className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm p-2 focus:outline-none focus:border-brand/40 transition-colors"
                      type="date"
                      value={outcomeForm.followUpDue}
                      onChange={(e) => setOutcomeForm({ ...outcomeForm, followUpDue: e.target.value })}
                    />
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    className="inline-flex items-center gap-1.5 text-sm font-medium py-1.5 px-4 rounded-md bg-brand text-brand-on hover:bg-brand/90 transition-colors disabled:opacity-50"
                    onClick={handleSubmitOutcome}
                    disabled={!outcomeForm.summary || logOutcome.isPending}
                  >
                    {logOutcome.isPending && <Spinner className="h-3 w-3" />}{logOutcome.isPending ? 'Saving...' : 'Save Outcome'}
                  </button>
                  <button
                    className="text-sm font-medium py-1.5 px-4 rounded-md bg-[var(--surface)] border border-[var(--border)] text-sub hover:bg-[var(--hover)] transition-colors"
                    onClick={() => setShowOutcome(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
