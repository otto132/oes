import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';

export const activityKeys = {
  all: ['activities'] as const,
};

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      type?: string;
      summary: string;
      detail?: string;
      accountId: string;
      source?: string;
    }) => api.activities.log(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: accountKeys.detail(data.accountId) });
      const previousDetail = qc.getQueryData(accountKeys.detail(data.accountId));
      const tempActivity = {
        id: `temp-${Date.now()}`,
        type: data.type || 'note',
        summary: data.summary,
        detail: data.detail || '',
        source: data.source || 'user',
        date: new Date().toISOString(),
      };
      qc.setQueryData(accountKeys.detail(data.accountId), (old: any) => {
        if (!old?.activities) return old;
        return { ...old, activities: [tempActivity, ...old.activities] };
      });
      return { previousDetail, accountId: data.accountId };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail) {
        qc.setQueryData(accountKeys.detail(context.accountId), context.previousDetail);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: activityKeys.all });
      qc.invalidateQueries({ queryKey: accountKeys.detail(vars.accountId) });
      qc.invalidateQueries({ queryKey: oppKeys.all });
    },
  });
}
