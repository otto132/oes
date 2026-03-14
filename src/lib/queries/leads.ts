import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';
import { useOptimisticMutation, removeById, updateById, prependItem, replaceTempId } from './helpers';

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
  return useOptimisticMutation<unknown, { id: string }>({
    mutationKey: ['leads', 'advance'],
    mutationFn: ({ id }) => api.leads.advance(id),
    queryKey: leadKeys.all,
    updater: updateById((lead) => ({ ...lead, stage: getNextStage(lead.stage) })),
  });
}

export function useDisqualifyLead() {
  return useOptimisticMutation<unknown, { id: string }>({
    mutationKey: ['leads', 'disqualify'],
    mutationFn: ({ id }) => api.leads.disqualify(id),
    queryKey: leadKeys.all,
    updater: updateById((lead) => ({ ...lead, stage: 'Disqualified' })),
  });
}

const removeLeadById = removeById();

export function useConvertLead() {
  return useOptimisticMutation<unknown, { id: string; accountName?: string; accountType?: string; oppName?: string; oppAmount?: number; oppStage?: string }>({
    mutationKey: ['leads', 'convert'],
    mutationFn: ({ id, ...data }) => api.leads.convert(id, data),
    queryKey: leadKeys.all,
    updater: (old, vars) => removeLeadById(old, vars.id),
    invalidateKeys: [accountKeys.all, oppKeys.all],
  });
}

export function useCreateLead() {
  return useOptimisticMutation<{ data: any }, { company: string; type?: string; country?: string; pain?: string }>({
    mutationKey: ['leads', 'create'],
    mutationFn: (data) => api.leads.create(data),
    queryKey: leadKeys.all,
    updater: prependItem((vars) => ({
      id: `temp-${Date.now()}`,
      company: vars.company,
      type: vars.type || '',
      country: vars.country || '',
      stage: 'New',
      pain: vars.pain || '',
    })),
    onSuccessCallback: replaceTempId(leadKeys.all),
  });
}

const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Converted'];
function getNextStage(current: string): string {
  const idx = LEAD_STAGES.indexOf(current);
  return idx >= 0 && idx < LEAD_STAGES.length - 1 ? LEAD_STAGES[idx + 1] : current;
}
