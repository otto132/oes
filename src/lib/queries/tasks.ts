import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useOptimisticMutation, prependItem } from './helpers';

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
    mutationKey: ['tasks', 'complete'],
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
  return useOptimisticMutation<unknown, { id: string; text: string; mentionedUserIds?: string[] }>({
    mutationKey: ['tasks', 'comment'],
    mutationFn: ({ id, text, mentionedUserIds }) => api.tasks.comment(id, text, mentionedUserIds),
    queryKey: taskKeys.all,
    updater: (old, { id, text }) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: {
          ...old.data,
          tasks: old.data.tasks?.map((t: any) =>
            t.id === id
              ? { ...t, comments: [...(t.comments || []), { id: `temp-${Date.now()}`, text, author: 'You', createdAt: new Date().toISOString() }] }
              : t
          ),
        },
      };
    },
  });
}

export function useUpdateTask() {
  return useOptimisticMutation<unknown, { id: string; data: Record<string, unknown> }>({
    mutationKey: ['tasks', 'update'],
    mutationFn: ({ id, data }) => api.tasks.update(id, data),
    queryKey: taskKeys.all,
    updater: (old, { id, data }) => {
      if (!old?.data) return old;
      const updateTasks = (tasks: any[]) =>
        tasks?.map((t: any) => (t.id === id ? { ...t, ...data } : t));
      if (Array.isArray(old.data)) {
        return { ...old, data: updateTasks(old.data) };
      }
      return {
        ...old,
        data: { ...old.data, tasks: updateTasks(old.data.tasks || []) },
      };
    },
  });
}

export function useCreateTask() {
  return useOptimisticMutation<{ data: any }, { title: string; accountId?: string; priority?: string; dueDate?: string; goalId?: string }>({
    mutationKey: ['tasks', 'create'],
    mutationFn: (data) => api.tasks.create(data),
    queryKey: taskKeys.all,
    updater: prependItem((vars) => ({
      id: `temp-${Date.now()}`,
      title: vars.title,
      status: 'Open',
      priority: vars.priority || 'Medium',
      dueDate: vars.dueDate || '',
    })),
    onSuccessCallback: (serverResponse, _vars, qc) => {
      qc.setQueriesData({ queryKey: taskKeys.all }, (old: any) => {
        if (!old?.data) return old;
        const replace = (tasks: any[]) =>
          tasks?.map((t: any) => t.id?.startsWith('temp-') ? serverResponse.data : t);
        if (Array.isArray(old.data)) {
          return { ...old, data: replace(old.data) };
        }
        return { ...old, data: { ...old.data, tasks: replace(old.data.tasks || []) } };
      });
    },
  });
}
