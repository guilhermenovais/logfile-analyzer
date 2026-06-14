import { useQuery } from "@tanstack/react-query";
import { getFileProperties, type FileProperties } from "@/ipc/files";

/** Poll interval while indexing is incomplete (research.md §6). */
const INDEXING_REFETCH_INTERVAL_MS = 1000;

export function filePropertiesQueryKey(alias: string | null) {
  return ["fileProperties", alias] as const;
}

/**
 * Keeps polling `getFileProperties` while indexing is incomplete, so
 * `first_timestamp`/`last_timestamp` (`null` until indexing finishes) become
 * available without the caller managing polling (research.md §6).
 */
export function filePropertiesRefetchInterval(query: {
  state: { data?: FileProperties };
}): number | false {
  return query.state.data?.indexing_complete ? false : INDEXING_REFETCH_INTERVAL_MS;
}

/** Loads line-count, timestamp-detection, and indexing status for `alias` (FR-027). */
export function useFileProperties(alias: string | null) {
  return useQuery({
    queryKey: filePropertiesQueryKey(alias),
    queryFn: () => getFileProperties(alias as string),
    enabled: alias !== null,
    refetchInterval: filePropertiesRefetchInterval,
  });
}
