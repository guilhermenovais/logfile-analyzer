import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexProgress, LineBatch } from "@/bindings";
import { useLogStream } from "./useLogStream";

const { streamLines, subscribeIndexProgress } = vi.hoisted(() => ({
  streamLines: vi.fn(),
  subscribeIndexProgress: vi.fn(),
}));

vi.mock("@/ipc/viewing", () => ({ streamLines, subscribeIndexProgress }));

describe("useLogStream", () => {
  beforeEach(() => {
    streamLines.mockReset();
    subscribeIndexProgress.mockReset();
  });

  it("subscribes to index progress on mount and exposes totalLines/indexingComplete", async () => {
    subscribeIndexProgress.mockImplementation(
      async (_alias: string, onProgress: (progress: IndexProgress) => void) => {
        onProgress({ indexed_lines: 42, complete: true });
      },
    );

    const { result } = renderHook(() => useLogStream("app"));

    await waitFor(() => {
      expect(result.current.totalLines).toBe(42);
      expect(result.current.indexingComplete).toBe(true);
    });

    expect(subscribeIndexProgress).toHaveBeenCalledWith(
      "app",
      expect.any(Function),
    );
  });

  it("loadRange streams a batch and merges it into lines by 1-based index", async () => {
    subscribeIndexProgress.mockResolvedValue(undefined);
    streamLines.mockImplementation(
      async (
        _alias: string,
        _start: number,
        _count: number,
        onBatch: (batch: LineBatch) => void,
      ) => {
        onBatch({ start_index: 5, lines: ["five", "six"] });
      },
    );

    const { result } = renderHook(() => useLogStream("app"));

    act(() => {
      result.current.loadRange(5, 2);
    });

    await waitFor(() => {
      expect(result.current.lines.get(5)).toBe("five");
      expect(result.current.lines.get(6)).toBe("six");
    });

    expect(streamLines).toHaveBeenCalledWith(
      "app",
      5,
      2,
      expect.any(Function),
    );
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
        onBatch({ start_index: 1, lines: ["a-line"] });
      },
    );

    const { result, rerender } = renderHook(({ alias }) => useLogStream(alias), {
      initialProps: { alias: "a" },
    });

    act(() => {
      result.current.loadRange(1, 1);
    });
    await waitFor(() => {
      expect(result.current.lines.get(1)).toBe("a-line");
      expect(result.current.totalLines).toBe(10);
    });

    rerender({ alias: "b" });

    await waitFor(() => {
      expect(result.current.lines.size).toBe(0);
      expect(result.current.totalLines).toBe(20);
    });
  });

  it("does nothing when alias is null", () => {
    const { result } = renderHook(() => useLogStream(null));

    act(() => {
      result.current.loadRange(1, 10);
    });

    expect(streamLines).not.toHaveBeenCalled();
    expect(subscribeIndexProgress).not.toHaveBeenCalled();
    expect(result.current.lines.size).toBe(0);
    expect(result.current.totalLines).toBe(0);
  });
});
