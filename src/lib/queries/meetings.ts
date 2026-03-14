import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { homeKeys } from './home';
import { useOptimisticMutation, prependItem, updateById, replaceTempId } from './helpers';

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
  return useOptimisticMutation<{ data: any }, { title: string; date: string; startTime: string; duration?: string; attendees?: string[]; accountId?: string }>({
    mutationKey: ['meetings', 'create'],
    mutationFn: (data) => api.meetings.create(data),
    queryKey: meetingKeys.all,
    updater: prependItem((vars) => ({
      id: `temp-${Date.now()}`,
      title: vars.title,
      time: vars.startTime,
      dur: vars.duration || '30 min',
      date: vars.date,
      acc: '',
      accId: vars.accountId || '',
      who: vars.attendees || [],
      prep: 'draft',
    })),
    onSuccessCallback: replaceTempId(meetingKeys.all),
    invalidateKeys: [homeKeys.all],
  });
}

export function useUpdateMeeting() {
  return useOptimisticMutation<unknown, { id: string; data: Record<string, unknown> }>({
    mutationKey: ['meetings', 'update'],
    mutationFn: ({ id, data }) => api.meetings.update(id, data),
    queryKey: meetingKeys.all,
    updater: updateById((m, { data }) => ({ ...m, ...data })),
    detailQueryKey: (vars) => meetingKeys.detail(vars.id),
    detailUpdater: (old, { data }) => {
      if (!old?.data) return old;
      return { ...old, data: { ...old.data, ...data } };
    },
    invalidateKeys: [homeKeys.all],
  });
}

export function useLogOutcome(meetingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      summary: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      nextSteps?: string;
      createFollowUp?: boolean;
      followUpTitle?: string;
      followUpDue?: string;
    }) => api.meetings.outcome(meetingId, data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
  });
}
