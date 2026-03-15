'use client';
import { useState } from 'react';
import { useSubmitOutcome, useMarkNoShow, useMeetingDetail } from '@/lib/queries/meetings';
import { Badge, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Sparkles, CheckCircle2, AlertCircle, Clipboard } from 'lucide-react';
import type { Meeting } from '@/lib/types';

type Step = 'paste' | 'processing' | 'review';

interface Props {
  meetingId: string;
  meeting: Meeting;
}

export function OutcomeTab({ meetingId, meeting }: Props) {
  const [step, setStep] = useState<Step>(meeting.outcomeSummary ? 'review' : 'paste');
  const [notes, setNotes] = useState('');
  const submitOutcome = useSubmitOutcome(meetingId);
  const markNoShow = useMarkNoShow(meetingId);
  const { data: detailData, refetch } = useMeetingDetail(meetingId);

  // If already has outcome, show it
  if (meeting.outcomeSummary && step !== 'paste') {
    return (
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="rounded-lg border border-brand/20 bg-brand/[.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-brand" />
            <span className="text-sm font-semibold">Outcome Recorded</span>
            {meeting.sentimentTag && (
              <Badge variant={meeting.sentimentTag === 'positive' ? 'ok' : meeting.sentimentTag === 'negative' ? 'err' : 'neutral'}>
                {meeting.sentimentTag}
              </Badge>
            )}
          </div>
          <p className="text-sm text-sub whitespace-pre-wrap">{meeting.outcomeSummary}</p>
          {meeting.outcomeRecordedAt && (
            <p className="text-2xs text-muted mt-2">Recorded {new Date(meeting.outcomeRecordedAt).toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={() => setStep('paste')}
          className="text-xs text-brand hover:underline"
        >
          Re-process with new notes
        </button>
      </div>
    );
  }

  // No-show state
  if (meeting.noShow) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="w-8 h-8 text-warn mx-auto mb-2" />
        <p className="text-sm font-medium">Marked as No-Show</p>
        <p className="text-xs text-muted mt-1">This meeting was marked as a no-show.</p>
      </div>
    );
  }

  // Step 1: Paste prompt
  if (step === 'paste') {
    const handleSubmit = () => {
      if (!notes.trim()) return;
      setStep('processing');
      submitOutcome.mutate(notes, {
        onSuccess: () => {
          refetch();
          setStep('review');
        },
        onError: () => setStep('paste'),
      });
    };

    return (
      <div className="p-4 space-y-4">
        {/* Paste zone with shimmer */}
        <div className="relative rounded-xl overflow-hidden">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand/20 via-purple/20 to-brand/20 animate-shimmer"
               style={{ backgroundSize: '200% 100%' }} />
          <div className="relative m-[2px] rounded-xl bg-[var(--elevated)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-brand" />
              <h3 className="text-base font-semibold">Paste your meeting notes</h3>
            </div>
            <p className="text-sm text-sub mb-4">
              We'll create a structured summary, extract tasks, and update your accounts — all powered by Claude.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste your raw notes here...&#10;&#10;Example: Met with John from Acme. Discussed their GoO requirements for Q3. They need 50 GWh of wind certificates. John mentioned their new sustainability officer Sarah wants to see a demo. Follow up next Tuesday..."
              className="w-full h-40 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm p-3 resize-y focus:outline-none focus:border-brand/40 transition-colors placeholder:text-muted/50"
              autoFocus
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleSubmit}
                disabled={!notes.trim() || submitOutcome.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brand text-brand-on hover:brightness-110 transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" /> Process with AI
              </button>
              <button
                onClick={() => markNoShow.mutate()}
                disabled={markNoShow.isPending}
                className="px-3 py-2 text-xs text-muted hover:text-[var(--text)] transition-colors"
              >
                Mark as No-Show
              </button>
            </div>
          </div>
        </div>

        {/* Shimmer animation */}
        <style jsx>{`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .animate-shimmer {
            animation: shimmer 3s ease-in-out infinite;
          }
        `}</style>
      </div>
    );
  }

  // Step 2: Processing
  if (step === 'processing') {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[300px]">
        <div className="relative">
          <Spinner className="w-8 h-8 text-brand" />
          <Sparkles className="w-4 h-4 text-brand absolute -top-1 -right-1 animate-pulse" />
        </div>
        <p className="text-sm font-medium mt-4">Analyzing your notes...</p>
        <p className="text-xs text-muted mt-1">Extracting summary, tasks, and insights</p>
      </div>
    );
  }

  // Step 3: Review (after processing completes)
  const updatedMeeting = detailData?.data ?? meeting;
  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {updatedMeeting.outcomeSummary && (
        <div className="rounded-lg border border-brand/20 bg-brand/[.03] p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-brand" />
            <span className="text-sm font-semibold">AI Summary</span>
            {updatedMeeting.sentimentTag && (
              <Badge variant={updatedMeeting.sentimentTag === 'positive' ? 'ok' : updatedMeeting.sentimentTag === 'negative' ? 'err' : 'neutral'}>
                {updatedMeeting.sentimentTag}
              </Badge>
            )}
          </div>
          <p className="text-sm text-sub whitespace-pre-wrap">{updatedMeeting.outcomeSummary}</p>
        </div>
      )}
      <p className="text-xs text-muted">
        Tasks, enrichment suggestions, and follow-up meetings have been routed to the approval queue for your review.
      </p>
    </div>
  );
}
