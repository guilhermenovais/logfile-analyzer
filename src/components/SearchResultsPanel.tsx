import { useSearchUiStore } from "@/hooks/useSearchUiStore";

export interface SearchResultsPanelProps {
  /** Alias of the file whose `useSearchUiStore` slice this panel reflects. */
  alias: string;
}

/**
 * Lists the matching lines for `alias`'s current search (FR-001), with each
 * row scrolling the main view to that line (FR-002/FR-003) and a close
 * button that hides the panel while preserving the query (FR-004/FR-008).
 */
export function SearchResultsPanel({ alias }: SearchResultsPanelProps) {
  const { results, truncated, currentMatchIndex } = useSearchUiStore(
    (state) =>
      state.slices[alias] ?? {
        results: [],
        truncated: false,
        currentMatchIndex: -1,
      },
  );

  return (
    <div className="flex flex-col gap-2 border-b p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {results.length === 0
            ? "0 matches"
            : `${currentMatchIndex + 1} of ${results.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous match"
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={results.length === 0}
            onClick={() => useSearchUiStore.getState().prevMatch(alias)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Next match"
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={results.length === 0}
            onClick={() => useSearchUiStore.getState().nextMatch(alias)}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Close search results"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => useSearchUiStore.getState().closePanel(alias)}
          >
            ×
          </button>
        </div>
      </div>

      {truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {results.length} matches.
        </p>
      )}

      {results.length === 0 ? (
        <p className="text-xs text-muted-foreground">No matches found.</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-auto text-xs">
          {results.map((match, index) => (
            <li key={match.line_index}>
              <button
                type="button"
                className="flex w-full items-start gap-2 text-left hover:bg-accent"
                onClick={() =>
                  useSearchUiStore.getState().selectMatch(alias, index)
                }
              >
                <span className="shrink-0 font-mono text-muted-foreground">
                  {match.line_index}
                </span>
                <span className="flex-1 truncate font-mono">
                  {match.content}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
