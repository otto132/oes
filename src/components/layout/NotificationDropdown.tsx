'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, InboxIcon, ClipboardCheck, Clock, AlertCircle, AtSign,
} from 'lucide-react';
import {
  useNotificationsQuery,
  useMarkReadMutation,
  useMarkAllReadMutation,
} from '@/lib/queries/notifications';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
import { formatRelativeTime } from '@/lib/adapters';
import { Avatar } from '@/components/ui';

// ── Filter Definitions ──────────────────────────────
interface FilterDef {
  label: string;
  readStatus?: string;
  type?: string;
  markAllTypes?: string[];
}

const FILTERS: FilterDef[] = [
  { label: 'All' },
  { label: 'Unread', readStatus: 'unread' },
  { label: 'Queue', type: 'QUEUE_ITEM', markAllTypes: ['QUEUE_ITEM'] },
  {
    label: 'Tasks',
    type: 'TASK_ASSIGNED,TASK_DUE,TASK_OVERDUE',
    markAllTypes: ['TASK_ASSIGNED', 'TASK_DUE', 'TASK_OVERDUE'],
  },
  { label: 'Mentions', type: 'MENTION', markAllTypes: ['MENTION'] },
];

// ── Type Icons ───────────────────────────────────────
function TypeIcon({ type }: { type: string }) {
  const cls = 'w-3.5 h-3.5 text-sub';
  switch (type) {
    case 'QUEUE_ITEM':
      return <InboxIcon className={cls} />;
    case 'TASK_ASSIGNED':
      return <ClipboardCheck className={cls} />;
    case 'TASK_DUE':
      return <Clock className={cls} />;
    case 'TASK_OVERDUE':
      return <AlertCircle className={cls} />;
    case 'MENTION':
      return <AtSign className={cls} />;
    default:
      return <Bell className={cls} />;
  }
}

function getNotificationUrl(entityType: string | null): string {
  switch (entityType) {
    case 'QueueItem':
      return '/queue';
    case 'Task':
    case 'TaskComment':
      return '/tasks';
    default:
      return '/';
  }
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState(0);
  const [loadedPages, setLoadedPages] = useState<any[][]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const filter = FILTERS[activeFilter];

  const { data: badges } = useBadgeCounts();
  const unreadCount = badges?.notifications ?? 0;

  const { data, isLoading } = useNotificationsQuery(open, {
    readStatus: filter.readStatus,
    type: filter.type,
  });
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();

  // Reset pagination when filter changes or dropdown opens
  useEffect(() => {
    setLoadedPages([]);
    setNextCursor(null);
  }, [activeFilter, open]);

  // When first page loads, capture cursor
  useEffect(() => {
    if (data) {
      setNextCursor(data.nextCursor ?? null);
    }
  }, [data]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleNotificationClick(n: any) {
    if (!n.readAt) markRead.mutate([n.id]);
    setOpen(false);
    router.push(getNotificationUrl(n.entityType));
  }

  function handleMarkAllRead() {
    markAllRead.mutate(filter.markAllTypes);
  }

  async function handleLoadMore() {
    if (!nextCursor) return;
    try {
      const { api } = await import('@/lib/api-client');
      const result = await api.notifications.list({
        cursor: nextCursor,
        readStatus: filter.readStatus,
        type: filter.type,
      });
      setLoadedPages((prev) => [...prev, result.notifications]);
      setNextCursor(result.nextCursor ?? null);
    } catch {
      // Silently fail — user can retry
    }
  }

  const firstPage = data?.notifications ?? [];
  const allNotifications = [...firstPage, ...loadedPages.flat()];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-sub hover:text-main hover:bg-[var(--surface)] transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full bg-brand" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[380px] max-h-[520px] rounded-lg border border-border bg-elevated shadow-lg overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-base font-medium text-main">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-brand hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border overflow-x-auto">
            {FILTERS.map((f, i) => (
              <button
                key={f.label}
                onClick={() => setActiveFilter(i)}
                className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
                  i === activeFilter
                    ? 'bg-brand text-brand-on font-medium'
                    : 'text-sub hover:bg-[var(--surface)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[calc(100vh-200px)] md:max-h-[420px]">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-sub">Loading...</div>
            ) : allNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-sub">No notifications</div>
            ) : (
              <>
                {allNotifications.map((n: any) => (
                  <button
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--surface)] transition-colors border-b border-border last:border-b-0"
                  >
                    {/* Unread dot */}
                    <div className="w-2 pt-1.5 shrink-0">
                      {!n.readAt && (
                        <span className="block w-2 h-2 rounded-full bg-brand" />
                      )}
                    </div>

                    {/* Actor avatar + type icon */}
                    <div className="relative shrink-0">
                      {n.actor ? (
                        <Avatar
                          initials={n.actor.initials}
                          color={n.actor.color}
                          size="xs"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-md bg-[var(--surface)] flex items-center justify-center">
                          <Bell className="w-3 h-3 text-sub" />
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-elevated flex items-center justify-center">
                        <TypeIcon type={n.type} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-main truncate">
                        {n.title}
                      </p>
                      <p className="text-xs text-sub truncate">{n.message}</p>
                    </div>

                    {/* Time */}
                    <span className="text-2xs text-sub shrink-0 pt-0.5">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </button>
                ))}

                {/* Load More */}
                {nextCursor && (
                  <button
                    onClick={handleLoadMore}
                    className="w-full py-2.5 text-xs text-brand hover:underline text-center border-t border-border"
                  >
                    Load more
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
