import { create } from "zustand";

/** Per-file log view toolbar state (data-model.md "useLogViewToolbarStore"). */
export interface LogViewToolbarState {
  /** Show only highlighted lines in `LogViewer` (FR-001/FR-002/FR-006). */
  highlightedOnly: boolean;
  /** Whether `HighlightPanel`'s list is rendered (FR-003/FR-004/FR-005). */
  highlightsVisible: boolean;
  /** Wrap long lines, moved from `LogViewer`'s local state. */
  wrap: boolean;
}

export const DEFAULT_LOG_VIEW_TOOLBAR_STATE: LogViewToolbarState = {
  highlightedOnly: false,
  highlightsVisible: false,
  wrap: false,
};

interface LogViewToolbarStoreState {
  slices: Record<string, LogViewToolbarState>;
  setHighlightedOnly: (alias: string, value: boolean) => void;
  /** FR-005 — does not touch `highlightedOnly` or `wrap`. */
  toggleHighlightsVisible: (alias: string) => void;
  setWrap: (alias: string, value: boolean) => void;
}

function getSlice(
  state: LogViewToolbarStoreState,
  alias: string,
): LogViewToolbarState {
  return state.slices[alias] ?? DEFAULT_LOG_VIEW_TOOLBAR_STATE;
}

export const useLogViewToolbarStore = create<LogViewToolbarStoreState>(
  (set) => ({
    slices: {},
    setHighlightedOnly: (alias, value) =>
      set((state) => ({
        slices: {
          ...state.slices,
          [alias]: { ...getSlice(state, alias), highlightedOnly: value },
        },
      })),
    toggleHighlightsVisible: (alias) =>
      set((state) => {
        const current = getSlice(state, alias);
        return {
          slices: {
            ...state.slices,
            [alias]: {
              ...current,
              highlightsVisible: !current.highlightsVisible,
            },
          },
        };
      }),
    setWrap: (alias, value) =>
      set((state) => ({
        slices: {
          ...state.slices,
          [alias]: { ...getSlice(state, alias), wrap: value },
        },
      })),
  }),
);

/** Non-reactive read of `alias`'s slice (or the defaults). */
export function getLogViewToolbarSlice(alias: string): LogViewToolbarState {
  return getSlice(useLogViewToolbarStore.getState(), alias);
}
