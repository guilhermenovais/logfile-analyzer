import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogViewer } from "./LogViewer";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import type { UseLogStreamResult } from "@/hooks/useLogStream";

const { useLogStream, scrollToIndex } = vi.hoisted(() => ({
  useLogStream: vi.fn(),
  scrollToIndex: vi.fn(),
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
      scrollToIndex,
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
    scrollToIndex.mockReset();
    useLineSelectionStore.setState({ slices: {} });
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "",
    } as Selection);
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

    render(<LogViewer alias="app" wrap={false} />);

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

    render(<LogViewer alias="app" wrap={false} />);

    expect(loadRange).toHaveBeenCalled();
  });

  it("renders lines with whiteSpace driven by the wrap prop", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        lines: new Map([[1, "a very long line of log output"]]),
      }),
    );

    const { rerender } = render(<LogViewer alias="app" wrap={false} />);

    const line = screen.getByText("a very long line of log output");
    expect(line).toHaveStyle({ whiteSpace: "pre" });

    rerender(<LogViewer alias="app" wrap={true} />);

    expect(line).toHaveStyle({ whiteSpace: "pre-wrap" });
  });

  it("marks lines in searchMatchLines with bg-search-match", () => {
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

    render(<LogViewer alias="app" wrap={false} searchMatchLines={[1, 3]} />);

    const firstRow = screen.getByText("first line").closest("div");
    const secondRow = screen.getByText("second line").closest("div");
    const thirdRow = screen.getByText("third line").closest("div");

    expect(firstRow).toHaveClass("bg-search-match");
    expect(secondRow).not.toHaveClass("bg-search-match");
    expect(thirdRow).toHaveClass("bg-search-match");
  });

  it("combines bg-search-match with the existing star-highlight class", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        lines: new Map([[1, "first line"]]),
      }),
    );

    render(
      <LogViewer
        alias="app"
        wrap={false}
        searchMatchLines={[1]}
        highlights={[{ line_index: 1, content: "first line", label: null, origin: "user" }]}
      />,
    );

    const row = screen.getByText("first line").closest("div");
    expect(row).toHaveClass("bg-accent");
    expect(row).toHaveClass("ring-search-match");
  });

  it("scrolls to scrollToLine.lineIndex when its nonce changes", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 5,
        lines: new Map([
          [1, "one"],
          [2, "two"],
          [3, "three"],
          [4, "four"],
          [5, "five"],
        ]),
      }),
    );

    const { rerender } = render(
      <LogViewer alias="app" wrap={false} scrollToLine={{ lineIndex: 3, nonce: 1 }} />,
    );

    expect(scrollToIndex).toHaveBeenCalledWith(2, { align: "center" });

    scrollToIndex.mockClear();

    // Same lineIndex, new nonce: should scroll again.
    rerender(<LogViewer alias="app" wrap={false} scrollToLine={{ lineIndex: 3, nonce: 2 }} />);

    expect(scrollToIndex).toHaveBeenCalledWith(2, { align: "center" });
  });

  it("does not scroll when scrollToLine is null", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        lines: new Map([[1, "one"]]),
      }),
    );

    render(<LogViewer alias="app" wrap={false} scrollToLine={null} />);

    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it("selects a line on click and shows border-selected-line (FR-001/FR-002, normal view)", async () => {
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

    render(<LogViewer alias="app" wrap={false} />);

    await userEvent.click(screen.getByText("second line"));

    expect(useLineSelectionStore.getState().slices["app"].selectedLine).toBe(
      2,
    );
    expect(screen.getByText("second line").closest("div")).toHaveClass(
      "border-selected-line",
    );
    expect(screen.getByText("first line").closest("div")).not.toHaveClass(
      "border-selected-line",
    );
  });

  it("selects a line on click in the 'Highlighted only' view (FR-017)", async () => {
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

    render(
      <LogViewer
        alias="app"
        wrap={false}
        highlightedOnly={true}
        highlights={[
          { line_index: 1, content: "first line", label: null, origin: "user" },
          { line_index: 3, content: "third line", label: null, origin: "user" },
        ]}
      />,
    );

    await userEvent.click(screen.getByText("third line"));

    expect(useLineSelectionStore.getState().slices["app"].selectedLine).toBe(
      3,
    );
    expect(screen.getByText("third line").closest("div")).toHaveClass(
      "border-selected-line",
    );
  });
});
