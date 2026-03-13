import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type?: string;
      country?: string;
      notes?: string;
    }) => api.accounts.create(data),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: accountKeys.all });
      const queries = qc.getQueriesData({ queryKey: accountKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey: accountKeys.all }, (old: any) => {
        if (!old) return old;
        const tempItem = {
          id: `temp-${Date.now()}`,
          name: vars.name,
          type: vars.type,
          country: vars.country,
          status: 'Prospect',
        };
        return { ...old, data: [tempItem, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.accounts.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: accountKeys.detail(id) });
      await qc.cancelQueries({ queryKey: accountKeys.all });
      const previousDetail = qc.getQueryData(accountKeys.detail(id));
      const queries = qc.getQueriesData({ queryKey: accountKeys.all });
      const previousList = queries.map(([key, d]) => [key, d] as const);
      qc.setQueryData(accountKeys.detail(id), (old: any) => {
        if (!old) return old;
        return { ...old, ...data };
      });
      return { previousDetail, previousList, id };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail !== undefined) {
        qc.setQueryData(accountKeys.detail(context.id), context.previousDetail);
      }
      context?.previousList.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useUpdateAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.accounts.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(id) });
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useCreateContact(accountId: string) {
  const qc = useQueryClient();
  return useMutation({
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) });
    },
  });
}
