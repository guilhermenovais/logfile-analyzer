import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
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
});
