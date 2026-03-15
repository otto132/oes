import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const digestKeys = {
  all: ['digest'] as const,
  list: () => ['digest', 'list'] as const,
};

export function useDigestsQuery() {
  return useQuery({
    queryKey: digestKeys.list(),
    queryFn: () => api.digest.list(),
  });
}
