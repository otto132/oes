import { useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { leadKeys } from './leads';
import { oppKeys } from './opportunities';

export function useBulkAdvanceLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['leads', 'bulkAdvance'],
    mutationFn: (ids: string[]) => api.leads.bulkAdvance(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export function useBulkDisqualifyLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['leads', 'bulkDisqualify'],
    mutationFn: (ids: string[]) => api.leads.bulkDisqualify(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export function useBulkAssignLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['leads', 'bulkAssign'],
    mutationFn: ({ ids, ownerId }: { ids: string[]; ownerId: string }) => api.leads.bulkAssign(ids, ownerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: leadKeys.all }),
  });
}

export function useBulkMoveOpps() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opps', 'bulkMove'],
    mutationFn: ({ ids, stage }: { ids: string[]; stage: string }) => api.opportunities.bulkMove(ids, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: oppKeys.all }),
  });
}

export function useBulkCloseLostOpps() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opps', 'bulkCloseLost'],
    mutationFn: (ids: string[]) => api.opportunities.bulkCloseLost(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: oppKeys.all }),
  });
}

export function useBulkAssignOpps() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['opps', 'bulkAssign'],
    mutationFn: ({ ids, ownerId }: { ids: string[]; ownerId: string }) => api.opportunities.bulkAssign(ids, ownerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: oppKeys.all }),
  });
}
