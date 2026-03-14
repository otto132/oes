'use client';
import { useStore } from '@/lib/store';
import { useInboxQuery, useCreateTaskFromEmail, useCreateAccountFromEmail, useMarkEmailRead, useArchiveEmail } from '@/lib/queries/inbox';
import { Badge, ConfBadge, AgentTag, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
import { fR, clsLabel, cn } from '@/lib/utils';
import type { Email } from '@/lib/types';
import { usePendingMutations, useFailedMutations } from '@/hooks/use-mutation-state';
import { RotateCw } from 'lucide-react';

const CLS_STYLE: Record<string, string> = {
  positive_reply: 'text-brand bg-brand-dim',
  question: 'text-info bg-info/[.10]',
  objection: 'text-danger bg-danger/[.10]',
  meeting_request: 'text-purple bg-purple/[.10]',
  new_domain: 'text-warn bg-warn/[.10]',
  auto_reply: 'text-muted bg-[var(--surface)]',
};

function InboxSkeleton() {
  return (
    <div className="page-enter space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} className="flex items-start gap-3">
          <Skeleton className="h-2 w-2 rounded-full mt-1.5 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <SkeletonText className="w-1/4" />
              <Skeleton className="h-3 w-16 rounded-full" />
            </div>
            <SkeletonText className="w-3/4" />
            <SkeletonText className="w-full h-2" />
          </div>
          <Skeleton className="h-3 w-10 shrink-0" />
        </SkeletonCard>
      ))}
    </div>
  );
}

export default function InboxPage() {
  const { openDrawer, closeDrawer } = useStore();
  const addToast = useStore(s => s.addToast);
  const { data: resp, isLoading, isError, refetch } = useInboxQuery();
  const createTaskFromEmail = useCreateTaskFromEmail();
  const createAccountFromEmail = useCreateAccountFromEmail();
  const markRead = useMarkEmailRead();
  const archiveEmail = useArchiveEmail();
  const pendingIds = usePendingMutations(['inbox']);
  const failedMutations = useFailedMutations(['inbox']);

  if (isLoading) return <InboxSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const emails: Email[] = resp?.data ?? [];
  const unread = resp?.meta?.unreadCount ?? 0;

  const active = emails; // API already filters to non-archived

  function viewEmail(id: string) {
    const e = emails.find((x: any) => x.id === id);
    if (!e) return;
    openDrawer({
      title: e.subject,
      subtitle: `${e.fromName} · ${fR(e.receivedAt)}`,
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('text-[8px] font-semibold tracking-wide uppercase px-[5px] py-[1px] rounded-sm', CLS_STYLE[e.classification] || CLS_STYLE.auto_reply)}>{clsLabel[e.classification] || e.classification}</span>
            <ConfBadge value={e.classificationConf} />
            <AgentTag name={e.classifierAgent} />
            {e.isLinked && e.accountName && <Badge variant="ok" className="!text-[9px]">{e.accountName}</Badge>}
          </div>
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3">
            <div className="text-[10.5px] text-muted mb-1.5"><strong>From:</strong> {e.fromEmail}</div>
            <div className="text-[12px] text-sub leading-relaxed">{e.preview}</div>
          </div>
          {e.classification === 'positive_reply' && (
            <div className="ai-box">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">Deal Signal Detected</div>
              <p className="text-[12px] text-sub">Positive reply detected. Consider advancing the deal stage or creating a follow-up task.</p>
            </div>
          )}
          {e.classification === 'question' && (
            <div className="ai-box">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">Follow-up Needed</div>
              <p className="text-[12px] text-sub">Technical question detected. Consider creating a task to respond with documentation.</p>
            </div>
          )}
          {e.classification === 'new_domain' && e.domain && (
            <div className="ai-box">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">New Domain Detected</div>
              <p className="text-[12px] text-sub">{e.domain} does not match any existing account.</p>
              <button
                className="mt-2 px-2.5 py-1.5 text-[11px] font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors disabled:opacity-50"
                disabled={createAccountFromEmail.isPending}
                onClick={(ev) => {
                  ev.stopPropagation();
                  createAccountFromEmail.mutate(e.id, {
                    onSuccess: () => {
                      addToast({ type: 'success', message: `Account created from ${e.domain}`, action: { label: 'View Accounts →', href: '/accounts' } });
                      closeDrawer();
                    },
                    onError: () => addToast({ type: 'error', message: 'Failed to create account' }),
                  });
                }}
              >
                Create Account
              </button>
            </div>
          )}
          <div className="text-[9px] font-semibold tracking-widest uppercase text-muted mt-1">Quick Actions</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className="px-2.5 py-1.5 text-[11.5px] font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              disabled={createTaskFromEmail.isPending}
              onClick={(ev) => {
                ev.stopPropagation();
                createTaskFromEmail.mutate(e.id, {
                  onSuccess: () => {
                    addToast({ type: 'success', message: `Task created from: ${e.subject}`, action: { label: 'View Tasks →', href: '/tasks' } });
                    markRead.mutate(e.id);
                  },
                  onError: () => addToast({ type: 'error', message: 'Failed to create task' }),
                });
              }}
            >Create Task</button>
            <button
              className="px-2.5 py-1.5 text-[11.5px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
              disabled={archiveEmail.isPending}
              onClick={(ev) => {
                ev.stopPropagation();
                archiveEmail.mutate(e.id, {
                  onSuccess: () => {
                    addToast({ type: 'success', message: 'Email archived' });
                    closeDrawer();
                  },
                  onError: () => addToast({ type: 'error', message: 'Failed to archive email' }),
                });
              }}
            >Archive</button>
            {e.accountId && <button className="px-2.5 py-1.5 text-[11.5px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors col-span-2" onClick={() => { closeDrawer(); window.location.href = `/accounts/${e.accountId}`; }}>View Account</button>}
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Close</button>
        </>
      ),
    });
  }

  return (
    <div className="max-w-[900px] page-enter">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Inbox</h1>
          <p className="text-[12.5px] text-sub mt-0.5">{unread} unread · {active.length} total · AI-classified</p>
        </div>
        <Badge variant="ok">Outlook Connected</Badge>
      </div>

      <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] overflow-hidden">
        {active.length === 0 ? (
          <EmptyState icon="📬" title="Inbox clear" description="All emails have been archived or triaged." />
        ) : active.map((e: any) => {
          const isPending = pendingIds.has(e.id);
          const failedInfo = failedMutations.get(e.id);
          return (
          <div key={e.id} className={cn('flex gap-2.5 items-start px-4 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors cursor-pointer relative', isPending && 'opacity-60 animate-pulse', failedInfo && 'border-l-2 border-l-red-500')} onClick={() => viewEmail(e.id)}>
            {failedInfo && (
              <button
                onClick={ev => { ev.stopPropagation(); markRead.mutate(failedInfo.variables as any); }}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                title={failedInfo.error}
              >
                <RotateCw className="w-2.5 h-2.5" />
              </button>
            )}
            <div className={cn('w-[5px] h-[5px] rounded-full flex-shrink-0 mt-[7px]', e.isUnread ? 'bg-info' : 'bg-transparent')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-px">
                <span className={cn('text-[12.5px]', e.isUnread ? 'font-semibold' : 'font-normal')}>{e.subject}</span>
                <span className="text-[10px] text-muted flex-shrink-0 ml-2">{fR(e.receivedAt)}</span>
              </div>
              <div className="text-[10.5px] text-muted mb-0.5">{e.fromName} · {e.fromEmail}</div>
              <div className="text-[11.5px] text-sub truncate">{e.preview}</div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className={cn('text-[8px] font-semibold tracking-wide uppercase px-[5px] py-[1px] rounded-sm', CLS_STYLE[e.classification] || CLS_STYLE.auto_reply)}>{clsLabel[e.classification] || e.classification}</span>
                <ConfBadge value={e.classificationConf} />
                <AgentTag name={e.classifierAgent} className="!text-[8px]" />
                {e.isLinked && e.accountName && <Badge variant="ok" className="!text-[8.5px]">Linked: {e.accountName}</Badge>}
                {e.domain && !e.isLinked && <Badge variant="warn" className="!text-[8.5px]">New: {e.domain}</Badge>}
              </div>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}
