import { create } from "zustand";

/** Per-file selected-line state (data-model.md "LineSelectionSlice"). */
export interface LineSelectionSlice {
  /** 1-based line index of the selected line, or null if none. */
  selectedLine: number | null;
  /**
   * Incremented only when the selected line changes via arrow-key
   * navigation (FR-011). `LogViewer` and `SearchResultsPanel` watch this to
   * trigger scroll-follow (FR-012/FR-013).
   */
  navNonce: number;
}

export const DEFAULT_LINE_SELECTION_SLICE: LineSelectionSlice = {
  selectedLine: null,
  navNonce: 0,
};

interface LineSelectionStoreState {
  slices: Record<string, LineSelectionSlice>;

  /**
   * Sets `selectedLine` for `alias` without bumping `navNonce`. Used by:
   * - `LogLine`'s click handler (FR-001/FR-002/FR-003)
   * - `useSearchUiStore`'s setResults/selectMatch/nextMatch/prevMatch (FR-010)
   */
  selectLine: (alias: string, lineIndex: number) => void;

  /**
   * Arrow-key navigation (FR-011/FR-014). `fallbackLine` is the line to
   * select if `selectedLine` is currently null. Clamps `current ± delta` to
   * `[1, totalLines]`; if the clamped result equals `current`, state is
   * unchanged (no-op at file bounds, acceptance scenario 5). Otherwise sets
   * `selectedLine` and bumps `navNonce`.
   */
  moveSelection: (
    alias: string,
    delta: 1 | -1,
    totalLines: number,
    fallbackLine: number,
  ) => void;
}

function getSlice(
  state: LineSelectionStoreState,
  alias: string,
): LineSelectionSlice {
  return state.slices[alias] ?? DEFAULT_LINE_SELECTION_SLICE;
}

export const useLineSelectionStore = create<LineSelectionStoreState>(
  (set) => ({
    slices: {},
    selectLine: (alias, lineIndex) =>
      set((state) => ({
        slices: {
          ...state.slices,
          [alias]: { ...getSlice(state, alias), selectedLine: lineIndex },
        },
      })),
    moveSelection: (alias, delta, totalLines, fallbackLine) =>
      set((state) => {
        const current = getSlice(state, alias);
        const currentLine = current.selectedLine ?? fallbackLine;
        const nextLine = Math.min(
          Math.max(currentLine + delta, 1),
          totalLines,
        );
        if (nextLine === currentLine) {
          return {};
        }
        return {
          slices: {
            ...state.slices,
            [alias]: {
              ...current,
              selectedLine: nextLine,
              navNonce: current.navNonce + 1,
            },
          },
        };
      }),
  }),
);

/** Non-reactive read of `alias`'s slice (or the defaults). */
export function getLineSelectionSlice(alias: string): LineSelectionSlice {
  return getSlice(useLineSelectionStore.getState(), alias);
}
