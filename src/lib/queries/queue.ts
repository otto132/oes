import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

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

export function useApproveQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['queue', 'approve'],
    mutationFn: ({ id, editedPayload }: { id: string; editedPayload?: Record<string, unknown> }) =>
      api.queue.approve(id, editedPayload),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: queueKeys.all });
      const queries = qc.getQueriesData<QueueResponse>({ queryKey: queueKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData<QueueResponse>({ queryKey: queueKeys.all }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter(item => item.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}

export function useRejectQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['queue', 'reject'],
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.queue.reject(id, reason),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: queueKeys.all });
      const queries = qc.getQueriesData<QueueResponse>({ queryKey: queueKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData<QueueResponse>({ queryKey: queueKeys.all }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter(item => item.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
}
