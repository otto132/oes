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
    onMutate: async ({ name, data }) => {
      await qc.cancelQueries({ queryKey: settingsKeys.agents() });
      const previousAgents = qc.getQueryData(settingsKeys.agents());
      qc.setQueryData(settingsKeys.agents(), (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((a: any) =>
            a.name === name ? { ...a, ...data } : a,
          ),
        };
      });
      return { previousAgents };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousAgents) qc.setQueryData(settingsKeys.agents(), context.previousAgents);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.agents() });
    },
  });
}
