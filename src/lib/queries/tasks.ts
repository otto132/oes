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
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useCommentOnTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.tasks.comment(id, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      accountId?: string;
      priority?: string;
      due?: string;
      goalId?: string;
    }) => api.tasks.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
}
