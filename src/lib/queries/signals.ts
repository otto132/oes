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
    mutationFn: (id: string) => api.signals.dismiss(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: signalKeys.all }),
  });
}

export function useConvertSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, company, type, country }: { id: string; company: string; type?: string; country?: string }) =>
      api.signals.convert(id, company, type, country),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: signalKeys.all });
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
