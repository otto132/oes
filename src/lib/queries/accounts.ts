import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const accountKeys = {
  all: ['accounts'] as const,
  list: (q?: string, type?: string) => ['accounts', 'list', q, type] as const,
  detail: (id: string) => ['accounts', id] as const,
};

export function useAccountsQuery(q?: string, type?: string) {
  return useQuery({
    queryKey: accountKeys.list(q, type),
    queryFn: () => api.accounts.list({ q, type }),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
    },
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.accounts.update(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(vars.id) });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) });
    },
  });
}
