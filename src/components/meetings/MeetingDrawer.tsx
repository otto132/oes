'use client';
import { useState, useEffect } from 'react';
import { useMeetingDetail } from '@/lib/queries/meetings';
import { PrepTab } from './PrepTab';
import { OutcomeTab } from './OutcomeTab';
import { Skeleton, SkeletonText } from '@/components/ui';
import { cn } from '@/lib/utils';
import { X, Calendar, Clock, Users } from 'lucide-react';
import type { Meeting } from '@/lib/types';

interface Props {
  meetingId: string;
  onClose: () => void;
}

export function MeetingDrawer({ meetingId, onClose }: Props) {
  const [tab, setTab] = useState<'prep' | 'outcome'>('prep');
  const { data, isLoading } = useMeetingDetail(meetingId);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const meeting: Meeting | undefined = data?.data;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[480px] max-w-full bg-[var(--elevated)] border-l border-[var(--border)] shadow-xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            {isLoading ? (
              <Skeleton className="w-48 h-5" />
            ) : (
              <h2 className="text-base font-semibold truncate pr-4">{meeting?.title}</h2>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--hover)] transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          {meeting && (
            <div className="flex items-center gap-3 text-2xs text-muted">
              <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(meeting.date).toLocaleDateString()}</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {meeting.startTime}</span>
              <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {meeting.attendees?.length ?? 0}</span>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-[var(--border)] flex-shrink-0">
          <button
            onClick={() => setTab('prep')}
            className={cn('flex-1 py-2.5 text-sm font-medium text-center transition-colors',
              tab === 'prep' ? 'text-brand border-b-2 border-brand' : 'text-muted hover:text-[var(--text)]'
            )}
          >
            Prep
          </button>
          <button
            onClick={() => setTab('outcome')}
            className={cn('flex-1 py-2.5 text-sm font-medium text-center transition-colors',
              tab === 'outcome' ? 'text-brand border-b-2 border-brand' : 'text-muted hover:text-[var(--text)]'
            )}
          >
            Outcome
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-20 w-full" />
              <SkeletonText />
              <SkeletonText className="w-2/3" />
            </div>
          ) : meeting ? (
            tab === 'prep' ? (
              <PrepTab meetingId={meetingId} />
            ) : (
              <OutcomeTab meetingId={meetingId} meeting={meeting} />
            )
          ) : null}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
