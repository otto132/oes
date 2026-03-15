'use client';
import { useState, useEffect } from 'react';
import { useInboxThreadsQuery, useSnoozeEmail, useMarkEmailRead, useArchiveEmail, useCreateTaskFromEmail } from '@/lib/queries/inbox';
import { useStore } from '@/lib/store';
import { ThreadList } from '@/components/inbox/ThreadList';
import { ThreadView } from '@/components/inbox/ThreadView';
import { InboxContext } from '@/components/inbox/InboxContext';
import { InboxQuickActions } from '@/components/inbox/InboxQuickActions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState, Skeleton, SkeletonCard, SkeletonText } from '@/components/ui';
import type { EmailThread } from '@/lib/types';

function InboxSkeleton() {
  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="w-full md:w-80 md:border-r border-[var(--border)] p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i}><SkeletonText /><SkeletonText className="w-2/3" /></SkeletonCard>
        ))}
      </div>
      <div className="hidden md:block flex-1 p-4"><SkeletonCard className="h-40" /></div>
      <div className="hidden lg:block w-72 border-l border-[var(--border)] p-3"><Skeleton className="h-24" /></div>
    </div>
  );
}

export default function InboxPage() {
  const [filter, setFilter] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const addToast = useStore(s => s.addToast);

  const { data: resp, isLoading, isError, refetch } = useInboxThreadsQuery(filter || undefined);
  const snoozeEmail = useSnoozeEmail();
  const markRead = useMarkEmailRead();
  const archiveEmail = useArchiveEmail();
  const createTask = useCreateTaskFromEmail();

  const threads: EmailThread[] = resp?.data ?? [];
  const selectedThread = threads.find(t => t.threadId === selectedThreadId) ?? null;

  // Auto-select first thread
  useEffect(() => {
    if (threads.length > 0 && !selectedThreadId) {
      setSelectedThreadId(threads[0].threadId);
    }
  }, [threads, selectedThreadId]);

  // Mark as read when selecting
  useEffect(() => {
    if (selectedThread?.isUnread && selectedThread.latestEmail) {
      markRead.mutate(selectedThread.latestEmail.id);
    }
  }, [selectedThread?.threadId]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
      const idx = threads.findIndex(t => t.threadId === selectedThreadId);

      switch (e.key) {
        case 'j':
          if (idx < threads.length - 1) setSelectedThreadId(threads[idx + 1].threadId);
          break;
        case 'k':
          if (idx > 0) setSelectedThreadId(threads[idx - 1].threadId);
          break;
        case 'Escape':
          setSelectedThreadId(null);
          break;
        case 'e':
          if (selectedThread) {
            setConfirmArchiveId(selectedThread.latestEmail.id);
          }
          break;
        case 't':
          if (selectedThread) {
            createTask.mutate(selectedThread.latestEmail.id, {
              onSuccess: () => addToast({ type: 'success', message: 'Task created' }),
            });
          }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [threads, selectedThreadId, selectedThread]);

  if (isLoading) return <InboxSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  // Mobile: show thread list or thread view (not both)
  const showMobileThread = selectedThreadId !== null;

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[var(--page)]">
      {/* Left panel — Thread list */}
      <div className={`${showMobileThread ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-[var(--border)] flex-col bg-[var(--elevated)]`}>
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
          <p className="text-xs text-muted">{threads.length} conversation{threads.length !== 1 ? 's' : ''}</p>
        </div>
        <ThreadList
          threads={threads}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>

      {/* Center panel — Thread view + quick actions */}
      <div className={`${showMobileThread ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {/* Mobile back button */}
        <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--elevated)]">
          <button
            onClick={() => setSelectedThreadId(null)}
            className="px-2 py-1 text-xs font-medium rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--sub)] hover:bg-[var(--hover)] transition-colors"
          >
            ← Back
          </button>
          {selectedThread && (
            <span className="text-xs text-[var(--muted)] truncate">{selectedThread.latestEmail.subject}</span>
          )}
        </div>
        <ThreadView thread={selectedThread} />
        {selectedThread && (
          <InboxQuickActions
            emailId={selectedThread.latestEmail.id}
            onDraftReply={() => addToast({ type: 'info', message: 'Draft reply routed to approval queue' })}
            onCreateTask={() => {
              createTask.mutate(selectedThread.latestEmail.id, {
                onSuccess: () => addToast({ type: 'success', message: 'Task created' }),
                onError: () => addToast({ type: 'error', message: 'Failed to create task' }),
              });
            }}
            onLinkAccount={() => addToast({ type: 'info', message: 'Account linking coming soon' })}
            onSnooze={(until) => {
              snoozeEmail.mutate({ id: selectedThread.latestEmail.id, snoozedUntil: until }, {
                onSuccess: () => addToast({ type: 'success', message: 'Snoozed' }),
              });
            }}
            onArchive={() => setConfirmArchiveId(selectedThread.latestEmail.id)}
            isPending={archiveEmail.isPending || createTask.isPending || snoozeEmail.isPending}
          />
        )}
      </div>

      {/* Right panel — Context sidebar (hidden on small screens) */}
      <div className="hidden lg:block w-72 border-l border-[var(--border)] bg-[var(--elevated)]">
        <InboxContext
          accountId={selectedThread?.accountId}
          contactEmail={selectedThread?.latestEmail.fromEmail}
        />
      </div>
      <ConfirmDialog
        open={!!confirmArchiveId}
        title="Archive Conversation"
        message="Are you sure you want to archive this conversation? You can find it again later in the archived folder."
        confirmLabel="Archive"
        variant="default"
        onConfirm={() => {
          if (confirmArchiveId) {
            archiveEmail.mutate(confirmArchiveId, {
              onSuccess: () => addToast({ type: 'success', message: 'Archived' }),
            });
          }
          setConfirmArchiveId(null);
        }}
        onCancel={() => setConfirmArchiveId(null)}
      />
    </div>
  );
}
