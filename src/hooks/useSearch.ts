import { useCallback, useState } from "react";
import {
  getSearchHistory,
  searchWithContext,
  type ContextMatch,
  type SearchHistoryEntry,
  type SearchType,
} from "@/ipc/search";

export interface UseSearchResult {
  /** Matches from the most recent search, each with surrounding context. */
  results: ContextMatch[];
  /** Whether `results` was capped (more matches exist, FR-025). */
  truncated: boolean;
  /** Past searches for this file, most recent first (FR-024). */
  history: SearchHistoryEntry[];
  /** Whether a search is currently running. */
  isSearching: boolean;
  /** Message from the last failed search, if any (e.g. `InvalidQuery`). */
  error: string | null;
  /**
   * Runs `query` as `searchType` over the active file (FR-021–FR-025),
   * optionally restricted to the inclusive `[timeFrom, timeTo]` epoch-ms
   * range (FR-012/FR-013).
   */
  runSearch: (
    query: string,
    searchType: SearchType,
    timeFrom?: number | null,
    timeTo?: number | null,
  ) => Promise<void>;
}

/**
 * Runs logical/regex searches with context for `alias` via
 * `search_with_context`, and refreshes the search history afterwards
 * (FR-021–FR-025, FR-024).
 */
export function useSearch(alias: string | null): UseSearchResult {
  const [results, setResults] = useState<ContextMatch[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset accumulated state during render when the alias changes, rather
  // than via an effect (https://react.dev/learn/you-might-not-need-an-effect).
  const [trackedAlias, setTrackedAlias] = useState(alias);
  if (alias !== trackedAlias) {
    setTrackedAlias(alias);
    setResults([]);
    setTruncated(false);
    setHistory([]);
    setError(null);
  }

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
        await searchWithContext(
          alias,
          query,
          searchType,
          null,
          timeFrom,
          timeTo,
          (batch) => {
            setResults(batch.matches);
            setTruncated(batch.truncated);
          },
        );
        setHistory(await getSearchHistory(alias));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSearching(false);
      }
    },
    [alias],
  );

  return { results, truncated, history, isSearching, error, runSearch };
}
