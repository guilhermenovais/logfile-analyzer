import { useQuery } from "@tanstack/react-query";
import type { SearchHistoryEntry } from "@/bindings";
import { getSearchHistory } from "@/ipc/search";

/** Most recent suggestions/overlay entries to surface (FR-010/FR-012). */
const MAX_SUGGESTIONS = 5;

export interface UseSearchHistoryResult {
  /** The active workspace's recorded search history, most recent first (FR-013). */
  history: SearchHistoryEntry[];
  isLoading: boolean;
  /**
   * Up to `MAX_SUGGESTIONS` entries whose `query` contains `queryText`, most
   * recent first, or the `MAX_SUGGESTIONS` most-recent entries when
   * `queryText` is empty (FR-010).
   */
  suggestions: (queryText: string) => SearchHistoryEntry[];
}

/**
 * Loads the active workspace's search history (FR-013/FR-024), shared by the
 * `SearchBar` autocomplete combobox and `SearchHistoryOverlay` (FR-010/FR-011).
 */
export function useSearchHistory(): UseSearchHistoryResult {
  const { data, isLoading } = useQuery({
    queryKey: ["searchHistory"],
    queryFn: () => getSearchHistory(),
  });

  const history = data ?? [];

  return {
    history,
    isLoading,
    suggestions: (queryText) => {
      const filtered = queryText
        ? history.filter((entry) => entry.query.includes(queryText))
        : history;
      return filtered.slice(0, MAX_SUGGESTIONS);
    },
  };
}
