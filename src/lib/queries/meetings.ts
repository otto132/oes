import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { homeKeys } from './home';

export const meetingKeys = {
  all: ['meetings'] as const,
  list: (date?: string, range?: number) => ['meetings', 'list', date, range] as const,
  detail: (id: string) => ['meetings', id] as const,
};

export function useMeetingsQuery(date?: string, range?: number) {
  return useQuery({
    queryKey: meetingKeys.list(date, range),
    queryFn: () => api.meetings.list({ date, range }),
    placeholderData: keepPreviousData,
  });
}

export function useMeetingDetail(id: string) {
  return useQuery({
    queryKey: meetingKeys.detail(id),
    queryFn: () => api.meetings.detail(id),
    enabled: !!id,
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; date: string; startTime: string; duration?: string; attendees?: string[]; accountId?: string }) =>
      api.meetings.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meetingKeys.all });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}

export function useUpdateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.meetings.update(id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: meetingKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: meetingKeys.all });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}
