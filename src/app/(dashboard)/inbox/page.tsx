'use client';
import { useStore } from '@/lib/store';
import { useInboxQuery } from '@/lib/queries/inbox';
import { Badge, ConfBadge, AgentTag, EmptyState, Skeleton, SkeletonCard, SkeletonText, ErrorState } from '@/components/ui';
import { fR, clsLabel, cn, confNum } from '@/lib/utils';
import type { Email } from '@/lib/types';

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
  const { data: resp, isLoading, isError, refetch } = useInboxQuery();

  if (isLoading) return <InboxSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const emails: Email[] = resp?.data ?? [];
  const unread = resp?.meta?.unreadCount ?? 0;

  const active = emails; // API already filters to non-archived

  function viewEmail(id: string) {
    const e = emails.find((x: any) => x.id === id);
    if (!e) return;
    openDrawer({
      title: e.subj,
      subtitle: `${e.fromName} · ${fR(e.dt)}`,
      body: (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn('text-[8px] font-semibold tracking-wide uppercase px-[5px] py-[1px] rounded-sm', CLS_STYLE[e.cls] || CLS_STYLE.auto_reply)}>{clsLabel[e.cls] || e.cls}</span>
            <ConfBadge value={confNum(e.clsConf)} />
            <AgentTag name={e.agent} />
            {e.linked && e.acc && <Badge variant="ok" className="!text-[9px]">{e.acc}</Badge>}
          </div>
          <div className="rounded-lg bg-[var(--elevated)] border border-[var(--border)] p-3">
            <div className="text-[10.5px] text-muted mb-1.5"><strong>From:</strong> {e.from}</div>
            <div className="text-[12px] text-sub leading-relaxed">{e.prev}</div>
          </div>
          {e.cls === 'positive_reply' && (
            <div className="ai-box">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">Deal Signal Detected</div>
              <p className="text-[12px] text-sub">Positive reply detected. Consider advancing the deal stage or creating a follow-up task.</p>
            </div>
          )}
          {e.cls === 'question' && (
            <div className="ai-box">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">Follow-up Needed</div>
              <p className="text-[12px] text-sub">Technical question detected. Consider creating a task to respond with documentation.</p>
            </div>
          )}
          {e.cls === 'new_domain' && e.domain && (
            <div className="ai-box">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-brand mb-1">New Domain Detected</div>
              <p className="text-[12px] text-sub">{e.domain} does not match any existing account.</p>
            </div>
          )}
          <div className="text-[9px] font-semibold tracking-widest uppercase text-muted mt-1">Quick Actions</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button className="px-2.5 py-1.5 text-[11.5px] font-medium bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors">Create Task</button>
            <button className="px-2.5 py-1.5 text-[11.5px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Archive</button>
            {e.accId && <button className="px-2.5 py-1.5 text-[11.5px] text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors col-span-2" onClick={() => { closeDrawer(); window.location.href = `/accounts/${e.accId}`; }}>View Account</button>}
          </div>
        </div>
      ),
      footer: (
        <>
          <button className="px-3.5 py-1.5 text-sm text-sub bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--hover)] transition-colors" onClick={closeDrawer}>Close</button>
          {e.accId && <button className="px-3.5 py-1.5 text-sm font-medium bg-brand text-[#09090b] rounded-md hover:brightness-110 transition-colors" onClick={closeDrawer}>Draft Reply</button>}
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
        ) : active.map((e: any) => (
          <div key={e.id} className="flex gap-2.5 items-start px-4 py-2.5 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors cursor-pointer" onClick={() => viewEmail(e.id)}>
            <div className={cn('w-[5px] h-[5px] rounded-full flex-shrink-0 mt-[7px]', e.unread ? 'bg-info' : 'bg-transparent')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-px">
                <span className={cn('text-[12.5px]', e.unread ? 'font-semibold' : 'font-normal')}>{e.subj}</span>
                <span className="text-[10px] text-muted flex-shrink-0 ml-2">{fR(e.dt)}</span>
              </div>
              <div className="text-[10.5px] text-muted mb-0.5">{e.fromName} · {e.from}</div>
              <div className="text-[11.5px] text-sub truncate">{e.prev}</div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className={cn('text-[8px] font-semibold tracking-wide uppercase px-[5px] py-[1px] rounded-sm', CLS_STYLE[e.cls] || CLS_STYLE.auto_reply)}>{clsLabel[e.cls] || e.cls}</span>
                <ConfBadge value={confNum(e.clsConf)} />
                <AgentTag name={e.agent} className="!text-[8px]" />
                {e.linked && e.acc && <Badge variant="ok" className="!text-[8.5px]">Linked: {e.acc}</Badge>}
                {e.domain && !e.linked && <Badge variant="warn" className="!text-[8.5px]">New: {e.domain}</Badge>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
