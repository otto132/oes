import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const agentKeys = {
  all: ['agents'] as const,
  list: () => ['agents', 'list'] as const,
  detail: (name: string) => ['agents', name] as const,
  runs: (name: string) => ['agents', name, 'runs'] as const,
  analytics: (period?: string) => ['agents', 'analytics', period] as const,
  agentAnalytics: (name: string, period?: string) => ['agents', name, 'analytics', period] as const,
};

export function useAgentsQuery() {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: () => fetch('/api/agents').then((r) => r.json()),
  });
}

export function useAgentQuery(name: string) {
  return useQuery({
    queryKey: agentKeys.detail(name),
    queryFn: () => fetch(`/api/agents/${name}`).then((r) => r.json()),
    enabled: !!name,
  });
}

export function useAgentRunsQuery(name: string) {
  return useQuery({
    queryKey: agentKeys.runs(name),
    queryFn: () => fetch(`/api/agents/${name}/runs`).then((r) => r.json()),
    enabled: !!name,
  });
}

export function useAgentAnalyticsQuery(period: string = '30d') {
  return useQuery({
    queryKey: agentKeys.analytics(period),
    queryFn: () => fetch(`/api/agents/analytics?period=${period}`).then((r) => r.json()),
  });
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Record<string, unknown> }) =>
      fetch(`/api/agents/${name}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}

export function useRunAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetch(`/api/agents/${name}`, { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.all }),
  });
}
