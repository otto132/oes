import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const settingsKeys = {
  all: ['settings'] as const,
  team: () => ['settings', 'team'] as const,
  invitations: () => ['settings', 'invitations'] as const,
  profile: () => ['settings', 'profile'] as const,
};

// Team list
export function useTeamQuery() {
  return useQuery({
    queryKey: settingsKeys.team(),
    queryFn: () => api.settings.team(),
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
