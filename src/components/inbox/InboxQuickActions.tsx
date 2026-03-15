'use client';
import { useState } from 'react';
import { Spinner } from '@/components/ui';
import { Reply, ListTodo, Link, Clock, Archive } from 'lucide-react';

interface Props {
  emailId: string;
  onDraftReply: () => void;
  onCreateTask: () => void;
  onLinkAccount: () => void;
  onSnooze: (until: string) => void;
  onArchive: () => void;
  isPending?: boolean;
}

const SNOOZE_OPTIONS = [
  { label: 'Tomorrow', hours: 24 },
  { label: 'Next week', hours: 168 },
  { label: '3 days', hours: 72 },
];

export function InboxQuickActions({ emailId, onDraftReply, onCreateTask, onLinkAccount, onSnooze, onArchive, isPending }: Props) {
  const [showSnooze, setShowSnooze] = useState(false);

  return (
    <div className="flex items-center gap-1.5 p-3 border-t border-[var(--border)] bg-[var(--surface)]">
      <button onClick={onDraftReply} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md bg-brand text-brand-on hover:brightness-110 transition-colors" disabled={isPending}>
        <Reply className="w-3.5 h-3.5" />Draft Reply
      </button>
      <button onClick={onCreateTask} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] text-sub hover:bg-[var(--hover)] transition-colors" disabled={isPending}>
        <ListTodo className="w-3.5 h-3.5" />Task
      </button>
      <button onClick={onLinkAccount} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] text-sub hover:bg-[var(--hover)] transition-colors" disabled={isPending}>
        <Link className="w-3.5 h-3.5" />Link
      </button>
      <div className="relative">
        <button onClick={() => setShowSnooze(!showSnooze)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] text-sub hover:bg-[var(--hover)] transition-colors" disabled={isPending}>
          <Clock className="w-3.5 h-3.5" />Snooze
        </button>
        {showSnooze && (
          <div className="absolute bottom-full left-0 mb-1 bg-[var(--elevated)] border border-[var(--border)] rounded-md shadow-lg p-1 z-10">
            {SNOOZE_OPTIONS.map(opt => (
              <button key={opt.label} onClick={() => { onSnooze(new Date(Date.now() + opt.hours * 3600000).toISOString()); setShowSnooze(false); }}
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--hover)] rounded-sm transition-colors whitespace-nowrap">
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onArchive} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] text-sub hover:bg-[var(--hover)] transition-colors ml-auto" disabled={isPending}>
        <Archive className="w-3.5 h-3.5" />
      </button>
      {isPending && <Spinner className="w-3.5 h-3.5" />}
    </div>
  );
}
