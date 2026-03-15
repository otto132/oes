import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const contactRoleKeys = {
  all: ['contactRoles'] as const,
  list: () => ['contactRoles', 'list'] as const,
};

export function useContactRolesQuery() {
  return useQuery({
    queryKey: contactRoleKeys.list(),
    queryFn: () => api.settings.contactRoles(),
  });
}

export function useCreateContactRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['contactRoles', 'create'],
    mutationFn: (data: { label: string; sortOrder?: number }) =>
      api.settings.createContactRole(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactRoleKeys.list() });
    },
  });
}

export function useUpdateContactRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['contactRoles', 'update'],
    mutationFn: (data: { id: string; label?: string; sortOrder?: number; isArchived?: boolean }) =>
      api.settings.updateContactRole(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactRoleKeys.list() });
    },
  });
}
