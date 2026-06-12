import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogViewer } from "./LogViewer";
import type { UseLogStreamResult } from "@/hooks/useLogStream";

const { useLogStream } = vi.hoisted(() => ({
  useLogStream: vi.fn(),
}));

vi.mock("@/hooks/useLogStream", () => ({ useLogStream }));

// jsdom has no layout engine, so `@tanstack/react-virtual` would see a 0px
// viewport and render nothing. Stand in with a virtualizer that renders every
// row, leaving the windowing logic itself to the library's own test suite.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: () => number;
  }) => {
    const size = estimateSize();
    const items = Array.from({ length: count }, (_, index) => ({
      key: index,
      index,
      start: index * size,
      size,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
    };
  },
}));

function mockResult(overrides: Partial<UseLogStreamResult> = {}): UseLogStreamResult {
  return {
    lines: new Map(),
    totalLines: 0,
    indexingComplete: true,
    loadRange: vi.fn(),
    ...overrides,
  };
}

describe("LogViewer", () => {
  beforeEach(() => {
    useLogStream.mockReset();
  });

  it("renders streamed lines for the given alias", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 3,
        lines: new Map([
          [1, "first line"],
          [2, "second line"],
          [3, "third line"],
        ]),
      }),
    );

    render(<LogViewer alias="app" />);

    expect(useLogStream).toHaveBeenCalledWith("app");
    expect(screen.getByText("first line")).toBeInTheDocument();
    expect(screen.getByText("second line")).toBeInTheDocument();
    expect(screen.getByText("third line")).toBeInTheDocument();
  });

  it("requests the visible range on mount via loadRange", () => {
    const loadRange = vi.fn();
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 3,
        lines: new Map([
          [1, "first line"],
          [2, "second line"],
          [3, "third line"],
        ]),
        loadRange,
      }),
    );

    render(<LogViewer alias="app" />);

    expect(loadRange).toHaveBeenCalled();
  });

  it("toggles line wrap, defaulting to off", async () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        lines: new Map([[1, "a very long line of log output"]]),
      }),
    );

    render(<LogViewer alias="app" />);

    const line = screen.getByText("a very long line of log output");
    expect(line).toHaveStyle({ whiteSpace: "pre" });

    const toggle = screen.getByRole("checkbox", { name: /wrap/i });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(line).toHaveStyle({ whiteSpace: "pre-wrap" });
  });
});
