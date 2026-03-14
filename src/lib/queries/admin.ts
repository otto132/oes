import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
};

export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => api.admin.stats(),
    refetchInterval: 30_000,
  });
}
