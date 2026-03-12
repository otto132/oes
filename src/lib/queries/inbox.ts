import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const inboxKeys = {
  all: ['inbox'] as const,
  list: () => ['inbox', 'list'] as const,
};

export function useInboxQuery() {
  return useQuery({
    queryKey: inboxKeys.list(),
    queryFn: () => api.inbox.list(),
  });
}

export function useMarkEmailRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useArchiveEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useCreateTaskFromEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.createTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useCreateAccountFromEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inbox.createAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}
