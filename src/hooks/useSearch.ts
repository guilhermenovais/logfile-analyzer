import { useCallback, useState } from "react";
import { search, type SearchType } from "@/ipc/search";
import { useSearchUiStore } from "./useSearchUiStore";

export interface UseSearchResult {
  /** Whether a search is currently running. */
  isSearching: boolean;
  /** Message from the last failed search, if any (e.g. `InvalidQuery`). */
  error: string | null;
  runSearch: (
    query: string,
    searchType: SearchType,
    timeFrom?: number | null,
    timeTo?: number | null,
    offset?: number | null,
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
      offset: number | null = null,
    ) => {
      if (!alias || query.trim() === "") {
        return;
      }

      setIsSearching(true);
      setError(null);
      try {
        const page = offset ? Math.floor(offset / 500) : 0;
        await search(
          alias,
          query,
          searchType,
          timeFrom,
          timeTo,
          (batch) => {
            if (offset) {
              useSearchUiStore
                .getState()
                .setPageResults(
                  alias,
                  batch.matches,
                  batch.truncated,
                  batch.total_count,
                  page,
                );
            } else {
              useSearchUiStore
                .getState()
                .setResults(alias, batch.matches, batch.truncated, batch.total_count);
            }
          },
          offset,
        );
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
