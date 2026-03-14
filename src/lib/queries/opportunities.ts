import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const oppKeys = {
  all: ['opportunities'] as const,
  list: () => ['opportunities', 'list'] as const,
  detail: (id: string) => ['opportunities', id] as const,
};

export function useOpportunitiesQuery() {
  return useQuery({
    queryKey: oppKeys.list(),
    queryFn: () => api.opportunities.list(),
    placeholderData: keepPreviousData,
  });
}

export function useOpportunityDetail(id: string) {
  return useQuery({
    queryKey: oppKeys.detail(id),
    queryFn: () => api.opportunities.detail(id),
    enabled: !!id,
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opportunities', 'create'],
    mutationFn: (data: {
      name: string;
      accountId: string;
      stage?: string;
      amount?: number;
      closeDate?: string;
    }) => api.opportunities.create(data),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old) return old;
        const tempItem = {
          id: `temp-${Date.now()}`,
          name: vars.name,
          accountId: vars.accountId,
          stage: vars.stage ?? 'Prospecting',
          amount: vars.amount,
          closeDate: vars.closeDate,
        };
        return { ...old, data: [tempItem, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (serverResponse) => {
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((item: any) =>
            item.id?.startsWith('temp-') ? serverResponse.data : item
          ),
        };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}

export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opportunities', 'move'],
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.opportunities.move(id, stage),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      await qc.cancelQueries({ queryKey: oppKeys.detail(id) });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      const previousDetail = qc.getQueryData(oppKeys.detail(id));
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((opp: any) =>
            opp.id === id ? { ...opp, stage } : opp
          ),
        };
      });
      qc.setQueryData(oppKeys.detail(id), (old: any) => {
        if (!old) return old;
        return { ...old, stage };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(oppKeys.detail(context.id), context.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.detail(vars.id) });
    },
  });
}

export function useCloseWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opportunities', 'closeWon'],
    mutationFn: ({ id, ...data }: { id: string; winNotes?: string; competitorBeaten?: string; keyStakeholders?: string; lessonsLearned?: string }) =>
      api.opportunities.closeWon(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      await qc.cancelQueries({ queryKey: oppKeys.detail(id) });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      const previousDetail = qc.getQueryData(oppKeys.detail(id));
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((opp: any) =>
            opp.id === id ? { ...opp, stage: 'ClosedWon' } : opp
          ),
        };
      });
      qc.setQueryData(oppKeys.detail(id), (old: any) => {
        if (!old) return old;
        return { ...old, stage: 'ClosedWon' };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(oppKeys.detail(context.id), context.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.detail(vars.id) });
    },
  });
}

export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opportunities', 'update'],
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.opportunities.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      await qc.cancelQueries({ queryKey: oppKeys.detail(id) });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const previousDetail = qc.getQueryData(oppKeys.detail(id));
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((opp: any) =>
            opp.id === id ? { ...opp, ...data } : opp
          ),
        };
      });
      qc.setQueryData(oppKeys.detail(id), (old: any) => {
        if (!old) return old;
        return { ...old, ...data };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(oppKeys.detail(context.id), context.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.detail(vars.id) });
    },
  });
}

export function useCloseLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opportunities', 'closeLost'],
    mutationFn: ({ id, ...data }: { id: string; lossReason: string; lossCompetitor?: string; lossNotes?: string; lessonsLearned?: string }) =>
      api.opportunities.closeLost(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: oppKeys.all });
      await qc.cancelQueries({ queryKey: oppKeys.detail(id) });
      const queries = qc.getQueriesData({ queryKey: oppKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      const previousDetail = qc.getQueryData(oppKeys.detail(id));
      qc.setQueriesData({ queryKey: oppKeys.all }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((opp: any) =>
            opp.id === id ? { ...opp, stage: 'ClosedLost' } : opp
          ),
        };
      });
      qc.setQueryData(oppKeys.detail(id), (old: any) => {
        if (!old) return old;
        return { ...old, stage: 'ClosedLost' };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(oppKeys.detail(context.id), context.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
      qc.invalidateQueries({ queryKey: oppKeys.detail(vars.id) });
    },
  });
}
