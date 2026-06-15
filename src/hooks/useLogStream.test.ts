import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexProgress, LineBatch } from "@/bindings";
import { useLogStream } from "./useLogStream";

const { streamLines, subscribeIndexProgress, setViewTimeRange } = vi.hoisted(() => ({
  streamLines: vi.fn(),
  subscribeIndexProgress: vi.fn(),
  setViewTimeRange: vi.fn(),
}));

vi.mock("@/ipc/viewing", () => ({
  streamLines,
  subscribeIndexProgress,
  setViewTimeRange,
}));

describe("useLogStream", () => {
  beforeEach(() => {
    streamLines.mockReset();
    subscribeIndexProgress.mockReset();
    setViewTimeRange.mockReset();
  });

  it("subscribes to index progress on mount and exposes fileTotalLines/indexingComplete", async () => {
    subscribeIndexProgress.mockImplementation(
      async (_alias: string, onProgress: (progress: IndexProgress) => void) => {
        onProgress({ indexed_lines: 42, complete: true });
      },
    );

    const { result } = renderHook(() => useLogStream("app", null, null, false));

    await waitFor(() => {
      expect(result.current.fileTotalLines).toBe(42);
      expect(result.current.indexingComplete).toBe(true);
    });

    expect(subscribeIndexProgress).toHaveBeenCalledWith(
      "app",
      expect.any(Function),
    );
  });

  it("loadRange streams a batch and merges LineContent entries by view-row", async () => {
    subscribeIndexProgress.mockResolvedValue(undefined);
    streamLines.mockImplementation(
      async (
        _alias: string,
        _start: number,
        _count: number,
        onBatch: (batch: LineBatch) => void,
      ) => {
        onBatch({
          start_index: 5,
          lines: [
            { line_index: 8, content: "eight" },
            { line_index: 9, content: "nine" },
          ],
        });
      },
    );

    const { result } = renderHook(() => useLogStream("app", null, null, false));

    act(() => {
      result.current.loadRange(5, 2);
    });

    await waitFor(() => {
      expect(result.current.lines.get(5)).toEqual({ line_index: 8, content: "eight" });
      expect(result.current.lines.get(6)).toEqual({ line_index: 9, content: "nine" });
    });

    expect(streamLines).toHaveBeenCalledWith(
      "app",
      5,
      2,
      expect.any(Function),
    );
  });

  it("when hasTimestampFormat is false, never calls setViewTimeRange and totalLines tracks fileTotalLines", async () => {
    subscribeIndexProgress.mockImplementation(
      async (_alias: string, onProgress: (progress: IndexProgress) => void) => {
        onProgress({ indexed_lines: 42, complete: true });
      },
    );

    const { result } = renderHook(() => useLogStream("app", null, null, false));

    await waitFor(() => {
      expect(result.current.fileTotalLines).toBe(42);
      expect(result.current.totalLines).toBe(42);
    });

    expect(setViewTimeRange).not.toHaveBeenCalled();
  });

  it("when hasTimestampFormat is true, calls setViewTimeRange on (timeFrom, timeTo) changes and updates totalLines, clearing lines", async () => {
    subscribeIndexProgress.mockImplementation(
      async (_alias: string, onProgress: (progress: IndexProgress) => void) => {
        onProgress({ indexed_lines: 100, complete: true });
      },
    );
    streamLines.mockImplementation(
      async (
        _alias: string,
        _start: number,
        _count: number,
        onBatch: (batch: LineBatch) => void,
      ) => {
        onBatch({ start_index: 1, lines: [{ line_index: 1, content: "one" }] });
      },
    );
    setViewTimeRange.mockResolvedValue(100);

    const { result, rerender } = renderHook(
      ({ timeFrom, timeTo }: { timeFrom: number | null; timeTo: number | null }) =>
        useLogStream("app", timeFrom, timeTo, true),
      { initialProps: { timeFrom: null as number | null, timeTo: null as number | null } },
    );

    await waitFor(() => {
      expect(setViewTimeRange).toHaveBeenCalledWith("app", null, null);
      expect(result.current.totalLines).toBe(100);
      expect(result.current.viewVersion).toBe(1);
    });

    act(() => {
      result.current.loadRange(1, 1);
    });
    await waitFor(() => {
      expect(result.current.lines.get(1)).toEqual({ line_index: 1, content: "one" });
    });

    setViewTimeRange.mockResolvedValue(10);
    rerender({ timeFrom: 1000, timeTo: 2000 });

    await waitFor(() => {
      expect(setViewTimeRange).toHaveBeenCalledWith("app", 1000, 2000);
      expect(result.current.totalLines).toBe(10);
      expect(result.current.lines.size).toBe(0);
      expect(result.current.viewVersion).toBe(2);
    });
  });

  it("resets lines and progress when the alias changes", async () => {
    subscribeIndexProgress.mockImplementation(
      async (alias: string, onProgress: (progress: IndexProgress) => void) => {
        onProgress({ indexed_lines: alias === "a" ? 10 : 20, complete: true });
      },
    );
    streamLines.mockImplementation(
      async (
        _alias: string,
        _start: number,
        _count: number,
        onBatch: (batch: LineBatch) => void,
      ) => {
        onBatch({ start_index: 1, lines: [{ line_index: 1, content: "a-line" }] });
      },
    );

    const { result, rerender } = renderHook(
      ({ alias }) => useLogStream(alias, null, null, false),
      { initialProps: { alias: "a" } },
    );

    act(() => {
      result.current.loadRange(1, 1);
    });
    await waitFor(() => {
      expect(result.current.lines.get(1)).toEqual({ line_index: 1, content: "a-line" });
      expect(result.current.fileTotalLines).toBe(10);
    });

    rerender({ alias: "b" });

    await waitFor(() => {
      expect(result.current.lines.size).toBe(0);
      expect(result.current.fileTotalLines).toBe(20);
    });
  });

  it("does nothing when alias is null", () => {
    const { result } = renderHook(() => useLogStream(null, null, null, false));

    act(() => {
      result.current.loadRange(1, 10);
    });

    expect(streamLines).not.toHaveBeenCalled();
    expect(subscribeIndexProgress).not.toHaveBeenCalled();
    expect(setViewTimeRange).not.toHaveBeenCalled();
    expect(result.current.lines.size).toBe(0);
    expect(result.current.totalLines).toBe(0);
    expect(result.current.fileTotalLines).toBe(0);
  });
});
