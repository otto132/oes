import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';

export const leadKeys = {
  all: ['leads'] as const,
  list: () => ['leads', 'list'] as const,
};

export function useLeadsQuery() {
  return useQuery({
    queryKey: leadKeys.list(),
    queryFn: () => api.leads.list(),
    placeholderData: keepPreviousData,
  });
}

export function useAdvanceLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.leads.advance(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export function useDisqualifyLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.leads.disqualify(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; accountName?: string; accountType?: string; oppName?: string; oppAmount?: number; oppStage?: string }) =>
      api.leads.convert(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
