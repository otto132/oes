import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { badgeKeys } from '@/lib/queries/badge-counts';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (filters?: { readStatus?: string; type?: string }) =>
    ['notifications', 'list', filters ?? {}] as const,
};

export function useNotificationsQuery(
  enabled = true,
  filters?: { readStatus?: string; type?: string },
) {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => api.notifications.list({ ...filters }),
    enabled,
  });
}

export function useMarkReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['notifications', 'markRead'],
    mutationFn: (ids: string[]) => api.notifications.markRead(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      qc.invalidateQueries({ queryKey: badgeKeys.all });
    },
  });
}

export function useMarkAllReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['notifications', 'markAllRead'],
    mutationFn: (types?: string[]) => api.notifications.markAllRead(types),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      qc.invalidateQueries({ queryKey: badgeKeys.all });
    },
  });
}

export function useNotificationStream() {
  const qc = useQueryClient();
  const errorCountRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startPollingFallback = useCallback(() => {
    qc.setQueryDefaults(badgeKeys.all, { refetchInterval: 30_000 });
  }, [qc]);

  useEffect(() => {
    const es = new EventSource('/api/notifications/stream');
    eventSourceRef.current = es;

    es.addEventListener('notification', (e) => {
      errorCountRef.current = 0;
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      qc.invalidateQueries({ queryKey: badgeKeys.all });
    });

    es.addEventListener('badge', (e) => {
      errorCountRef.current = 0;
      try {
        const data = JSON.parse(e.data);
        qc.setQueryData(badgeKeys.all, data);
      } catch {
        qc.invalidateQueries({ queryKey: badgeKeys.all });
      }
    });

    es.addEventListener('connected', () => {
      errorCountRef.current = 0;
    });

    es.onerror = () => {
      errorCountRef.current += 1;
      if (errorCountRef.current >= 3) {
        es.close();
        startPollingFallback();
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [qc, startPollingFallback]);
}
