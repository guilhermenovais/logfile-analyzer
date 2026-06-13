import { useState, type FormEvent } from "react";
import { useSearch } from "@/hooks/useSearch";
import type { SearchHistoryEntry, SearchType } from "@/ipc/search";

export interface SearchBarProps {
  /** Workspace alias of the file to search, or `null` if none is selected. */
  alias: string | null;
  /** Whether the active file has a detected timestamp format (FR-011–FR-013). */
  hasTimestampFormat: boolean;
}

/**
 * Converts epoch-ms to a value suitable for an `<input type="datetime-local">`,
 * rendered in the user's local time zone.
 */
function toDatetimeLocalValue(epochMs: number): string {
  const date = new Date(epochMs);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

/**
 * Parses an `<input type="datetime-local">` value (local time) to epoch-ms,
 * or `null` if empty.
 */
function fromDatetimeLocalValue(value: string): number | null {
  if (value === "") {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Logical-expression/regex search bar (FR-021–FR-025): runs
 * `search_with_context` for the active file, and shows live results and
 * search history (FR-024). Supports restricting results to a time range
 * (FR-012/FR-013) when the file has a detected timestamp format.
 */
export function SearchBar({ alias, hasTimestampFormat }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("logical");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const { results, truncated, history, isSearching, error, runSearch } =
    useSearch(alias);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void runSearch(
      query,
      searchType,
      hasTimestampFormat ? fromDatetimeLocalValue(timeFrom) : null,
      hasTimestampFormat ? fromDatetimeLocalValue(timeTo) : null,
    );
  }

  function handleHistorySelect(entry: SearchHistoryEntry) {
    setQuery(entry.query);
    setSearchType(entry.search_type);
    setTimeFrom(
      entry.time_from !== null ? toDatetimeLocalValue(entry.time_from) : "",
    );
    setTimeTo(entry.time_to !== null ? toDatetimeLocalValue(entry.time_to) : "");
    void runSearch(entry.query, entry.search_type, entry.time_from, entry.time_to);
  }

  return (
    <div className="flex flex-col gap-2 border-b p-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          placeholder={
            searchType === "logical" ? '"error" AND "db"' : "err.*"
          }
          aria-label="Search query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!alias}
        />
        <select
          aria-label="Search type"
          className="rounded border px-2 py-1 text-sm"
          value={searchType}
          onChange={(event) => setSearchType(event.target.value as SearchType)}
          disabled={!alias}
        >
          <option value="logical">Logical</option>
          <option value="regex">Regex</option>
        </select>
        <button
          type="submit"
          disabled={!alias || isSearching || query.trim() === ""}
          className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {hasTimestampFormat && (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-1">
          From
          <input
            type="datetime-local"
            aria-label="Time range from"
            className="rounded border px-2 py-1"
            value={timeFrom}
            onChange={(event) => setTimeFrom(event.target.value)}
            disabled={!alias}
          />
        </label>
        <label className="flex items-center gap-1">
          To
          <input
            type="datetime-local"
            aria-label="Time range to"
            className="rounded border px-2 py-1"
            value={timeTo}
            onChange={(event) => setTimeTo(event.target.value)}
            disabled={!alias}
          />
        </label>
        {(timeFrom !== "" || timeTo !== "") && (
          <button
            type="button"
            className="hover:underline"
            onClick={() => {
              setTimeFrom("");
              setTimeTo("");
            }}
          >
            Clear
          </button>
        )}
      </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {results.length > 0 && (
        <div className="max-h-48 overflow-auto text-sm">
          {truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the first {results.length} matches.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {results.map((match) => (
              <li key={match.line_index} className="font-mono text-xs">
                {match.before.map((line) => (
                  <div
                    key={line.line_index}
                    className="text-muted-foreground"
                  >
                    {line.line_index}: {line.content}
                  </div>
                ))}
                <div className="bg-accent">
                  {match.match.line_index}: {match.match.content}
                </div>
                {match.after.map((line) => (
                  <div
                    key={line.line_index}
                    className="text-muted-foreground"
                  >
                    {line.line_index}: {line.content}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <p className="font-semibold">History</p>
          <ul className="flex flex-col gap-1">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => handleHistorySelect(entry)}
                >
                  {entry.query} ({entry.search_type})
                  {(entry.time_from !== null || entry.time_to !== null) &&
                    ` [${
                      entry.time_from !== null
                        ? toDatetimeLocalValue(entry.time_from)
                        : "…"
                    } – ${
                      entry.time_to !== null
                        ? toDatetimeLocalValue(entry.time_to)
                        : "…"
                    }]`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
