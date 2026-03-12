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
    mutationFn: ({ id, editedPayload }: { id: string; editedPayload?: Record<string, unknown> }) =>
      api.queue.approve(id, editedPayload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queueKeys.all }),
  });
}

export function useRejectQueueItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.queue.reject(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: queueKeys.all }),
  });
}
