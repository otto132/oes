import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useOptimisticMutation, removeById, updateById } from './helpers';

export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  agents: () => ['settings', 'agents'] as const,
  agentUsage: (range: string) => ['settings', 'agentUsage', range] as const,
  integrations: () => ['settings', 'integrations'] as const,
  invitations: () => ['settings', 'invitations'] as const,
  profile: () => ['settings', 'profile'] as const,
};

// Team list
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

// Pending invitations
export function useInvitationsQuery() {
  return useQuery({
    queryKey: settingsKeys.invitations(),
    queryFn: () => api.settings.invitations(),
  });
}

// Current user profile
export function useProfileQuery() {
  return useQuery({
    queryKey: settingsKeys.profile(),
    queryFn: () => api.settings.profile(),
  });
}

export function useAgentUsageQuery(range: 'today' | '7d' | '30d' = 'today') {
  return useQuery({
    queryKey: settingsKeys.agentUsage(range),
    queryFn: () => api.settings.agentUsage(range),
  });
}

export function usePatchAgent() {
  return useOptimisticMutation<unknown, { name: string; data: { status?: string; parameters?: Record<string, unknown> } }>({
    mutationKey: ['settings', 'patchAgent'],
    mutationFn: ({ name, data }) => api.settings.patchAgent(name, data),
    queryKey: settingsKeys.agents(),
    updater: (old, { name, data }) => ({
      ...old,
      data: old.data.map((a: any) =>
        a.name === name ? { ...a, ...data } : a,
      ),
    }),
  });
}

// Invite user
export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['settings', 'invite'],
    mutationFn: (data: { email: string; role?: string }) => api.settings.invite(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.invitations() });
    },
  });
}

// Revoke invitation
export function useRevokeInvitation() {
  return useOptimisticMutation<unknown, string>({
    mutationKey: ['settings', 'revokeInvite'],
    mutationFn: (id) => api.settings.revokeInvite(id),
    queryKey: settingsKeys.invitations(),
    updater: removeById(),
  });
}

// Update team member (role, isActive)
export function useUpdateTeamMember() {
  return useOptimisticMutation<unknown, { id: string; data: { role?: string; isActive?: boolean } }>({
    mutationKey: ['settings', 'updateUser'],
    mutationFn: ({ id, data }) => api.settings.updateUser(id, data),
    queryKey: settingsKeys.team(),
    updater: updateById((member, { data }) => ({ ...member, ...data })),
  });
}

// Update profile
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['settings', 'updateProfile'],
    mutationFn: (data: { name?: string; initials?: string; notificationPrefs?: { emailAlerts: boolean; queueAlerts: boolean } }) =>
      api.settings.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.profile() });
    },
  });
}

// Trigger manual sync
export function useSyncMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['settings', 'sync'],
    mutationFn: (type: 'all' | 'emails' | 'calendar') => api.sync.trigger(type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.integrations() });
    },
  });
}
