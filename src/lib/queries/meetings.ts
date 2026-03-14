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
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: meetingKeys.all });
      const queries = qc.getQueriesData({ queryKey: meetingKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const tempMeeting = {
        id: `temp-${Date.now()}`,
        title: data.title,
        time: data.startTime,
        dur: data.duration || '30 min',
        date: data.date,
        acc: '',
        accId: data.accountId || '',
        who: data.attendees || [],
        prep: 'draft',
      };
      qc.setQueriesData({ queryKey: meetingKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: [tempMeeting, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
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
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: meetingKeys.all });
      const queries = qc.getQueriesData({ queryKey: meetingKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const previousDetail = qc.getQueryData(meetingKeys.detail(id));
      qc.setQueriesData({ queryKey: meetingKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((m: any) => m.id === id ? { ...m, ...data } : m) };
      });
      qc.setQueryData(meetingKeys.detail(id), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: { ...old.data, ...data } };
      });
      return { previous, previousDetail, id };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.previousDetail) qc.setQueryData(meetingKeys.detail(context.id), context.previousDetail);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: meetingKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: meetingKeys.all });
      qc.invalidateQueries({ queryKey: homeKeys.all });
    },
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
