import { useState, type FormEvent } from "react";
import { Clock } from "lucide-react";
import type { SearchHistoryEntry } from "@/bindings";
import { useSearch } from "@/hooks/useSearch";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { DEFAULT_SEARCH_UI_STATE, useSearchUiStore } from "@/hooks/useSearchUiStore";
import type { SearchType } from "@/ipc/search";
import { SearchHistoryOverlay } from "./SearchHistoryOverlay";

export interface SearchBarProps {
  /** Workspace alias of the file to search, or `null` if none is selected. */
  alias: string | null;
  /** Whether the active file has a detected timestamp format (FR-011–FR-013). */
  hasTimestampFormat: boolean;
}

/**
 * Logical-expression/regex search bar (FR-021–FR-025): runs `search` for the
 * active file (results are shown by `SearchResultsPanel`). The query,
 * search type, and time range are bound to `useSearchUiStore` so they survive
 * the results panel being closed (FR-008). Supports restricting results to a
 * time range (FR-012/FR-013) when the file has a detected timestamp format.
 */
const SUGGESTIONS_LIST_ID = "search-history-suggestions";

export function SearchBar({ alias, hasTimestampFormat }: SearchBarProps) {
  const { query, searchType, timeFrom, timeTo } = useSearchUiStore(
    (state) => state.slices[alias ?? ""] ?? DEFAULT_SEARCH_UI_STATE,
  );
  const { isSearching, error, runSearch } = useSearch(alias);
  const { history, suggestions } = useSearchHistory();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const suggestionEntries = suggestions(query);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(
      query,
      searchType,
      hasTimestampFormat ? timeFrom : null,
      hasTimestampFormat ? timeTo : null,
    );
  }

  /** Applies a history entry (FR-018) and immediately re-runs the search. */
  function applyHistoryEntry(entry: SearchHistoryEntry) {
    if (!alias) return;
    useSearchUiStore.getState().applyHistoryEntry(alias, entry);
    setShowSuggestions(false);
    setHistoryOpen(false);
    void runSearch(entry.query, entry.search_type, entry.time_from, entry.time_to);
  }

  return (
    <div className="flex flex-col gap-2 border-b p-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            className="h-9 w-full rounded border px-2 text-sm"
            placeholder={
              searchType === "logical" ? '"error" AND "db"' : "err.*"
            }
            aria-label="Search query"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls={SUGGESTIONS_LIST_ID}
            aria-autocomplete="list"
            value={query}
            onChange={(event) =>
              alias && useSearchUiStore.getState().setQuery(alias, event.target.value)
            }
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            disabled={!alias}
          />
          {showSuggestions && (
            <ul
              role="listbox"
              id={SUGGESTIONS_LIST_ID}
              className="absolute top-full left-0 z-10 mt-1 flex max-h-48 w-full flex-col gap-1 overflow-auto rounded border bg-background p-1 text-xs shadow-lg"
            >
              {suggestionEntries.length === 0 ? (
                <li className="px-2 py-1 text-muted-foreground">
                  No recent searches yet.
                </li>
              ) : (
                suggestionEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="w-full truncate rounded px-2 py-1 text-left font-mono hover:bg-accent"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyHistoryEntry(entry)}
                    >
                      {entry.query}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <select
          aria-label="Search type"
          className="h-9 rounded border px-2 text-sm"
          value={searchType}
          onChange={(event) =>
            alias &&
            useSearchUiStore
              .getState()
              .setSearchType(alias, event.target.value as SearchType)
          }
          disabled={!alias}
        >
          <option value="logical">Logical</option>
          <option value="regex">Regex</option>
        </select>
        <button
          type="submit"
          disabled={!alias || isSearching || query.trim() === ""}
          className="h-9 rounded bg-primary px-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          Search
        </button>
        <button
          type="button"
          aria-label="Search history"
          className="flex h-9 w-9 items-center justify-center rounded text-sm hover:bg-accent disabled:opacity-50"
          onClick={() => setHistoryOpen(true)}
          disabled={!alias}
        >
          <Clock size={16} />
        </button>
      </form>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <SearchHistoryOverlay
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entries={history}
        onSelect={applyHistoryEntry}
      />
    </div>
  );
}
