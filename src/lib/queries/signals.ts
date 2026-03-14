import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { leadKeys } from './leads';

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
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['signals', 'dismiss'],
    mutationFn: (id: string) => api.signals.dismiss(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: signalKeys.all });
      const queries = qc.getQueriesData({ queryKey: signalKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: signalKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((s: any) => s.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: signalKeys.all });
    },
  });
}

export function useConvertSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['signals', 'convert'],
    mutationFn: ({ id, company, type, country }: { id: string; company: string; type?: string; country?: string }) =>
      api.signals.convert(id, company, type, country),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: signalKeys.all });
      const queries = qc.getQueriesData({ queryKey: signalKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: signalKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((s: any) => s.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: signalKeys.all });
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
