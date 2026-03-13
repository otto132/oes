import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (includeCompleted?: boolean) => ['tasks', 'list', includeCompleted] as const,
};

export function useTasksQuery(includeCompleted = false) {
  return useQuery({
    queryKey: taskKeys.list(includeCompleted),
    queryFn: () => api.tasks.list(includeCompleted),
    placeholderData: keepPreviousData,
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: any }) =>
      api.tasks.complete(id, data),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const queries = qc.getQueriesData({ queryKey: taskKeys.all });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueryData(taskKeys.list(false), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.filter((t: any) => t.id !== id) };
      });
      qc.setQueryData(taskKeys.list(true), (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.map((t: any) => t.id === id ? { ...t, status: 'Done' } : t) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCommentOnTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.tasks.comment(id, text),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; accountId?: string; priority?: string; due?: string; goalId?: string }) =>
      api.tasks.create(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: taskKeys.all });
      const queries = qc.getQueriesData({ queryKey: taskKeys.all });
      const previous = queries.map(([key, d]) => [key, d] as const);
      const tempTask = { id: `temp-${Date.now()}`, title: data.title, status: 'To Do', pri: data.priority || 'Medium', due: data.due || '' };
      qc.setQueriesData({ queryKey: taskKeys.all }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: [tempTask, ...old.data] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
