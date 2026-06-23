import { useEffect, useRef } from "react";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import { useSearch } from "@/hooks/useSearch";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { cn } from "@/lib/utils";

export interface SearchResultsPanelProps {
  /** Alias of the file whose `useSearchUiStore` slice this panel reflects. */
  alias: string;
}

/**
 * Lists the matching lines for `alias`'s current search (FR-001), with each
 * row scrolling the main view to that line (FR-002/FR-003) and a close
 * button that hides the panel while preserving the query (FR-004/FR-008).
 */
const PAGE_SIZE = 500;

export function SearchResultsPanel({ alias }: SearchResultsPanelProps) {
  const {
    results,
    truncated,
    currentMatchIndex,
    wrapLines,
    currentPage,
    totalCount,
    isPageLoading,
  } = useSearchUiStore(
    (state) =>
      state.slices[alias] ?? {
        results: [],
        truncated: false,
        currentMatchIndex: -1,
        wrapLines: false,
        currentPage: 0,
        totalCount: 0,
        isPageLoading: false,
      },
  );
  const selectedLine = useLineSelectionStore(
    (state) => state.slices[alias]?.selectedLine ?? null,
  );
  const navNonce = useLineSelectionStore(
    (state) => state.slices[alias]?.navNonce ?? 0,
  );

  const { runSearch } = useSearch(alias);
  const entryRefs = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    if (navNonce === 0 || selectedLine === null) {
      return;
    }
    entryRefs.current.get(selectedLine)?.scrollIntoView({ block: "nearest" });
    // Only `navNonce` (arrow-key navigation, FR-013) should (re-)trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navNonce]);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {results.length === 0
            ? "0 matches"
            : totalCount > PAGE_SIZE
              ? `${currentPage * PAGE_SIZE + currentMatchIndex + 1} of ${totalCount}`
              : `${currentMatchIndex + 1} of ${results.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Wrap lines"
            title="Wrap lines"
            className={cn(
              "min-w-7 min-h-7 flex items-center justify-center rounded text-xs hover:bg-accent",
              wrapLines
                ? "text-foreground bg-accent"
                : "text-muted-foreground",
            )}
            onClick={() => useSearchUiStore.getState().toggleWrapLines(alias)}
          >
            ↩
          </button>
          <button
            type="button"
            aria-label="Previous match"
            title="Previous match (Shift+Up)"
            className="min-w-7 min-h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            disabled={results.length === 0}
            onClick={() => useSearchUiStore.getState().prevMatch(alias)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Next match"
            title="Next match (Shift+Down)"
            className="min-w-7 min-h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            disabled={results.length === 0}
            onClick={() => useSearchUiStore.getState().nextMatch(alias)}
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Close search results"
            title="Close search results"
            className="min-w-7 min-h-7 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => useSearchUiStore.getState().closePanel(alias)}
          >
            ×
          </button>
        </div>
      </div>

      {truncated && totalCount <= PAGE_SIZE && (
        <p className="text-xs text-muted-foreground">
          Showing the first {results.length} matches.
        </p>
      )}

      {results.length === 0 ? (
        <p className="text-xs text-muted-foreground">No matches found.</p>
      ) : (
        <div className="relative">
          {isPageLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <span className="text-xs text-muted-foreground">Loading…</span>
            </div>
          )}
          <ul className={cn(
            "flex max-h-48 flex-col gap-1 overflow-y-auto text-xs",
            wrapLines ? "" : "overflow-x-auto",
          )}>
            {results.map((match, index) => (
              <li key={match.line_index}>
                <button
                  ref={(element) => {
                    if (element) {
                      entryRefs.current.set(match.line_index, element);
                    } else {
                      entryRefs.current.delete(match.line_index);
                    }
                  }}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 border-2 text-left hover:bg-accent",
                    match.line_index === selectedLine
                      ? "border-selected-line"
                      : "border-transparent",
                  )}
                  onClick={() =>
                    useSearchUiStore.getState().selectMatch(alias, index)
                  }
                >
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {match.line_index}
                  </span>
                  <span
                    className={cn(
                      "flex-1 font-mono",
                      wrapLines
                        ? "whitespace-pre-wrap break-all"
                        : "whitespace-pre",
                    )}
                  >
                    {match.content}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button
            type="button"
            aria-label="Previous page"
            className="rounded px-2 py-1 hover:bg-accent disabled:opacity-50"
            disabled={currentPage === 0}
            onClick={() => {
              const slice = useSearchUiStore.getState().slices[alias];
              if (!slice) return;
              useSearchUiStore.getState().setPageLoading(alias, true);
              void runSearch(
                slice.query,
                slice.searchType,
                slice.timeFrom,
                slice.timeTo,
                (currentPage - 1) * PAGE_SIZE,
              );
            }}
          >
            ← Previous page
          </button>
          <span>
            Page {currentPage + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
          </span>
          <button
            type="button"
            aria-label="Next page"
            className="rounded px-2 py-1 hover:bg-accent disabled:opacity-50"
            disabled={!truncated}
            onClick={() => {
              const slice = useSearchUiStore.getState().slices[alias];
              if (!slice) return;
              useSearchUiStore.getState().setPageLoading(alias, true);
              void runSearch(
                slice.query,
                slice.searchType,
                slice.timeFrom,
                slice.timeTo,
                (currentPage + 1) * PAGE_SIZE,
              );
            }}
          >
            Next page →
          </button>
        </div>
      )}
    </div>
  );
}
