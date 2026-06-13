import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHistoryEntry } from "@/bindings";
import { useSearchHistory } from "./useSearchHistory";

const { getSearchHistory } = vi.hoisted(() => ({
  getSearchHistory: vi.fn(),
}));

vi.mock("@/ipc/search", () => ({ getSearchHistory }));

const entries: SearchHistoryEntry[] = [
  {
    id: 3,
    workspace_id: 1,
    query: "newest",
    search_type: "logical",
    time_from: null,
    time_to: null,
    last_used_at: "2026-06-12T10:02:00.000Z",
  },
  {
    id: 2,
    workspace_id: 1,
    query: '"error" AND "db"',
    search_type: "logical",
    time_from: null,
    time_to: null,
    last_used_at: "2026-06-12T10:01:00.000Z",
  },
  {
    id: 1,
    workspace_id: 1,
    query: "db timeout",
    search_type: "regex",
    time_from: null,
    time_to: null,
    last_used_at: "2026-06-12T10:00:00.000Z",
  },
];

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useSearchHistory", () => {
  beforeEach(() => {
    getSearchHistory.mockReset();
  });

  it("fetches the workspace's history via getSearchHistory() with no params (FR-013)", async () => {
    getSearchHistory.mockResolvedValue(entries);

    const { result } = renderHook(() => useSearchHistory(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSearchHistory).toHaveBeenCalledWith();
    expect(result.current.history).toEqual(entries);
  });

  describe("suggestions", () => {
    it("returns the 5 most-recent entries when queryText is empty", async () => {
      const many: SearchHistoryEntry[] = Array.from({ length: 7 }, (_, i) => ({
        id: i,
        workspace_id: 1,
        query: `query-${i}`,
        search_type: "logical",
        time_from: null,
        time_to: null,
        last_used_at: `2026-06-12T10:0${i}:00.000Z`,
      }));
      getSearchHistory.mockResolvedValue(many);

      const { result } = renderHook(() => useSearchHistory(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const suggestions = result.current.suggestions("");
      expect(suggestions).toHaveLength(5);
      expect(suggestions).toEqual(many.slice(0, 5));
    });

    it("returns up to 5 most-recent entries whose query contains queryText (FR-010)", async () => {
      getSearchHistory.mockResolvedValue(entries);

      const { result } = renderHook(() => useSearchHistory(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const suggestions = result.current.suggestions("db");
      expect(suggestions.map((e) => e.query)).toEqual([
        '"error" AND "db"',
        "db timeout",
      ]);
    });

    it("returns an empty array when nothing matches", async () => {
      getSearchHistory.mockResolvedValue(entries);

      const { result } = renderHook(() => useSearchHistory(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.suggestions("nonexistent")).toEqual([]);
    });
  });
});
