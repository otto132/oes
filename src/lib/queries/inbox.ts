import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useOptimisticMutation, removeById, updateById } from './helpers';
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
  return useOptimisticMutation<unknown, string>({
    mutationKey: ['inbox', 'read'],
    mutationFn: (id) => api.inbox.markRead(id),
    queryKey: inboxKeys.all,
    updater: updateById((item) => ({ ...item, read: true })),
  });
}

export function useArchiveEmail() {
  return useOptimisticMutation<unknown, string>({
    mutationKey: ['inbox', 'archive'],
    mutationFn: (id) => api.inbox.archive(id),
    queryKey: inboxKeys.all,
    updater: removeById(),
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
  return useOptimisticMutation<unknown, string>({
    mutationKey: ['inbox', 'createAccount'],
    mutationFn: (id) => api.inbox.createAccount(id),
    queryKey: inboxKeys.all,
    updater: updateById((item) => ({ ...item, processing: true })),
    invalidateKeys: [accountKeys.all],
  });
}
