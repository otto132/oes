import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useOptimisticMutation, removeById } from './helpers';

// Re-export the response type from api-client for consumers
type QueueResponse = Awaited<ReturnType<typeof api.queue.list>>;

export const queueKeys = {
  all: ['queue'] as const,
  list: (status: string, type?: string) => ['queue', status, type] as const,
};

export function useQueueQuery(status: 'pending' | 'completed', type?: string) {
  return useQuery<QueueResponse>({
    queryKey: queueKeys.list(status, type),
    queryFn: () => api.queue.list(status, type),
    placeholderData: keepPreviousData,
  });
}

const removeQueueItem = removeById();

export function useApproveQueueItem() {
  return useOptimisticMutation<unknown, { id: string; editedPayload?: Record<string, unknown> }>({
    mutationKey: ['queue', 'approve'],
    mutationFn: ({ id, editedPayload }) => api.queue.approve(id, editedPayload),
    queryKey: queueKeys.all,
    updater: (old, vars) => removeQueueItem(old, vars.id),
  });
}

export function useRejectQueueItem() {
  return useOptimisticMutation<unknown, { id: string; reason: string }>({
    mutationKey: ['queue', 'reject'],
    mutationFn: ({ id, reason }) => api.queue.reject(id, reason),
    queryKey: queueKeys.all,
    updater: (old, vars) => removeQueueItem(old, vars.id),
  });
}
