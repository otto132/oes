import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const agentAnalyticsKeys = {
  all: ['agentAnalytics'] as const,
  period: (days: number) => ['agentAnalytics', days] as const,
};

export function useAgentAnalyticsQuery(periodDays = 30) {
  return useQuery({
    queryKey: agentAnalyticsKeys.period(periodDays),
    queryFn: () => api.settings.agentAnalytics(periodDays),
    staleTime: 5 * 60 * 1000,
  });
}
