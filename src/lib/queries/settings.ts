import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  agents: () => ['settings', 'agents'] as const,
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

// Invite user
export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; role?: string }) => api.settings.invite(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.invitations() });
    },
  });
}

// Revoke invitation
export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.settings.revokeInvite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.invitations() });
    },
  });
}

// Update team member (role, isActive)
export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: string; isActive?: boolean } }) =>
      api.settings.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.team() });
    },
  });
}

// Update profile
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
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
    mutationFn: (type: string) => api.sync.trigger(type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.integrations() });
    },
  });
}
