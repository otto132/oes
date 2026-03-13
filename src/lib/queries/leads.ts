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
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const queries = qc.getQueriesData({ queryKey: leadKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((lead: any) =>
            lead.id === id ? { ...lead, stage: getNextStage(lead.stage) } : lead
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

export function useDisqualifyLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.leads.disqualify(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const queries = qc.getQueriesData({ queryKey: leadKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((lead: any) =>
            lead.id === id ? { ...lead, stage: 'Disqualified' } : lead
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; accountName?: string; accountType?: string; oppName?: string; oppAmount?: number; oppStage?: string }) =>
      api.leads.convert(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: leadKeys.all });
      const queries = qc.getQueriesData({ queryKey: leadKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: leadKeys.all }, (old: any) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((lead: any) => lead.id !== id) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leadKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}

const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Converted'];
function getNextStage(current: string): string {
  const idx = LEAD_STAGES.indexOf(current);
  return idx >= 0 && idx < LEAD_STAGES.length - 1 ? LEAD_STAGES[idx + 1] : current;
}
