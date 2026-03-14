import { useMemo } from 'react';
import { useMutationState } from '@tanstack/react-query';

/**
 * Returns a Set of entity IDs that have in-flight mutations matching the given key prefix.
 * Entity IDs are extracted from mutation variables (supports `id`, `{ id }`, and string variables).
 */
export function usePendingMutations(mutationKeyPrefix: string[]): Set<string> {
  const pendingVars = useMutationState({
    filters: { mutationKey: mutationKeyPrefix, status: 'pending' },
    select: (mutation) => mutation.state.variables,
  });

  return useMemo(() => {
    const ids = new Set<string>();
    for (const vars of pendingVars) {
      const id = extractId(vars);
      if (id) ids.add(id);
    }
    return ids;
  }, [pendingVars]);
}

/**
 * Returns a Map of entity IDs to their error info and original variables for failed mutations.
 * Failed state can be used to render inline retry UI.
 */
export function useFailedMutations(mutationKeyPrefix: string[]): Map<string, {
  error: string;
  variables: unknown;
}> {
  const failedMutations = useMutationState({
    filters: { mutationKey: mutationKeyPrefix, status: 'error' },
    select: (mutation) => ({
      variables: mutation.state.variables,
      error: mutation.state.error,
    }),
  });

  return useMemo(() => {
    const map = new Map<string, { error: string; variables: unknown }>();
    for (const m of failedMutations) {
      const id = extractId(m.variables);
      if (id) {
        map.set(id, {
          error: m.error instanceof Error ? m.error.message : String(m.error ?? 'Unknown error'),
          variables: m.variables,
        });
      }
    }
    return map;
  }, [failedMutations]);
}

/** Extract entity ID from mutation variables in various shapes */
function extractId(vars: unknown): string | undefined {
  if (typeof vars === 'string') return vars;
  if (vars && typeof vars === 'object' && 'id' in vars) {
    return String((vars as { id: unknown }).id);
  }
  return undefined;
}
