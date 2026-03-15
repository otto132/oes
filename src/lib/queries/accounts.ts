import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useOptimisticMutation, prependItem, replaceTempId } from './helpers';

export const accountKeys = {
  all: ['accounts'] as const,
  list: (q?: string, type?: string, owner?: string) => ['accounts', 'list', q, type, owner] as const,
  detail: (id: string) => ['accounts', id] as const,
};

export function useAccountsQuery(q?: string, type?: string, owner?: string) {
  return useQuery({
    queryKey: accountKeys.list(q, type, owner),
    queryFn: () => api.accounts.list({ q, type, owner }),
    placeholderData: keepPreviousData,
  });
}

export function useAccountDetail(id: string) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: () => api.accounts.detail(id),
    enabled: !!id,
  });
}

export function useCreateAccount() {
  return useOptimisticMutation<{ data: any }, {
    name: string;
    type?: string;
    country?: string;
    region?: string;
    notes?: string;
    certMgmtType?: string;
    etrmSystem?: string;
    gtrmSystem?: string;
    certRegistries?: string[];
    itIntegrations?: string[];
    certPainPoints?: string;
  }>({
    mutationKey: ['accounts', 'create'],
    mutationFn: (data) => api.accounts.create(data),
    queryKey: accountKeys.all,
    updater: prependItem((vars) => ({
      id: `temp-${Date.now()}`,
      name: vars.name,
      type: vars.type || 'Unknown',
      country: vars.country || '',
      countryCode: '',
      region: vars.region || '',
      status: 'Prospect',
      scores: { scoreFit: 50, scoreIntent: 50, scoreUrgency: 50, scoreAccess: 30, scoreCommercial: 50 },
      pipelineValue: 0,
      lastActivityAt: new Date().toISOString(),
      moduleFit: [],
      contacts: [],
      owner: null,
    })),
    onSuccessCallback: replaceTempId(accountKeys.all),
  });
}

export function useUpdateAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['accounts', 'update'],
    mutationFn: (data: Record<string, unknown>) =>
      api.accounts.update(id, data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: accountKeys.detail(id) });
      await qc.cancelQueries({ queryKey: accountKeys.all });
      const previousDetail = qc.getQueryData(accountKeys.detail(id));
      const queries = qc.getQueriesData({ queryKey: accountKeys.all });
      const previousList = queries.map(([key, d]) => [key, d] as const);
      qc.setQueryData(accountKeys.detail(id), (old: any) => {
        if (!old) return old;
        return { ...old, ...data };
      });
      return { previousDetail, previousList };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(accountKeys.detail(id), context.previousDetail);
      }
      context?.previousList.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useCreateContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['accounts', 'createContact'],
    mutationFn: async (data: {
      name: string;
      title?: string;
      role?: string;
      warmth?: string;
      email?: string;
      phone?: string;
    }) => {
      const res = await fetch(`/api/accounts/${accountId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to create contact');
      }
      return res.json();
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: accountKeys.detail(accountId) });
      const previousDetail = qc.getQueryData(accountKeys.detail(accountId));
      qc.setQueryData(accountKeys.detail(accountId), (old: any) => {
        if (!old) return old;
        const tempContact = {
          id: `temp-${Date.now()}`,
          name: vars.name,
          title: vars.title,
          role: vars.role,
          warmth: vars.warmth,
          email: vars.email,
          phone: vars.phone,
        };
        return {
          ...old,
          contacts: [...(old.contacts ?? []), tempContact],
        };
      });
      return { previousDetail };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(accountKeys.detail(accountId), context.previousDetail);
      }
    },
    onSuccess: (serverResponse) => {
      qc.setQueryData(accountKeys.detail(accountId), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          contacts: (old.contacts || []).map((c: any) =>
            c.id?.startsWith('temp-') ? serverResponse.data : c
          ),
        };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) });
    },
  });
}

export function useUpdateContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['accounts', 'updateContact'],
    mutationFn: async ({ contactId, data }: { contactId: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/accounts/${accountId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to update contact');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) });
    },
  });
}

export function useImportAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['accounts', 'import'],
    mutationFn: (args: { file: File; fieldMap?: Record<string, string> }) =>
      api.accounts.import(args.file, args.fieldMap),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useDeleteContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['accounts', 'deleteContact'],
    mutationFn: async (contactId: string) => {
      const res = await fetch(`/api/accounts/${accountId}/contacts/${contactId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Failed to delete contact');
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) });
    },
  });
}
