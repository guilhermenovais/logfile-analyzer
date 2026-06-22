import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogViewer } from "./LogViewer";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import {
  DEFAULT_SEARCH_UI_STATE,
  useSearchUiStore,
} from "@/hooks/useSearchUiStore";
import type { UseLogStreamResult } from "@/hooks/useLogStream";
import type { LineContent } from "@/bindings";

const { useLogStream, scrollToIndex, scrollToOffset, measureElement, measure, resolveViewRow } = vi.hoisted(() => ({
  useLogStream: vi.fn(),
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  measureElement: vi.fn(),
  measure: vi.fn(),
  resolveViewRow: vi.fn(),
}));

vi.mock("@/hooks/useLogStream", () => ({ useLogStream }));
vi.mock("@/ipc/viewing", () => ({ resolveViewRow }));

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
      scrollToOffset,
      measureElement,
      measure,
    };
  },
}));

function lineContentMap(entries: [number, LineContent][]): Map<number, LineContent> {
  return new Map(entries);
}

function content(lineIndex: number, text: string): LineContent {
  return { line_index: lineIndex, content: text };
}

function mockResult(overrides: Partial<UseLogStreamResult> = {}): UseLogStreamResult {
  return {
    lines: new Map(),
    totalLines: 0,
    fileTotalLines: 0,
    indexingComplete: true,
    loadRange: vi.fn(),
    viewVersion: 0,
    ...overrides,
  };
}

describe("LogViewer", () => {
  beforeEach(() => {
    useLogStream.mockReset();
    scrollToIndex.mockReset();
    scrollToOffset.mockReset();
    measureElement.mockReset();
    measure.mockReset();
    resolveViewRow.mockReset();
    resolveViewRow.mockImplementation((_alias: string, lineIndex: number) =>
      Promise.resolve(lineIndex),
    );
    useLineSelectionStore.setState({ slices: {} });
    useSearchUiStore.setState({ slices: {} });
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "",
    } as Selection);
  });

  it("renders streamed lines for the given alias", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 3,
        fileTotalLines: 3,
        lines: lineContentMap([
          [1, content(1, "first line")],
          [2, content(2, "second line")],
          [3, content(3, "third line")],
        ]),
      }),
    );

    render(<LogViewer alias="app" wrap={false} hasTimestampFormat={false} />);

    expect(useLogStream).toHaveBeenCalledWith("app", null, null, false);
    expect(screen.getByText("first line")).toBeInTheDocument();
    expect(screen.getByText("second line")).toBeInTheDocument();
    expect(screen.getByText("third line")).toBeInTheDocument();
  });

  it("passes timeFrom/timeTo from useSearchUiStore into useLogStream", () => {
    useSearchUiStore.setState({
      slices: {
        app: { ...DEFAULT_SEARCH_UI_STATE, timeFrom: 1000, timeTo: 2000 },
      },
    });
    useLogStream.mockReturnValue(mockResult());

    render(<LogViewer alias="app" wrap={false} hasTimestampFormat={true} />);

    expect(useLogStream).toHaveBeenCalledWith("app", 1000, 2000, true);
  });

  it("requests the visible range on mount via loadRange", () => {
    const loadRange = vi.fn();
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 3,
        fileTotalLines: 3,
        lines: lineContentMap([
          [1, content(1, "first line")],
          [2, content(2, "second line")],
          [3, content(3, "third line")],
        ]),
        loadRange,
      }),
    );

    render(<LogViewer alias="app" wrap={false} hasTimestampFormat={false} />);

    expect(loadRange).toHaveBeenCalled();
  });

  it("resets scroll to the top and reloads the visible range when viewVersion changes", () => {
    const firstLoadRange = vi.fn();
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 100,
        fileTotalLines: 100,
        loadRange: firstLoadRange,
        viewVersion: 0,
      }),
    );

    const { rerender } = render(
      <LogViewer alias="app" wrap={false} hasTimestampFormat={true} />,
    );

    scrollToOffset.mockClear();
    firstLoadRange.mockClear();

    const secondLoadRange = vi.fn();
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 10,
        fileTotalLines: 100,
        loadRange: secondLoadRange,
        viewVersion: 1,
      }),
    );

    rerender(<LogViewer alias="app" wrap={false} hasTimestampFormat={true} />);

    expect(scrollToOffset).toHaveBeenCalledWith(0);
    expect(secondLoadRange).toHaveBeenCalled();
  });

  it("renders lines with whiteSpace driven by the wrap prop", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        fileTotalLines: 1,
        lines: lineContentMap([[1, content(1, "a very long line of log output")]]),
      }),
    );

    const { rerender } = render(
      <LogViewer alias="app" wrap={false} hasTimestampFormat={false} />,
    );

    const line = screen.getByText("a very long line of log output");
    expect(line).toHaveStyle({ whiteSpace: "pre" });

    rerender(<LogViewer alias="app" wrap={true} hasTimestampFormat={false} />);

    expect(line).toHaveStyle({ whiteSpace: "pre-wrap" });
  });

  it("marks lines in searchMatchLines with bg-search-match", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 3,
        fileTotalLines: 3,
        lines: lineContentMap([
          [1, content(1, "first line")],
          [2, content(2, "second line")],
          [3, content(3, "third line")],
        ]),
      }),
    );

    render(
      <LogViewer
        alias="app"
        wrap={false}
        hasTimestampFormat={false}
        searchMatchLines={[1, 3]}
      />,
    );

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
        fileTotalLines: 1,
        lines: lineContentMap([[1, content(1, "first line")]]),
      }),
    );

    render(
      <LogViewer
        alias="app"
        wrap={false}
        hasTimestampFormat={false}
        searchMatchLines={[1]}
        highlights={[{ line_index: 1, content: "first line", label: null, origin: "user" }]}
      />,
    );

    const row = screen.getByText("first line").closest("div");
    expect(row).toHaveClass("bg-accent");
    expect(row).toHaveClass("ring-search-match");
  });

  it("scrolls to scrollToLine.lineIndex via resolveViewRow IPC when nonce changes", async () => {
    resolveViewRow.mockResolvedValue(3);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 5,
        fileTotalLines: 5,
        lines: lineContentMap([
          [1, content(1, "one")],
          [2, content(2, "two")],
          [3, content(3, "three")],
          [4, content(4, "four")],
          [5, content(5, "five")],
        ]),
      }),
    );

    const { rerender } = render(
      <LogViewer
        alias="app"
        wrap={false}
        hasTimestampFormat={false}
        scrollToLine={{ lineIndex: 3, nonce: 1 }}
      />,
    );

    await vi.waitFor(() => {
      expect(resolveViewRow).toHaveBeenCalledWith("app", 3);
      expect(scrollToIndex).toHaveBeenCalledWith(2, { align: "center" });
    });

    scrollToIndex.mockClear();
    resolveViewRow.mockClear();
    resolveViewRow.mockResolvedValue(3);

    rerender(
      <LogViewer
        alias="app"
        wrap={false}
        hasTimestampFormat={false}
        scrollToLine={{ lineIndex: 3, nonce: 2 }}
      />,
    );

    await vi.waitFor(() => {
      expect(scrollToIndex).toHaveBeenCalledWith(2, { align: "center" });
    });
  });

  it("does not scroll when scrollToLine is null", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        fileTotalLines: 1,
        lines: lineContentMap([[1, content(1, "one")]]),
      }),
    );

    render(
      <LogViewer alias="app" wrap={false} hasTimestampFormat={false} scrollToLine={null} />,
    );

    expect(resolveViewRow).not.toHaveBeenCalled();
  });

  it("selects a line on click and shows border-selected-line (FR-001/FR-002, normal view)", async () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 3,
        fileTotalLines: 3,
        lines: lineContentMap([
          [1, content(1, "first line")],
          [2, content(2, "second line")],
          [3, content(3, "third line")],
        ]),
      }),
    );

    render(<LogViewer alias="app" wrap={false} hasTimestampFormat={false} />);

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
        fileTotalLines: 3,
        lines: lineContentMap([
          [1, content(1, "first line")],
          [2, content(2, "second line")],
          [3, content(3, "third line")],
        ]),
      }),
    );

    render(
      <LogViewer
        alias="app"
        wrap={false}
        hasTimestampFormat={false}
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

  it("narrowing the time range renders only in-range lines with their file lineIndex", () => {
    // `view_filter` hides file line 1; view-row 1/2 map to file lines 2/3.
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 2,
        fileTotalLines: 3,
        lines: lineContentMap([
          [1, content(2, "second line")],
          [2, content(3, "third line")],
        ]),
      }),
    );

    render(<LogViewer alias="app" wrap={false} hasTimestampFormat={true} />);

    expect(screen.queryByText("first line")).not.toBeInTheDocument();
    expect(screen.getByText("second line")).toBeInTheDocument();
    expect(screen.getByText("third line")).toBeInTheDocument();

    // The highlight toggle's aria-label is keyed by the file lineIndex
    // (LineContent.line_index), not the view-row.
    expect(
      screen.getByText("second line").closest("div"),
    ).toContainElement(screen.getByLabelText("Highlight line 2"));
    expect(
      screen.getByText("third line").closest("div"),
    ).toContainElement(screen.getByLabelText("Highlight line 3"));
  });

  it("attaches virtualizer.measureElement as ref to virtual item wrappers when wrap is enabled (T001)", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 2,
        fileTotalLines: 2,
        lines: lineContentMap([
          [1, content(1, "first line")],
          [2, content(2, "second line")],
        ]),
      }),
    );

    render(<LogViewer alias="app" wrap={true} hasTimestampFormat={false} />);

    expect(measureElement).toHaveBeenCalled();
  });

  it("adds data-index attribute matching item.index to virtual item wrappers (T002)", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 2,
        fileTotalLines: 2,
        lines: lineContentMap([
          [1, content(1, "first line")],
          [2, content(2, "second line")],
        ]),
      }),
    );

    render(<LogViewer alias="app" wrap={true} hasTimestampFormat={false} />);

    const first = screen.getByText("first line").closest("[data-index]");
    expect(first).toHaveAttribute("data-index", "0");
    const second = screen.getByText("second line").closest("[data-index]");
    expect(second).toHaveAttribute("data-index", "1");
  });

  it("does not apply fixed height style to virtual items when wrap is enabled (T003)", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        fileTotalLines: 1,
        lines: lineContentMap([[1, content(1, "some line")]]),
      }),
    );

    render(<LogViewer alias="app" wrap={true} hasTimestampFormat={false} />);

    const wrapper = screen.getByText("some line").closest("[data-index]");
    expect(wrapper).not.toHaveStyle({ height: "20px" });
  });

  it("calls virtualizer.measure() when wrap prop changes (T004)", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        fileTotalLines: 1,
        lines: lineContentMap([[1, content(1, "some line")]]),
      }),
    );

    const { rerender } = render(
      <LogViewer alias="app" wrap={false} hasTimestampFormat={false} />,
    );

    measure.mockClear();

    rerender(<LogViewer alias="app" wrap={true} hasTimestampFormat={false} />);

    expect(measure).toHaveBeenCalled();
  });

  it("with filter active, clicking a search result passes correct alias and line index to scroll", async () => {
    resolveViewRow.mockResolvedValue(1);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 2,
        fileTotalLines: 5,
        lines: lineContentMap([
          [1, content(2, "second line")],
          [2, content(4, "fourth line")],
        ]),
      }),
    );

    render(
      <LogViewer
        alias="app"
        wrap={false}
        hasTimestampFormat={true}
        scrollToLine={{ lineIndex: 2, nonce: 1 }}
      />,
    );

    await vi.waitFor(() => {
      expect(resolveViewRow).toHaveBeenCalledWith("app", 2);
      expect(scrollToIndex).toHaveBeenCalledWith(0, { align: "center" });
    });
  });

  it("navNonce scrolls to correct view-row when match is loaded", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 5,
        fileTotalLines: 5,
        lines: lineContentMap([
          [1, content(1, "one")],
          [2, content(2, "two")],
          [3, content(3, "three")],
          [4, content(4, "four")],
          [5, content(5, "five")],
        ]),
      }),
    );
    useLineSelectionStore.setState({
      slices: { app: { selectedLine: 4, navNonce: 1 } },
    });

    render(<LogViewer alias="app" wrap={false} hasTimestampFormat={false} />);

    expect(scrollToIndex).toHaveBeenCalledWith(3, { align: "auto" });
  });

  it("navNonce wrap-around scrolls correctly between first and last match", () => {
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 5,
        fileTotalLines: 5,
        lines: lineContentMap([
          [1, content(1, "one")],
          [2, content(2, "two")],
          [3, content(3, "three")],
          [4, content(4, "four")],
          [5, content(5, "five")],
        ]),
      }),
    );
    useLineSelectionStore.setState({
      slices: { app: { selectedLine: 1, navNonce: 1 } },
    });

    const { rerender } = render(
      <LogViewer alias="app" wrap={false} hasTimestampFormat={false} />,
    );

    expect(scrollToIndex).toHaveBeenCalledWith(0, { align: "auto" });

    scrollToIndex.mockClear();
    useLineSelectionStore.setState({
      slices: { app: { selectedLine: 5, navNonce: 2 } },
    });

    rerender(<LogViewer alias="app" wrap={false} hasTimestampFormat={false} />);

    expect(scrollToIndex).toHaveBeenCalledWith(4, { align: "auto" });
  });

  it("does not scroll for a selectedLine hidden by the active filter (no-op reverse lookup)", () => {
    // file line 1 is hidden by the active filter: view-row 1 maps to file
    // line 2, so a reverse lookup for selectedLine=1 finds nothing.
    useLogStream.mockReturnValue(
      mockResult({
        totalLines: 1,
        fileTotalLines: 3,
        lines: lineContentMap([[1, content(2, "second line")]]),
      }),
    );
    useLineSelectionStore.setState({
      slices: { app: { selectedLine: 1, navNonce: 1 } },
    });

    render(<LogViewer alias="app" wrap={false} hasTimestampFormat={true} />);

    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
