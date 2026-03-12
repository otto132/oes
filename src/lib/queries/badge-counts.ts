// src/lib/queries/badge-counts.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const badgeKeys = {
  all: ['badge-counts'] as const,
};

export function useBadgeCounts() {
  return useQuery({
    queryKey: badgeKeys.all,
    queryFn: () => api.badgeCounts.get(),
    refetchInterval: 30_000,
  });
}
