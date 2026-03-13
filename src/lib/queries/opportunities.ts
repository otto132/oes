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

export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.opportunities.move(id, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: oppKeys.all }),
  });
}

export function useCloseWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; winNotes?: string; competitorBeaten?: string }) =>
      api.opportunities.closeWon(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: oppKeys.all }),
  });
}

export function useCloseLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; lossReason: string; lossCompetitor?: string; lossNotes?: string }) =>
      api.opportunities.closeLost(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: oppKeys.all }),
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      accountId: string;
      stage?: string;
      amount?: number;
      closeDate?: string;
    }) => api.opportunities.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
