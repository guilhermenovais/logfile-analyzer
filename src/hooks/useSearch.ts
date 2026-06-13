import { useCallback, useState } from "react";
import { search, type SearchType } from "@/ipc/search";
import { useSearchUiStore } from "./useSearchUiStore";

export interface UseSearchResult {
  /** Whether a search is currently running. */
  isSearching: boolean;
  /** Message from the last failed search, if any (e.g. `InvalidQuery`). */
  error: string | null;
  /**
   * Runs `query` as `searchType` over the active file (FR-001–FR-005),
   * optionally restricted to the inclusive `[timeFrom, timeTo]` epoch-ms
   * range, and writes the results into `useSearchUiStore` for `alias`.
   */
  runSearch: (
    query: string,
    searchType: SearchType,
    timeFrom?: number | null,
    timeTo?: number | null,
  ) => Promise<void>;
}

/**
 * Runs logical/regex searches for `alias` via `search`, writing each
 * streamed batch's matches/truncation into `useSearchUiStore` (research.md
 * §1), which in turn drives the results panel, main-view highlighting, and
 * navigation (US1/US2).
 */
export function useSearch(alias: string | null): UseSearchResult {
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (
      query: string,
      searchType: SearchType,
      timeFrom: number | null = null,
      timeTo: number | null = null,
    ) => {
      if (!alias || query.trim() === "") {
        return;
      }

      setIsSearching(true);
      setError(null);
      try {
        await search(alias, query, searchType, timeFrom, timeTo, (batch) => {
          useSearchUiStore
            .getState()
            .setResults(alias, batch.matches, batch.truncated);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSearching(false);
      }
    },
    [alias],
  );

  return { isSearching, error, runSearch };
}
