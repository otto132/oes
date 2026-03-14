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
  /**
   * Detail query key to also snapshot, cancel, and update optimistically.
   * Receives vars so you can derive the key (e.g. oppKeys.detail(vars.id)).
   */
  detailQueryKey?: (vars: TVars) => readonly unknown[];
  /** Transform cached detail data optimistically. Required when detailQueryKey is set. */
  detailUpdater?: (old: any, vars: TVars) => any;
  /**
   * Called on success — useful for replacing temp IDs with server response.
   * The queryClient is provided so you can setQueriesData.
   */
  onSuccessCallback?: (data: TData, vars: TVars, qc: ReturnType<typeof useQueryClient>) => void;
}

type MutationContext = {
  previous: readonly (readonly [QueryKey, unknown])[];
  previousDetail?: unknown;
  detailKey?: readonly unknown[];
};

/**
 * Creates a mutation hook with standardised optimistic update boilerplate:
 * cancel → snapshot → update cache → rollback on error → invalidate on settle.
 */
export function useOptimisticMutation<TData = unknown, TVars = unknown>(
  options: OptimisticMutationOptions<TData, TVars>,
) {
  const qc = useQueryClient();
  const { mutationKey, mutationFn, queryKey, updater, invalidateKeys, detailQueryKey, detailUpdater, onSuccessCallback } = options;

  return useMutation({
    mutationKey,
    mutationFn,
    onMutate: async (vars: TVars): Promise<MutationContext> => {
      await qc.cancelQueries({ queryKey });
      const queries = qc.getQueriesData({ queryKey });
      const previous = queries.map(([key, data]) => [key, data] as const);
      qc.setQueriesData({ queryKey }, (old: any) => {
        if (!old) return old;
        return updater(old, vars);
      });

      let previousDetail: unknown;
      let detailKey: readonly unknown[] | undefined;
      if (detailQueryKey && detailUpdater) {
        detailKey = detailQueryKey(vars);
        await qc.cancelQueries({ queryKey: detailKey });
        previousDetail = qc.getQueryData(detailKey);
        qc.setQueryData(detailKey, (old: any) => {
          if (!old) return old;
          return detailUpdater(old, vars);
        });
      }

      return { previous, previousDetail, detailKey };
    },
    onError: (_err: unknown, _vars: TVars, context: MutationContext | undefined) => {
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.detailKey && context.previousDetail !== undefined) {
        qc.setQueryData(context.detailKey, context.previousDetail);
      }
    },
    onSuccess: (data: unknown, vars: TVars) => {
      onSuccessCallback?.(data as TData, vars, qc);
    },
    onSettled: (_data: unknown, _err: unknown, vars: TVars, context: MutationContext | undefined) => {
      qc.invalidateQueries({ queryKey });
      invalidateKeys?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      if (context?.detailKey) {
        qc.invalidateQueries({ queryKey: context.detailKey });
      }
    },
  });
}

/** onSuccessCallback: replace temp-ID items with server response in `old.data` array */
export function replaceTempId<TData extends { data: any }>(queryKey: readonly unknown[]) {
  return (serverResponse: TData, _vars: unknown, qc: ReturnType<typeof useQueryClient>) => {
    qc.setQueriesData({ queryKey }, (old: any) => {
      if (!old?.data) return old;
      if (Array.isArray(old.data)) {
        return {
          ...old,
          data: old.data.map((item: any) =>
            item.id?.startsWith('temp-') ? serverResponse.data : item
          ),
        };
      }
      return old;
    });
  };
}

/** Updater: prepend a new item to `old.data` array */
export function prependItem<TVars>(buildItem: (vars: TVars) => any) {
  return (old: any, vars: TVars) => ({
    ...old,
    data: [buildItem(vars), ...old.data],
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
