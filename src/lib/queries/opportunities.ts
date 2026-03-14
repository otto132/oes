import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useOptimisticMutation, updateById, prependItem, replaceTempId } from './helpers';

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
  return useOptimisticMutation<{ data: any }, {
    name: string;
    accountId: string;
    stage?: string;
    amount?: number;
    closeDate?: string;
  }>({
    mutationKey: ['opportunities', 'create'],
    mutationFn: (data) => api.opportunities.create(data),
    queryKey: oppKeys.all,
    updater: prependItem((vars) => ({
      id: `temp-${Date.now()}`,
      name: vars.name,
      accountId: vars.accountId,
      stage: vars.stage ?? 'Prospecting',
      amount: vars.amount,
      closeDate: vars.closeDate,
    })),
    onSuccessCallback: replaceTempId(oppKeys.all),
  });
}

export function useMoveStage() {
  return useOptimisticMutation<unknown, { id: string; stage: string }>({
    mutationKey: ['opportunities', 'move'],
    mutationFn: ({ id, stage }) => api.opportunities.move(id, stage),
    queryKey: oppKeys.all,
    updater: updateById((opp, { stage }) => ({ ...opp, stage })),
    detailQueryKey: (vars) => oppKeys.detail(vars.id),
    detailUpdater: (old, { stage }) => ({ ...old, stage }),
  });
}

export function useCloseWon() {
  return useOptimisticMutation<unknown, { id: string; winNotes?: string; competitorBeaten?: string; keyStakeholders?: string; lessonsLearned?: string }>({
    mutationKey: ['opportunities', 'closeWon'],
    mutationFn: ({ id, ...data }) => api.opportunities.closeWon(id, data),
    queryKey: oppKeys.all,
    updater: updateById((opp) => ({ ...opp, stage: 'ClosedWon' })),
    detailQueryKey: (vars) => oppKeys.detail(vars.id),
    detailUpdater: (old) => ({ ...old, stage: 'ClosedWon' }),
  });
}

export function useUpdateOpportunity() {
  return useOptimisticMutation<unknown, { id: string; data: Record<string, unknown> }>({
    mutationKey: ['opportunities', 'update'],
    mutationFn: ({ id, data }) => api.opportunities.update(id, data),
    queryKey: oppKeys.all,
    updater: updateById((opp, { data }) => ({ ...opp, ...data })),
    detailQueryKey: (vars) => oppKeys.detail(vars.id),
    detailUpdater: (old, { data }) => ({ ...old, ...data }),
  });
}

export function useCloseLost() {
  return useOptimisticMutation<unknown, { id: string; lossReason: string; lossCompetitor?: string; lossNotes?: string; lessonsLearned?: string }>({
    mutationKey: ['opportunities', 'closeLost'],
    mutationFn: ({ id, ...data }) => api.opportunities.closeLost(id, data),
    queryKey: oppKeys.all,
    updater: updateById((opp) => ({ ...opp, stage: 'ClosedLost' })),
    detailQueryKey: (vars) => oppKeys.detail(vars.id),
    detailUpdater: (old) => ({ ...old, stage: 'ClosedLost' }),
  });
}
