import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchMatchBatch } from "@/bindings";
import { getSearchUiSlice, useSearchUiStore } from "./useSearchUiStore";
import { useSearch } from "./useSearch";

const { search } = vi.hoisted(() => ({
  search: vi.fn(),
}));

vi.mock("@/ipc/search", () => ({ search }));

describe("useSearch", () => {
  beforeEach(() => {
    search.mockReset();
    useSearchUiStore.setState({ slices: {} });
  });

  it("runSearch calls the search IPC wrapper and writes results into useSearchUiStore", async () => {
    search.mockImplementation(
      async (
        _alias: string,
        _query: string,
        _searchType: string,
        _timeFrom: number | null,
        _timeTo: number | null,
        onBatch: (batch: SearchMatchBatch) => void,
      ) => {
        onBatch({
          matches: [{ line_index: 3, content: "an error talking to db" }],
          truncated: false,
        });
      },
    );

    const { result } = renderHook(() => useSearch("app"));

    await act(async () => {
      await result.current.runSearch('"error" AND "db"', "logical");
    });

    expect(search).toHaveBeenCalledWith(
      "app",
      '"error" AND "db"',
      "logical",
      null,
      null,
      expect.any(Function),
    );

    const slice = getSearchUiSlice("app");
    expect(slice.results).toEqual([
      { line_index: 3, content: "an error talking to db" },
    ]);
    expect(slice.truncated).toBe(false);
    expect(slice.panelOpen).toBe(true);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error when the search fails", async () => {
    search.mockRejectedValue(new Error("InvalidQuery"));

    const { result } = renderHook(() => useSearch("app"));

    await act(async () => {
      await result.current.runSearch("(", "regex");
    });

    expect(result.current.error).toBe("InvalidQuery");
    expect(result.current.isSearching).toBe(false);
  });

  it("does nothing when alias is null or query is blank", async () => {
    const { result } = renderHook(() => useSearch(null));

    await act(async () => {
      await result.current.runSearch('"error"', "logical");
    });

    expect(search).not.toHaveBeenCalled();

    const { result: result2 } = renderHook(() => useSearch("app"));

    await act(async () => {
      await result2.current.runSearch("   ", "logical");
    });

    expect(search).not.toHaveBeenCalled();
  });
});
