'use client';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Meeting } from '@/lib/types';
import { MeetingCard } from './MeetingCard';

function accountColor(accountId: string): string {
  let hash = 0;
  for (const char of accountId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7 AM - 7 PM
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Props {
  meetings: Meeting[];
  view: 'week' | 'month';
  currentDate: Date;
  onMeetingClick: (meetingId: string) => void;
}

function getWeekDays(date: Date): Date[] {
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthDays(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const startDay = (first.getDay() + 6) % 7; // Monday-based
  const start = new Date(first);
  start.setDate(1 - startDay);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function parseTime(timeStr: string): number {
  // Parse "10:00" or "10:00 AM" to hour decimal
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return 9;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  if (match[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
  if (match[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
  return h + m / 60;
}

function parseDuration(dur: string): number {
  // Parse "30 min", "1h", "1.5h", "90 min"
  const minMatch = dur.match(/(\d+)\s*min/i);
  if (minMatch) return parseInt(minMatch[1]);
  const hrMatch = dur.match(/([\d.]+)\s*h/i);
  if (hrMatch) return parseFloat(hrMatch[1]) * 60;
  return 30;
}

export function CalendarGrid({ meetings, view, currentDate, onMeetingClick }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (view === 'month') {
    const monthDays = getMonthDays(currentDate);
    const currentMonth = currentDate.getMonth();

    return (
      <div className="flex-1 overflow-auto">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[var(--border)]">
          {DAYS.map(d => (
            <div key={d} className="px-2 py-1.5 text-xs font-semibold text-muted text-center">{d}</div>
          ))}
        </div>
        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {monthDays.map((day, i) => {
            const isCurrentMonth = day.getMonth() === currentMonth;
            const isToday = day.toDateString() === today.toDateString();
            const dayMeetings = meetings.filter(m => new Date(m.date).toDateString() === day.toDateString());
            return (
              <div key={i} className={cn(
                'min-h-[100px] p-1.5 border-b border-r border-[var(--border)]',
                !isCurrentMonth && 'opacity-40',
                isToday && 'bg-brand/[.03]'
              )}>
                <span className={cn(
                  'text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full',
                  isToday && 'bg-brand text-brand-on'
                )}>
                  {day.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayMeetings.slice(0, 3).map(m => (
                    <button
                      key={m.id}
                      onClick={() => onMeetingClick(m.id)}
                      className="block w-full text-left px-1 py-0.5 text-2xs rounded truncate hover:brightness-90 transition-colors"
                      style={{ backgroundColor: `${accountColor(m.accountId)}20`, color: accountColor(m.accountId) }}
                    >
                      {m.startTime} {m.title}
                    </button>
                  ))}
                  {dayMeetings.length > 3 && (
                    <span className="text-2xs text-muted px-1">+{dayMeetings.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Week view
  const weekDays = getWeekDays(currentDate);
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;

  return (
    <div className="flex-1 overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[var(--border)] sticky top-0 bg-[var(--page)] z-10">
        <div /> {/* time gutter */}
        {weekDays.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString();
          return (
            <div key={i} className={cn('px-2 py-2 text-center border-l border-[var(--border)]', isToday && 'bg-brand/[.03]')}>
              <div className="text-xs text-muted">{DAYS[i]}</div>
              <div className={cn('text-sm font-semibold', isToday && 'text-brand')}>{day.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
        {/* Time labels */}
        {HOURS.map(h => (
          <div key={h} className="col-start-1 text-2xs text-muted text-right pr-2 py-0 relative" style={{ gridRow: `${(h - 7) * 4 + 1} / span 4`, height: '60px' }}>
            <span className="absolute -top-1.5 right-2">{h > 12 ? h - 12 : h}{h >= 12 ? 'PM' : 'AM'}</span>
          </div>
        ))}

        {/* Hour lines */}
        {HOURS.map(h => (
          <div key={`line-${h}`} className="col-span-7 col-start-2 border-t border-[var(--border)]" style={{ gridRow: `${(h - 7) * 4 + 1}`, height: 0 }} />
        ))}

        {/* Day columns */}
        {weekDays.map((day, di) => {
          const dayStr = day.toDateString();
          const dayMeetings = meetings.filter(m => new Date(m.date).toDateString() === dayStr);
          const isToday = dayStr === today.toDateString();

          return (
            <div key={di} className={cn('relative border-l border-[var(--border)]', isToday && 'bg-brand/[.02]')} style={{ gridColumn: di + 2, gridRow: `1 / span ${HOURS.length * 4}`, height: `${HOURS.length * 60}px` }}>
              {/* Current time line */}
              {isToday && nowHour >= 7 && nowHour <= 19 && (
                <div className="absolute left-0 right-0 border-t-2 border-brand z-10" style={{ top: `${((nowHour - 7) / (HOURS.length)) * 100}%` }}>
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-brand" />
                </div>
              )}

              {/* Meeting cards */}
              {dayMeetings.map(m => {
                const startH = parseTime(m.startTime);
                const durMin = parseDuration(m.duration);
                const top = ((startH - 7) / HOURS.length) * 100;
                const height = (durMin / 60 / HOURS.length) * 100;
                return (
                  <MeetingCard
                    key={m.id}
                    meeting={m}
                    onClick={() => onMeetingClick(m.id)}
                    style={{ position: 'absolute', top: `${top}%`, height: `${Math.max(height, 3)}%`, left: '2px', right: '2px' }}
                    color={accountColor(m.accountId)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
