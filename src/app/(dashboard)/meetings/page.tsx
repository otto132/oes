'use client';
import { useState } from 'react';
import { useMeetingsQuery } from '@/lib/queries/meetings';
import { CalendarGrid } from '@/components/meetings/CalendarGrid';
import { MeetingDrawer } from '@/components/meetings/MeetingDrawer';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Meeting } from '@/lib/types';

function CalendarSkeleton() {
  return (
    <div className="flex-1 p-4">
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="w-32 h-8" />
        <Skeleton className="w-20 h-8" />
      </div>
      <Skeleton className="w-full h-[600px]" />
    </div>
  );
}

export default function MeetingsPage() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // Fetch meetings for a broader range to cover view needs
  const range = view === 'week' ? 7 : 42;
  const dateStr = currentDate.toISOString().split('T')[0];
  const { data: resp, isLoading, isError, refetch } = useMeetingsQuery(dateStr, range);

  const meetings: Meeting[] = resp?.data ?? [];

  const navigateDate = (direction: number) => {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + direction * 7);
    else d.setDate(d.getDate() + direction * 30);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

  const formatDateRange = (): string => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const day = currentDate.getDay();
    const monday = new Date(currentDate);
    monday.setDate(currentDate.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  if (isLoading) return <CalendarSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand" />
            Meetings
          </h1>
          <div className="flex items-center gap-1 ml-4">
            <button onClick={() => navigateDate(-1)} className="p-1 rounded hover:bg-[var(--hover)] transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goToToday} className="px-2 py-1 text-xs font-medium rounded hover:bg-[var(--hover)] transition-colors">
              Today
            </button>
            <button onClick={() => navigateDate(1)} className="p-1 rounded hover:bg-[var(--hover)] transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm font-medium text-sub ml-2">{formatDateRange()}</span>
        </div>
        <div className="flex items-center rounded-md border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setView('week')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'week' ? 'bg-brand text-brand-on' : 'hover:bg-[var(--hover)]'
            )}
          >
            Week
          </button>
          <button
            onClick={() => setView('month')}
            className={cn('px-3 py-1.5 text-xs font-medium transition-colors border-l border-[var(--border)]',
              view === 'month' ? 'bg-brand text-brand-on' : 'hover:bg-[var(--hover)]'
            )}
          >
            Month
          </button>
        </div>
      </div>

      {/* Calendar */}
      {meetings.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState icon="📅" title="No meetings" description="No meetings scheduled for this period." />
        </div>
      ) : (
        <CalendarGrid
          meetings={meetings}
          view={view}
          currentDate={currentDate}
          onMeetingClick={setSelectedMeetingId}
        />
      )}

      {selectedMeetingId && (
        <MeetingDrawer
          meetingId={selectedMeetingId}
          onClose={() => setSelectedMeetingId(null)}
        />
      )}
    </div>
  );
}
