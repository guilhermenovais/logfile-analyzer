import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { SearchResultsPanel } from "./SearchResultsPanel";

const { useSearch } = vi.hoisted(() => ({
  useSearch: vi.fn(),
}));

vi.mock("@/hooks/useSearch", () => ({ useSearch }));

const matches = [
  { line_index: 2, content: "connecting to db" },
  { line_index: 3, content: "an error talking to db" },
  { line_index: 7, content: "another error" },
];

describe("SearchResultsPanel", () => {
  beforeEach(() => {
    useSearchUiStore.setState({ slices: {} });
    useLineSelectionStore.setState({ slices: {} });
    useSearch.mockReturnValue({
      isSearching: false,
      error: null,
      runSearch: vi.fn(),
    });
  });

  it("renders one row per match with line number and content (no context, FR-001)", () => {
    useSearchUiStore.getState().setResults("app", matches, false);

    render(<SearchResultsPanel alias="app" />);

    expect(screen.getByText(/connecting to db/)).toBeInTheDocument();
    expect(screen.getByText(/an error talking to db/)).toBeInTheDocument();
    expect(screen.getByText(/another error/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("calls onSelectMatch(index) when a row is clicked (FR-002/FR-003)", async () => {
    useSearchUiStore.getState().setResults("app", matches, false);

    render(<SearchResultsPanel alias="app" />);

    const rows = screen.getAllByRole("button", { name: /error/i });
    await userEvent.click(rows[0]);

    expect(useSearchUiStore.getState().slices["app"].currentMatchIndex).toBe(
      1,
    );
  });

  it("shows the truncation notice when results were capped", () => {
    useSearchUiStore.getState().setResults("app", matches, true);

    render(<SearchResultsPanel alias="app" />);

    expect(screen.getByText(/Showing the first 3 matches\./)).toBeInTheDocument();
  });

  it("shows a 'no matches' message when results is empty", () => {
    useSearchUiStore.getState().setResults("app", [], false);

    render(<SearchResultsPanel alias="app" />);

    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("renders a close button that calls closePanel (FR-004)", async () => {
    useSearchUiStore.getState().setResults("app", matches, false);

    render(<SearchResultsPanel alias="app" />);

    await userEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(useSearchUiStore.getState().slices["app"].panelOpen).toBe(false);
  });

  it("shows the current match position in the header (e.g. '1 of 3')", () => {
    useSearchUiStore.getState().setResults("app", matches, false);

    render(<SearchResultsPanel alias="app" />);

    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("calls nextMatch(alias) when the next button is clicked, wrapping from the last to the first match (FR-006/FR-017)", async () => {
    useSearchUiStore.getState().setResults("app", matches, false);
    useSearchUiStore.getState().selectMatch("app", 2);

    render(<SearchResultsPanel alias="app" />);

    expect(screen.getByText("3 of 3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /next match/i }));

    expect(useSearchUiStore.getState().slices["app"].currentMatchIndex).toBe(0);
  });

  it("calls prevMatch(alias) when the previous button is clicked, wrapping from the first to the last match (FR-006/FR-017)", async () => {
    useSearchUiStore.getState().setResults("app", matches, false);

    render(<SearchResultsPanel alias="app" />);

    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /previous match/i }),
    );

    expect(useSearchUiStore.getState().slices["app"].currentMatchIndex).toBe(2);
  });

  it("shows border-selected-line on the entry matching selectedLine (FR-008/FR-009)", () => {
    useSearchUiStore.getState().setResults("app", matches, false);
    useLineSelectionStore.getState().selectLine("app", matches[1].line_index);

    render(<SearchResultsPanel alias="app" />);

    const selectedRow = screen.getByText(matches[1].content).closest("button");
    expect(selectedRow).toHaveClass("border-selected-line");

    const otherRow = screen.getByText(matches[0].content).closest("button");
    expect(otherRow).not.toHaveClass("border-selected-line");
  });

  it("shows no selection indicator when selectedLine is not among results (FR-008/FR-009)", () => {
    useSearchUiStore.getState().setResults("app", matches, false);
    useLineSelectionStore.getState().selectLine("app", 999);

    render(<SearchResultsPanel alias="app" />);

    for (const match of matches) {
      const row = screen.getByText(match.content).closest("button");
      expect(row).not.toHaveClass("border-selected-line");
    }
  });

  describe("button sizes and tooltips (US2)", () => {
    it("Previous/Next/Close buttons have min-w-7 and min-h-7 for 28px click targets", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      render(<SearchResultsPanel alias="app" />);

      const prevBtn = screen.getByRole("button", { name: /previous match/i });
      const nextBtn = screen.getByRole("button", { name: /next match/i });
      const closeBtn = screen.getByRole("button", { name: /close/i });

      for (const btn of [prevBtn, nextBtn, closeBtn]) {
        expect(btn).toHaveClass("min-w-7", "min-h-7");
      }
    });

    it("buttons have title attributes with keyboard shortcut hints", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      render(<SearchResultsPanel alias="app" />);

      expect(screen.getByRole("button", { name: /previous match/i })).toHaveAttribute("title", "Previous match (Shift+Up)");
      expect(screen.getByRole("button", { name: /next match/i })).toHaveAttribute("title", "Next match (Shift+Down)");
      expect(screen.getByRole("button", { name: /close/i })).toHaveAttribute("title", "Close search results");
    });
  });

  describe("horizontal scrolling (US1)", () => {
    it("applies overflow-x-auto on the list container and whitespace-pre on content spans", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      render(<SearchResultsPanel alias="app" />);

      const list = screen.getByRole("list");
      expect(list).toHaveClass("overflow-x-auto");

      const contentSpan = screen.getByText("connecting to db");
      expect(contentSpan).toHaveClass("whitespace-pre");
      expect(contentSpan).not.toHaveClass("truncate");
      expect(contentSpan).not.toHaveClass("overflow-x-auto");
    });
  });

  describe("wrap lines toggle (US5)", () => {
    it("renders a wrap toggle button when results are present", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      render(<SearchResultsPanel alias="app" />);

      expect(screen.getByRole("button", { name: /wrap lines/i })).toBeInTheDocument();
    });

    it("applies whitespace-pre on content and overflow-x-auto on list when wrap is OFF (default)", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      render(<SearchResultsPanel alias="app" />);

      const contentSpan = screen.getByText("connecting to db");
      expect(contentSpan).toHaveClass("whitespace-pre");
      expect(contentSpan).not.toHaveClass("whitespace-pre-wrap", "break-all");

      const list = screen.getByRole("list");
      expect(list).toHaveClass("overflow-x-auto");
    });

    it("applies whitespace-pre-wrap and break-all when wrap is ON", async () => {
      useSearchUiStore.getState().setResults("app", matches, false);
      useSearchUiStore.getState().toggleWrapLines("app");

      render(<SearchResultsPanel alias="app" />);

      const contentSpan = screen.getByText("connecting to db");
      expect(contentSpan).toHaveClass("whitespace-pre-wrap", "break-all");
      expect(contentSpan).not.toHaveClass("overflow-x-auto");
    });

    it("suppresses horizontal scrollbar on list when wrap is ON", () => {
      useSearchUiStore.getState().setResults("app", matches, false);
      useSearchUiStore.getState().toggleWrapLines("app");

      render(<SearchResultsPanel alias="app" />);

      const list = screen.getByRole("list");
      expect(list).not.toHaveClass("overflow-x-auto");
    });
  });

  describe("pagination controls (US6)", () => {
    it("shows pagination controls when totalCount > 500", () => {
      useSearchUiStore.getState().setResults("app", matches, true, 600);

      render(<SearchResultsPanel alias="app" />);

      expect(screen.getByRole("button", { name: /next page/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /previous page/i })).toBeInTheDocument();
      expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    });

    it("hides pagination controls when totalCount <= 500", () => {
      useSearchUiStore.getState().setResults("app", matches, false, 3);

      render(<SearchResultsPanel alias="app" />);

      expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
    });

    it("shows global position in match counter when paginated", () => {
      useSearchUiStore.getState().setPageResults("app", matches, true, 600, 1);

      render(<SearchResultsPanel alias="app" />);

      expect(screen.getByText("501 of 600")).toBeInTheDocument();
    });

    it("shows loading spinner during page transition", () => {
      useSearchUiStore.getState().setResults("app", matches, true, 600);
      useSearchUiStore.getState().setPageLoading("app", true);

      render(<SearchResultsPanel alias="app" />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe("layout classes (US1/US3)", () => {
    it("has shrink-0 on the outer wrapper", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      const { container } = render(<SearchResultsPanel alias="app" />);

      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv).toHaveClass("shrink-0");
    });

    it("uses default overlay scrollbars on the results list (no scrollbar-visible)", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      render(<SearchResultsPanel alias="app" />);

      const list = screen.getByRole("list");
      expect(list).not.toHaveClass("scrollbar-visible");
      expect(list).toHaveClass("overflow-y-auto");
    });
  });

  describe("consistent border margins (US4)", () => {
    it("always applies border-2 to result buttons and toggles between border-transparent and border-selected-line", () => {
      useSearchUiStore.getState().setResults("app", matches, false);
      useLineSelectionStore.getState().selectLine("app", matches[1].line_index);

      render(<SearchResultsPanel alias="app" />);

      const selectedRow = screen.getByText(matches[1].content).closest("button");
      expect(selectedRow).toHaveClass("border-2", "border-selected-line");
      expect(selectedRow).not.toHaveClass("border-transparent");

      const unselectedRow = screen.getByText(matches[0].content).closest("button");
      expect(unselectedRow).toHaveClass("border-2", "border-transparent");
      expect(unselectedRow).not.toHaveClass("border-selected-line");
    });
  });

  describe("scroll-follow on navNonce changes (US4, FR-013)", () => {
    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    it("scrolls the matching entry into view when the new selectedLine is a result (FR-013)", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      const { rerender } = render(<SearchResultsPanel alias="app" />);

      // matches[0].line_index is selected by setResults; move to matches[1].line_index.
      useLineSelectionStore
        .getState()
        .moveSelection("app", 1, 100, matches[0].line_index);
      rerender(<SearchResultsPanel alias="app" />);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
      });
      expect(screen.getByText(matches[1].content).closest("button")).toHaveClass(
        "border-selected-line",
      );
    });

    it("does not scroll, and leaves the indicator unchanged, when the new selectedLine is not a result (FR-013)", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      const { rerender } = render(<SearchResultsPanel alias="app" />);

      // setResults selected matches[0].line_index (2); move down to line 1,
      // which is not among the results.
      useLineSelectionStore.getState().moveSelection("app", -1, 100, 50);
      rerender(<SearchResultsPanel alias="app" />);

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
      for (const match of matches) {
        const row = screen.getByText(match.content).closest("button");
        expect(row).not.toHaveClass("border-selected-line");
      }
    });
  });
});
