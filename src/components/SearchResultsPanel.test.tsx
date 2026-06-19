import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { SearchResultsPanel } from "./SearchResultsPanel";

const matches = [
  { line_index: 2, content: "connecting to db" },
  { line_index: 3, content: "an error talking to db" },
  { line_index: 7, content: "another error" },
];

describe("SearchResultsPanel", () => {
  beforeEach(() => {
    useSearchUiStore.setState({ slices: {} });
    useLineSelectionStore.setState({ slices: {} });
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

  describe("layout classes (US1/US3)", () => {
    it("has shrink-0 on the outer wrapper", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      const { container } = render(<SearchResultsPanel alias="app" />);

      const outerDiv = container.firstElementChild as HTMLElement;
      expect(outerDiv).toHaveClass("shrink-0");
    });

    it("has scrollbar-visible on the results list when results are present", () => {
      useSearchUiStore.getState().setResults("app", matches, false);

      render(<SearchResultsPanel alias="app" />);

      const list = screen.getByRole("list");
      expect(list).toHaveClass("scrollbar-visible");
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
