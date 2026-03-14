'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useNotificationsQuery, useMarkReadMutation, useMarkAllReadMutation } from '@/lib/queries/notifications';
import { useBadgeCounts } from '@/lib/queries/badge-counts';
import { formatRelativeTime } from '@/lib/adapters';
import { Avatar } from '@/components/ui';

function getNotificationUrl(entityType: string | null): string {
  switch (entityType) {
    case 'QueueItem': return '/queue';
    case 'Task':
    case 'TaskComment': return '/tasks';
    default: return '/';
  }
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data: badges } = useBadgeCounts();
  const unreadCount = badges?.notifications ?? 0;

  const { data, isLoading } = useNotificationsQuery(open);
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();

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
    if (!n.readAt) {
      markRead.mutate([n.id]);
    }
    setOpen(false);
    router.push(getNotificationUrl(n.entityType));
  }

  function handleMarkAllRead() {
    markAllRead.mutate();
  }

  const notifications = data?.notifications ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-sub hover:text-main hover:bg-[var(--surface)] transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-[6px] h-[6px] rounded-full bg-brand" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[360px] max-h-[440px] rounded-lg border border-border bg-elevated shadow-lg overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-[13px] font-medium text-main">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-brand hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[380px]">
            {isLoading ? (
              <div className="px-4 py-8 text-center text-[12px] text-sub">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-sub">No notifications yet</div>
            ) : (
              notifications.slice(0, 10).map((n: any) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--surface)] transition-colors border-b border-border last:border-b-0"
                >
                  {/* Unread dot */}
                  <div className="w-2 pt-1.5 shrink-0">
                    {!n.readAt && <span className="block w-2 h-2 rounded-full bg-brand" />}
                  </div>

                  {/* Actor avatar */}
                  {n.actor ? (
                    <Avatar initials={n.actor.initials} color={n.actor.color} size="xs" />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-[var(--surface)] flex items-center justify-center shrink-0">
                      <Bell className="w-3 h-3 text-sub" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-main truncate">{n.title}</p>
                    <p className="text-[11px] text-sub truncate">{n.message}</p>
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-sub shrink-0 pt-0.5">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
