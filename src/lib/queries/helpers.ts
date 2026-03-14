import { useQueryClient, useMutation, type QueryKey } from '@tanstack/react-query';

type Updater<TVars> = (old: any, vars: TVars) => any;

interface OptimisticMutationOptions<TData, TVars> {
  mutationKey: QueryKey;
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Query key to snapshot, cancel, and optimistically update */
  queryKey: readonly unknown[];
  /** Transform cached data optimistically */
  updater: Updater<TVars>;
  /** Additional query keys to invalidate on settle (beyond queryKey) */
  invalidateKeys?: readonly (readonly unknown[])[];
}

/**
 * Creates a mutation hook with standardised optimistic update boilerplate:
 * cancel → snapshot → update cache → rollback on error → invalidate on settle.
 */
export function useOptimisticMutation<TData = unknown, TVars = unknown>(
  options: OptimisticMutationOptions<TData, TVars>,
) {
  const qc = useQueryClient();
  const { mutationKey, mutationFn, queryKey, updater, invalidateKeys } = options;

  return useMutation({
    mutationKey,
    mutationFn,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey });
      const queries = qc.getQueriesData({ queryKey });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey }, (old: any) => {
        if (!old) return old;
        return updater(old, vars);
      });
      return { previous };
    },
    onError: (_err: unknown, _vars: TVars, context: { previous: readonly (readonly [QueryKey, unknown])[] } | undefined) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      invalidateKeys?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
    },
  });
}

/** Updater: remove an item by ID from `old.data` */
export function removeById(idField = 'id') {
  return (old: any, id: string) => ({
    ...old,
    data: old.data.filter((item: any) => item[idField] !== id),
  });
}

/** Updater: patch an item by ID in `old.data`. Vars can be a string ID or an object with `id`. */
export function updateById(
  patcher: (item: any, vars: any) => any,
) {
  return (old: any, vars: any) => {
    const id = typeof vars === 'string' ? vars : vars.id;
    return {
      ...old,
      data: old.data.map((item: any) =>
        item.id === id ? patcher(item, vars) : item,
      ),
    };
  };
}
