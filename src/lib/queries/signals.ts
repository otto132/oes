import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { leadKeys } from './leads';
import { useOptimisticMutation, removeById } from './helpers';

export const signalKeys = {
  all: ['signals'] as const,
  list: (type?: string) => ['signals', type] as const,
};

export function useSignalsQuery(type?: string) {
  return useQuery({
    queryKey: signalKeys.list(type),
    queryFn: () => api.signals.list(type),
    placeholderData: keepPreviousData,
  });
}

export function useDismissSignal() {
  return useOptimisticMutation<unknown, string>({
    mutationKey: ['signals', 'dismiss'],
    mutationFn: (id) => api.signals.dismiss(id),
    queryKey: signalKeys.all,
    updater: removeById(),
  });
}

const removeSignalById = removeById();

export function useConvertSignal() {
  return useOptimisticMutation<unknown, { id: string; company: string; type?: string; country?: string }>({
    mutationKey: ['signals', 'convert'],
    mutationFn: ({ id, company, type, country }) => api.signals.convert(id, company, type, country),
    queryKey: signalKeys.all,
    updater: (old, vars) => removeSignalById(old, vars.id),
    invalidateKeys: [leadKeys.all],
  });
}
