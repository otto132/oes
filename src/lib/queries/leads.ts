import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { accountKeys } from './accounts';
import { oppKeys } from './opportunities';
import { useOptimisticMutation, removeById, updateById, prependItem, replaceTempId } from './helpers';

export const leadKeys = {
  all: ['leads'] as const,
  list: () => ['leads', 'list'] as const,
  paused: () => ['leads', 'paused'] as const,
};

export function useLeadsQuery() {
  return useQuery({
    queryKey: leadKeys.list(),
    queryFn: () => api.leads.list(),
    placeholderData: keepPreviousData,
  });
}

export function usePausedLeadsQuery() {
  return useQuery({
    queryKey: leadKeys.paused(),
    queryFn: () => api.leads.list(undefined, undefined, true),
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
  return useOptimisticMutation<unknown, { id: string; reason: string }>({
    mutationKey: ['leads', 'disqualify'],
    mutationFn: ({ id, reason }) => api.leads.disqualify(id, reason),
    queryKey: leadKeys.all,
    updater: updateById((lead) => ({ ...lead, stage: 'Disqualified' })),
  });
}

const removeLeadById = removeById();

export function useConvertLead() {
  return useOptimisticMutation<unknown, {
    id: string;
    accountName: string;
    accountType?: string;
    oppName: string;
    oppAmount?: number;
    closeDate?: string;
  }>({
    mutationKey: ['leads', 'convert'],
    mutationFn: ({ id, ...data }) => api.leads.convert(id, data),
    queryKey: leadKeys.all,
    updater: (old, vars) => removeLeadById(old, vars.id),
    invalidateKeys: [accountKeys.all, oppKeys.all],
  });
}

export function usePauseLead() {
  return useOptimisticMutation<unknown, { id: string; pausedUntil: string }>({
    mutationKey: ['leads', 'pause'],
    mutationFn: ({ id, pausedUntil }) => api.leads.pause(id, pausedUntil),
    queryKey: leadKeys.all,
    updater: updateById((lead) => ({ ...lead, stage: 'Paused' })),
    invalidateKeys: [leadKeys.paused()],
  });
}

export function useRequalifyLead() {
  return useOptimisticMutation<unknown, { id: string }>({
    mutationKey: ['leads', 'requalify'],
    mutationFn: ({ id }) => api.leads.requalify(id),
    queryKey: leadKeys.all,
    updater: updateById((lead) => ({ ...lead, stage: 'Researching' })),
    invalidateKeys: [leadKeys.paused()],
  });
}

export function useCreateLead() {
  return useOptimisticMutation<{ data: any }, { company: string; type?: string; country?: string; pain?: string; certMgmtType?: string; etrmSystem?: string; gtrmSystem?: string; certRegistries?: string[]; itIntegrations?: string[]; certPainPoints?: string }>({
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
      scores: { scoreFit: 50, scoreIntent: 50, scoreUrgency: 50, scoreAccess: 30, scoreCommercial: 50 },
      scoreFit: 50,
      scoreIntent: 50,
      scoreUrgency: 50,
      scoreAccess: 30,
      scoreCommercial: 50,
      moduleFit: [],
      confidence: 0.5,
      owner: null,
    })),
    onSuccessCallback: replaceTempId(leadKeys.all),
  });
}

const LEAD_STAGES = ['New', 'Researching', 'Qualified'];
function getNextStage(current: string): string {
  const idx = LEAD_STAGES.indexOf(current);
  return idx >= 0 && idx < LEAD_STAGES.length - 1 ? LEAD_STAGES[idx + 1] : current;
}
