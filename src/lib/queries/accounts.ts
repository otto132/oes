import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
