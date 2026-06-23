import { create } from "zustand";
import type { SearchHistoryEntry, SearchMatchEntry, SearchType } from "@/bindings";
import { useLineSelectionStore } from "./useLineSelectionStore";

/** Per-file search UI state (data-model.md "Frontend-only state: `SearchUiState`"). */
export interface SearchUiState {
  /** Current search-field text (FR-008: survives panel close). */
  query: string;
  searchType: SearchType;
  /** epoch ms */
  timeFrom: number | null;
  /** epoch ms */
  timeTo: number | null;
  /** Matches from the latest `search` run for this alias. */
  results: SearchMatchEntry[];
  truncated: boolean;
  /** Drives results panel visibility + main-view highlighting/nav (FR-004/FR-007). */
  panelOpen: boolean;
  /** Index into `results`; `-1` if none. */
  currentMatchIndex: number;
  /** Incremented whenever the main view should (re-)scroll to `currentMatchIndex`. */
  scrollNonce: number;
  /** Whether `timeFrom`/`timeTo` have been set, manually or pre-filled (FR-011–FR-013). */
  timeRangeInitialized: boolean;
  /** Whether long lines in results wrap (FR-010–FR-012). Default: false. */
  wrapLines: boolean;
  currentPage: number;
  totalCount: number;
  isPageLoading: boolean;
}

export const DEFAULT_SEARCH_UI_STATE: SearchUiState = {
  query: "",
  searchType: "logical",
  timeFrom: null,
  timeTo: null,
  results: [],
  truncated: false,
  panelOpen: false,
  currentMatchIndex: -1,
  scrollNonce: 0,
  timeRangeInitialized: false,
  wrapLines: false,
  currentPage: 0,
  totalCount: 0,
  isPageLoading: false,
};

interface SearchUiStoreState {
  slices: Record<string, SearchUiState>;
  setQuery: (alias: string, query: string) => void;
  setSearchType: (alias: string, searchType: SearchType) => void;
  setTimeRange: (
    alias: string,
    timeFrom: number | null,
    timeTo: number | null,
  ) => void;
  /** Pre-fills `timeFrom`/`timeTo` once, the first time a file's span is known (FR-011–FR-013). */
  initializeTimeRange: (
    alias: string,
    timeFrom: number | null,
    timeTo: number | null,
  ) => void;
  setResults: (
    alias: string,
    results: SearchMatchEntry[],
    truncated: boolean,
    totalCount?: number,
  ) => void;
  selectMatch: (alias: string, index: number) => void;
  nextMatch: (alias: string) => void;
  prevMatch: (alias: string) => void;
  closePanel: (alias: string) => void;
  applyHistoryEntry: (alias: string, entry: SearchHistoryEntry) => void;
  toggleWrapLines: (alias: string) => void;
  setPageResults: (
    alias: string,
    results: SearchMatchEntry[],
    truncated: boolean,
    totalCount: number,
    page: number,
  ) => void;
  setPageLoading: (alias: string, loading: boolean) => void;
}

/** Returns `alias`'s slice, or the defaults if `alias` has never been touched. */
function getSlice(
  state: SearchUiStoreState,
  alias: string,
): SearchUiState {
  return state.slices[alias] ?? DEFAULT_SEARCH_UI_STATE;
}

function updateSlice(
  state: SearchUiStoreState,
  alias: string,
  patch: Partial<SearchUiState>,
): Pick<SearchUiStoreState, "slices"> {
  return {
    slices: {
      ...state.slices,
      [alias]: { ...getSlice(state, alias), ...patch },
    },
  };
}

const useSearchUiStoreBase = create<SearchUiStoreState>((set) => ({
  slices: {},
  setQuery: (alias, query) =>
    set((state) => updateSlice(state, alias, { query })),
  setSearchType: (alias, searchType) =>
    set((state) => updateSlice(state, alias, { searchType })),
  setTimeRange: (alias, timeFrom, timeTo) =>
    set((state) =>
      updateSlice(state, alias, { timeFrom, timeTo, timeRangeInitialized: true }),
    ),
  initializeTimeRange: (alias, timeFrom, timeTo) =>
    set((state) => {
      if (getSlice(state, alias).timeRangeInitialized) {
        return {};
      }
      return updateSlice(state, alias, { timeFrom, timeTo, timeRangeInitialized: true });
    }),
  setResults: (alias, results, truncated, totalCount) =>
    set((state) => {
      const current = getSlice(state, alias);
      if (results.length > 0) {
        useLineSelectionStore.getState().selectLine(alias, results[0].line_index);
      }
      return updateSlice(state, alias, {
        results,
        truncated,
        panelOpen: true,
        currentMatchIndex: results.length > 0 ? 0 : -1,
        scrollNonce: current.scrollNonce + 1,
        currentPage: 0,
        totalCount: totalCount ?? results.length,
        isPageLoading: false,
      });
    }),
  selectMatch: (alias, index) =>
    set((state) => {
      const current = getSlice(state, alias);
      useLineSelectionStore.getState().selectLine(alias, current.results[index].line_index);
      return updateSlice(state, alias, {
        currentMatchIndex: index,
        scrollNonce: current.scrollNonce + 1,
      });
    }),
  nextMatch: (alias) =>
    set((state) => {
      const current = getSlice(state, alias);
      if (current.results.length === 0) {
        return {};
      }
      const currentMatchIndex =
        (current.currentMatchIndex + 1) % current.results.length;
      useLineSelectionStore
        .getState()
        .selectLine(alias, current.results[currentMatchIndex].line_index);
      return updateSlice(state, alias, {
        currentMatchIndex,
        scrollNonce: current.scrollNonce + 1,
      });
    }),
  prevMatch: (alias) =>
    set((state) => {
      const current = getSlice(state, alias);
      if (current.results.length === 0) {
        return {};
      }
      const currentMatchIndex =
        (current.currentMatchIndex - 1 + current.results.length) %
        current.results.length;
      useLineSelectionStore
        .getState()
        .selectLine(alias, current.results[currentMatchIndex].line_index);
      return updateSlice(state, alias, {
        currentMatchIndex,
        scrollNonce: current.scrollNonce + 1,
      });
    }),
  closePanel: (alias) =>
    set((state) => updateSlice(state, alias, { panelOpen: false })),
  applyHistoryEntry: (alias, entry) =>
    set((state) =>
      updateSlice(state, alias, {
        query: entry.query,
        searchType: entry.search_type,
        timeFrom: entry.time_from,
        timeTo: entry.time_to,
      }),
    ),
  toggleWrapLines: (alias) =>
    set((state) => {
      const current = getSlice(state, alias);
      return updateSlice(state, alias, { wrapLines: !current.wrapLines });
    }),
  setPageResults: (alias, results, truncated, totalCount, page) =>
    set((state) => {
      const current = getSlice(state, alias);
      if (results.length > 0) {
        useLineSelectionStore.getState().selectLine(alias, results[0].line_index);
      }
      return updateSlice(state, alias, {
        results,
        truncated,
        currentPage: page,
        totalCount,
        currentMatchIndex: results.length > 0 ? 0 : -1,
        scrollNonce: current.scrollNonce + 1,
        isPageLoading: false,
      });
    }),
  setPageLoading: (alias, loading) =>
    set((state) => updateSlice(state, alias, { isPageLoading: loading })),
}));

/** Non-reactive read of `alias`'s slice (or the defaults). */
export function getSearchUiSlice(alias: string): SearchUiState {
  return getSlice(useSearchUiStoreBase.getState(), alias);
}

/**
 * `useSearchUiStore`, the per-file search UI store (data-model.md). In
 * addition to the zustand hook/store API, exposes the derived selectors
 * `searchMatchLines(alias)` and `scrollToLine(alias)` (research.md §6/§7).
 */
export const useSearchUiStore = Object.assign(useSearchUiStoreBase, {
  /**
   * Line indices to mark with `bg-search-match` in `LogViewer`, while the
   * results panel is open (FR-005/FR-007).
   */
  searchMatchLines(alias: string): number[] {
    const slice = getSearchUiSlice(alias);
    return slice.panelOpen ? slice.results.map((r) => r.line_index) : [];
  },
  /**
   * The line `LogViewer` should scroll to, and a nonce that changes whenever
   * a (re-)scroll is requested (research.md §6).
   */
  scrollToLine(alias: string): { lineIndex: number; nonce: number } | null {
    const slice = getSearchUiSlice(alias);
    if (slice.panelOpen && slice.currentMatchIndex >= 0) {
      return {
        lineIndex: slice.results[slice.currentMatchIndex].line_index,
        nonce: slice.scrollNonce,
      };
    }
    return null;
  },
});
