'use client';
import { cn } from '@/lib/utils';
import type { Meeting } from '@/lib/types';
import { Users } from 'lucide-react';

const PREP_DOT: Record<string, string> = {
  ready: 'bg-green-500',
  draft: 'bg-amber-500',
};

interface Props {
  meeting: Meeting;
  onClick: () => void;
  style?: React.CSSProperties;
  color?: string;
}

export function MeetingCard({ meeting, onClick, style, color }: Props) {
  const isPast = new Date(meeting.date) < new Date();
  const isToday = new Date(meeting.date).toDateString() === new Date().toDateString();
  const needsPrep = meeting.prepStatus !== 'ready' && (isToday || (!isPast && new Date(meeting.date).getTime() - Date.now() < 86400000));

  return (
    <button
      onClick={onClick}
      style={{
        ...style,
        backgroundColor: color ? `${color}15` : undefined,
        borderLeft: color ? `3px solid ${color}` : undefined,
      }}
      className={cn(
        'text-left rounded-md px-1.5 py-1 text-xs overflow-hidden cursor-pointer transition-all hover:brightness-95',
        !color && 'bg-[var(--elevated)] border border-[var(--border)]'
      )}
    >
      <div className="flex items-center gap-1">
        <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
          needsPrep ? 'bg-red-500' : PREP_DOT[meeting.prepStatus] || 'bg-gray-400'
        )} />
        <span className="font-medium truncate">{meeting.title}</span>
      </div>
      <div className="flex items-center gap-1 text-2xs text-muted mt-0.5">
        <span>{meeting.startTime}</span>
        {meeting.attendees?.length > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Users className="w-2.5 h-2.5" /> {meeting.attendees.length}
          </span>
        )}
      </div>
      {meeting.accountName && (
        <div className="text-2xs truncate mt-0.5" style={{ color: color || 'var(--text-sub)' }}>
          {meeting.accountName}
        </div>
      )}
    </button>
  );
}
