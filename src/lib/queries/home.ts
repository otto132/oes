import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const homeKeys = {
  all: ['home'] as const,
  summary: () => ['home', 'summary'] as const,
};

export function useHomeSummary() {
  return useQuery({
    queryKey: homeKeys.summary(),
    queryFn: () => api.home.summary(),
  });
}
