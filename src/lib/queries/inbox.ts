import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { taskKeys } from './tasks';

export const inboxKeys = {
  all: ['inbox'] as const,
  list: () => ['inbox', 'list'] as const,
};

export function useInboxQuery() {
  return useQuery({
    queryKey: inboxKeys.list(),
    queryFn: () => api.inbox.list(),
    placeholderData: keepPreviousData,
  });
}

export function useMarkEmailRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['inbox', 'read'],
    mutationFn: (id: string) => api.inbox.markRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all });
      const queries = qc.getQueriesData({ queryKey: inboxKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: inboxKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((email: any) =>
            email.id === id ? { ...email, read: true } : email
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useArchiveEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['inbox', 'archive'],
    mutationFn: (id: string) => api.inbox.archive(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all });
      const queries = qc.getQueriesData({ queryKey: inboxKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: inboxKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((email: any) => email.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
    },
  });
}

export function useCreateTaskFromEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['inbox', 'createTask'],
    mutationFn: (id: string) => api.inbox.createTask(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCreateAccountFromEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['inbox', 'createAccount'],
    mutationFn: (id: string) => api.inbox.createAccount(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: inboxKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}
