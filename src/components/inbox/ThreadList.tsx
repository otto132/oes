'use client';
import { useRef } from 'react';
import { cn, fR, clsLabel } from '@/lib/utils';
import { Badge } from '@/components/ui';
import type { EmailThread } from '@/lib/types';



const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'unlinked', label: 'Unlinked' },
  { key: 'buying_signal', label: 'Buying Signals' },
  { key: 'positive_reply', label: 'Positive' },
  { key: 'question', label: 'Questions' },
  { key: 'objection', label: 'Objections' },
  { key: 'meeting_request', label: 'Meetings' },
];

const CLS_STYLE: Record<string, string> = {
  positive_reply: 'text-brand bg-brand-dim',
  question: 'text-info bg-info/[.10]',
  objection: 'text-danger bg-danger/[.10]',
  meeting_request: 'text-purple bg-purple/[.10]',
  new_domain: 'text-warn bg-warn/[.10]',
  auto_reply: 'text-muted bg-[var(--surface)]',
};

interface Props {
  threads: EmailThread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  filter: string;
  onFilterChange: (filter: string) => void;
}

export function ThreadList({ threads, selectedThreadId, onSelectThread, filter, onFilterChange }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="p-3 border-b border-[var(--border)] space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key === 'all' ? '' : f.key)}
              className={cn(
                'px-2 py-1 text-2xs font-medium rounded-md whitespace-nowrap transition-colors',
                (filter === f.key || (!filter && f.key === 'all'))
                  ? 'bg-brand text-brand-on'
                  : 'text-sub hover:bg-[var(--hover)]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Thread list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">No conversations match this filter.</div>
        ) : (
          threads.map(thread => (
            <div
              key={thread.threadId}
              onClick={() => onSelectThread(thread.threadId)}
              className={cn(
                'px-3 py-2.5 border-b border-[var(--border)] cursor-pointer transition-colors',
                selectedThreadId === thread.threadId
                  ? 'bg-brand/[.06] border-l-2 border-l-brand'
                  : 'hover:bg-[var(--hover)]'
              )}
            >
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {thread.isUnread && (
                    <div className="w-1.5 h-1.5 rounded-full bg-info flex-shrink-0" />
                  )}
                  <span className={cn('text-sm truncate', thread.isUnread ? 'font-semibold' : 'font-normal')}>
                    {thread.latestEmail.fromName}
                  </span>
                  {thread.emails.length > 1 && (
                    <span className="text-2xs text-muted flex-shrink-0">({thread.emails.length})</span>
                  )}
                </div>
                <span className="text-2xs text-muted flex-shrink-0 ml-2">
                  {fR(thread.latestEmail.receivedAt)}
                </span>
              </div>
              <div className="text-xs font-medium text-[var(--text)] truncate mb-0.5">
                {thread.latestEmail.subject}
              </div>
              <div className="text-2xs text-sub truncate">{thread.latestEmail.preview}</div>
              <div className="flex items-center gap-1 mt-1">
                {thread.classification && (
                  <span className={cn('text-3xs font-semibold tracking-wide uppercase px-1 py-px rounded-sm',
                    CLS_STYLE[thread.classification] || CLS_STYLE.auto_reply)}>
                    {clsLabel[thread.classification] || thread.classification}
                  </span>
                )}
                {thread.accountName && (
                  <Badge variant="ok" className="!text-3xs">{thread.accountName}</Badge>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
