import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveViewRow = vi.hoisted(() => vi.fn());
vi.mock("@/ipc/viewing", () => ({ resolveViewRow }));

import { useScrollToLine } from "./useScrollToLine";

function makeVirtualizer() {
  return {
    scrollToIndex: vi.fn(),
  };
}

describe("useScrollToLine", () => {
  beforeEach(() => {
    resolveViewRow.mockReset();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  it("resolves view row via IPC and calls scrollToIndex with 0-based index", async () => {
    resolveViewRow.mockResolvedValue(3);
    const virtualizer = makeVirtualizer();

    renderHook(() =>
      useScrollToLine({
        alias: "app",
        virtualizer: virtualizer as never,
        scrollTarget: { lineIndex: 10, nonce: 1 },
        totalLines: 100,
      }),
    );

    await vi.waitFor(() => {
      expect(resolveViewRow).toHaveBeenCalledWith("app", 10);
    });

    await vi.waitFor(() => {
      expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(2, {
        align: "center",
      });
    });
  });

  it("fires correction pass after requestAnimationFrame", async () => {
    resolveViewRow.mockResolvedValue(5);
    const virtualizer = makeVirtualizer();

    renderHook(() =>
      useScrollToLine({
        alias: "app",
        virtualizer: virtualizer as never,
        scrollTarget: { lineIndex: 20, nonce: 1 },
        totalLines: 100,
      }),
    );

    await vi.waitFor(() => {
      expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(2);
    });

    expect(virtualizer.scrollToIndex).toHaveBeenNthCalledWith(1, 4, {
      align: "center",
    });
    expect(virtualizer.scrollToIndex).toHaveBeenNthCalledWith(2, 4, {
      align: "center",
    });
  });

  it("cancels stale correction on rapid successive calls", async () => {
    let resolveFirst!: (value: number) => void;
    const firstPromise = new Promise<number>((r) => {
      resolveFirst = r;
    });
    resolveViewRow.mockReturnValueOnce(firstPromise);
    resolveViewRow.mockResolvedValueOnce(8);
    const virtualizer = makeVirtualizer();

    const { rerender } = renderHook(
      ({ target }) =>
        useScrollToLine({
          alias: "app",
          virtualizer: virtualizer as never,
          scrollTarget: target,
          totalLines: 100,
        }),
      { initialProps: { target: { lineIndex: 10, nonce: 1 } } },
    );

    rerender({ target: { lineIndex: 50, nonce: 2 } });

    await act(async () => {
      resolveFirst(3);
    });

    await vi.waitFor(() => {
      expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(7, {
        align: "center",
      });
    });

    for (const call of virtualizer.scrollToIndex.mock.calls) {
      expect(call[0]).toBe(7);
    }
  });

  it("re-scrolls on same lineIndex with new nonce", async () => {
    resolveViewRow.mockResolvedValue(3);
    const virtualizer = makeVirtualizer();

    const { rerender } = renderHook(
      ({ target }) =>
        useScrollToLine({
          alias: "app",
          virtualizer: virtualizer as never,
          scrollTarget: target,
          totalLines: 100,
        }),
      { initialProps: { target: { lineIndex: 10, nonce: 1 } } },
    );

    await vi.waitFor(() => {
      expect(virtualizer.scrollToIndex).toHaveBeenCalled();
    });

    virtualizer.scrollToIndex.mockClear();
    resolveViewRow.mockResolvedValue(3);

    rerender({ target: { lineIndex: 10, nonce: 2 } });

    await vi.waitFor(() => {
      expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(2, {
        align: "center",
      });
    });
  });

  it("correction pass fires via requestAnimationFrame for variable-height rows", async () => {
    resolveViewRow.mockResolvedValue(10);
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });
    const virtualizer = makeVirtualizer();

    renderHook(() =>
      useScrollToLine({
        alias: "app",
        virtualizer: virtualizer as never,
        scrollTarget: { lineIndex: 100, nonce: 1 },
        totalLines: 200,
      }),
    );

    await vi.waitFor(() => {
      expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(2);
    });

    expect(rafSpy).toHaveBeenCalled();
    expect(virtualizer.scrollToIndex).toHaveBeenNthCalledWith(1, 9, {
      align: "center",
    });
    expect(virtualizer.scrollToIndex).toHaveBeenNthCalledWith(2, 9, {
      align: "center",
    });
  });

  it("uses resolved view-row (not raw line index) for scrollToIndex under filter", async () => {
    resolveViewRow.mockResolvedValue(7);
    const virtualizer = makeVirtualizer();

    renderHook(() =>
      useScrollToLine({
        alias: "app",
        virtualizer: virtualizer as never,
        scrollTarget: { lineIndex: 500, nonce: 1 },
        totalLines: 50,
      }),
    );

    await vi.waitFor(() => {
      expect(resolveViewRow).toHaveBeenCalledWith("app", 500);
      expect(virtualizer.scrollToIndex).toHaveBeenCalledWith(6, {
        align: "center",
      });
    });
  });

  it("does nothing when scrollTarget is null", () => {
    const virtualizer = makeVirtualizer();

    renderHook(() =>
      useScrollToLine({
        alias: "app",
        virtualizer: virtualizer as never,
        scrollTarget: null,
        totalLines: 100,
      }),
    );

    expect(resolveViewRow).not.toHaveBeenCalled();
    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  });
});
