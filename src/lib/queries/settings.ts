import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  agents: () => ['settings', 'agents'] as const,
  integrations: () => ['settings', 'integrations'] as const,
};

export function useTeamQuery() {
  return useQuery({
    queryKey: settingsKeys.team(),
    queryFn: () => api.settings.team(),
    retry: false,
  });
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: settingsKeys.agents(),
    queryFn: () => api.settings.agents(),
  });
}

export function useIntegrationsQuery() {
  return useQuery({
    queryKey: settingsKeys.integrations(),
    queryFn: () => api.settings.integrations(),
  });
}

export function usePatchAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: { status?: string; parameters?: Record<string, string> } }) =>
      api.settings.patchAgent(name, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.agents() });
    },
  });
}
