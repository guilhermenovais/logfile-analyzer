import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHistoryEntry, SearchWithContextBatch } from "@/bindings";
import { useSearch } from "./useSearch";

const { searchWithContext, getSearchHistory } = vi.hoisted(() => ({
  searchWithContext: vi.fn(),
  getSearchHistory: vi.fn(),
}));

vi.mock("@/ipc/search", () => ({ searchWithContext, getSearchHistory }));

const historyEntry: SearchHistoryEntry = {
  id: 1,
  file_id: 1,
  query: '"error" AND "db"',
  search_type: "logical",
  time_from: null,
  time_to: null,
  executed_at: "2026-01-01T00:00:00Z",
};

describe("useSearch", () => {
  beforeEach(() => {
    searchWithContext.mockReset();
    getSearchHistory.mockReset();
  });

  it("runSearch streams results and refreshes history", async () => {
    searchWithContext.mockImplementation(
      async (
        _alias: string,
        _query: string,
        _searchType: string,
        _surroundingCount: number | null,
        _timeFrom: number | null,
        _timeTo: number | null,
        onBatch: (batch: SearchWithContextBatch) => void,
      ) => {
        onBatch({
          matches: [
            {
              line_index: 3,
              before: [{ line_index: 2, content: "connecting to db" }],
              match: { line_index: 3, content: "an error talking to db" },
              after: [{ line_index: 4, content: "recovered" }],
            },
          ],
          truncated: false,
        });
      },
    );
    getSearchHistory.mockResolvedValue([historyEntry]);

    const { result } = renderHook(() => useSearch("app"));

    await act(async () => {
      await result.current.runSearch('"error" AND "db"', "logical");
    });

    expect(searchWithContext).toHaveBeenCalledWith(
      "app",
      '"error" AND "db"',
      "logical",
      null,
      null,
      null,
      expect.any(Function),
    );
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].match.content).toBe(
      "an error talking to db",
    );
    expect(result.current.truncated).toBe(false);
    expect(result.current.history).toEqual([historyEntry]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error when the search fails", async () => {
    searchWithContext.mockRejectedValue(new Error("InvalidQuery"));

    const { result } = renderHook(() => useSearch("app"));

    await act(async () => {
      await result.current.runSearch("(", "regex");
    });

    expect(result.current.error).toBe("InvalidQuery");
    expect(result.current.isSearching).toBe(false);
    expect(getSearchHistory).not.toHaveBeenCalled();
  });

  it("does nothing when alias is null or query is blank", async () => {
    const { result } = renderHook(() => useSearch(null));

    await act(async () => {
      await result.current.runSearch('"error"', "logical");
    });

    expect(searchWithContext).not.toHaveBeenCalled();

    const { result: result2 } = renderHook(() => useSearch("app"));

    await act(async () => {
      await result2.current.runSearch("   ", "logical");
    });

    expect(searchWithContext).not.toHaveBeenCalled();
  });

  it("resets results and history when the alias changes", async () => {
    searchWithContext.mockImplementation(
      async (
        _alias: string,
        _query: string,
        _searchType: string,
        _surroundingCount: number | null,
        _timeFrom: number | null,
        _timeTo: number | null,
        onBatch: (batch: SearchWithContextBatch) => void,
      ) => {
        onBatch({
          matches: [
            {
              line_index: 1,
              before: [],
              match: { line_index: 1, content: "match" },
              after: [],
            },
          ],
          truncated: false,
        });
      },
    );
    getSearchHistory.mockResolvedValue([historyEntry]);

    const { result, rerender } = renderHook(({ alias }) => useSearch(alias), {
      initialProps: { alias: "a" as string | null },
    });

    await act(async () => {
      await result.current.runSearch('"match"', "logical");
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
      expect(result.current.history).toHaveLength(1);
    });

    rerender({ alias: "b" });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(0);
      expect(result.current.history).toHaveLength(0);
    });
  });
});
