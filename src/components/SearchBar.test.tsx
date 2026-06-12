import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextMatch, SearchHistoryEntry } from "@/bindings";
import type { UseSearchResult } from "@/hooks/useSearch";
import { SearchBar } from "./SearchBar";

const { useSearch } = vi.hoisted(() => ({
  useSearch: vi.fn(),
}));

vi.mock("@/hooks/useSearch", () => ({ useSearch }));

const match: ContextMatch = {
  line_index: 3,
  before: [{ line_index: 2, content: "connecting to db" }],
  match: { line_index: 3, content: "an error talking to db" },
  after: [{ line_index: 4, content: "recovered" }],
};

const historyEntry: SearchHistoryEntry = {
  id: 1,
  file_id: 1,
  query: '"error" AND "db"',
  search_type: "logical",
  time_from: null,
  time_to: null,
  executed_at: "2026-01-01T00:00:00Z",
};

function mockResult(overrides: Partial<UseSearchResult> = {}): UseSearchResult {
  return {
    results: [],
    truncated: false,
    history: [],
    isSearching: false,
    error: null,
    runSearch: vi.fn(),
    ...overrides,
  };
}

describe("SearchBar", () => {
  beforeEach(() => {
    useSearch.mockReset();
  });

  it("submits the query in logical mode by default", async () => {
    const runSearch = vi.fn();
    useSearch.mockReturnValue(mockResult({ runSearch }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    await userEvent.type(
      screen.getByLabelText("Search query"),
      '"error" AND "db"',
    );
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(runSearch).toHaveBeenCalledWith(
      '"error" AND "db"',
      "logical",
      null,
      null,
    );
  });

  it("submits the query in regex mode when selected", async () => {
    const runSearch = vi.fn();
    useSearch.mockReturnValue(mockResult({ runSearch }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    await userEvent.selectOptions(
      screen.getByLabelText("Search type"),
      "regex",
    );
    await userEvent.type(screen.getByLabelText("Search query"), "err.*");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(runSearch).toHaveBeenCalledWith("err.*", "regex", null, null);
  });

  it("displays matches with surrounding context", () => {
    useSearch.mockReturnValue(mockResult({ results: [match] }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    expect(screen.getByText(/an error talking to db/)).toBeInTheDocument();
    expect(screen.getByText(/connecting to db/)).toBeInTheDocument();
    expect(screen.getByText(/recovered/)).toBeInTheDocument();
  });

  it("shows a truncated notice when results were capped", () => {
    useSearch.mockReturnValue(mockResult({ results: [match], truncated: true }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    expect(screen.getByText(/first 1 matches/)).toBeInTheDocument();
  });

  it("displays an error message", () => {
    useSearch.mockReturnValue(mockResult({ error: "InvalidQuery" }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    expect(screen.getByText("InvalidQuery")).toBeInTheDocument();
  });

  it("re-runs a search from history", async () => {
    const runSearch = vi.fn();
    useSearch.mockReturnValue(mockResult({ history: [historyEntry], runSearch }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    await userEvent.click(
      screen.getByRole("button", { name: /"error" AND "db"/ }),
    );

    expect(runSearch).toHaveBeenCalledWith(
      '"error" AND "db"',
      "logical",
      null,
      null,
    );
  });

  it("disables the input and search button when no file is selected", () => {
    useSearch.mockReturnValue(mockResult());

    render(<SearchBar alias={null} hasTimestampFormat={false} />);

    expect(screen.getByLabelText("Search query")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  it("hides the time-range controls when the file has no detected timestamp format", () => {
    useSearch.mockReturnValue(mockResult());

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    expect(screen.queryByLabelText("Time range from")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Time range to")).not.toBeInTheDocument();
  });

  it("submits the time range when the file has a detected timestamp format", async () => {
    const runSearch = vi.fn();
    useSearch.mockReturnValue(mockResult({ runSearch }));

    render(<SearchBar alias="app" hasTimestampFormat={true} />);

    await userEvent.type(screen.getByLabelText("Search query"), '"db"');
    await userEvent.type(
      screen.getByLabelText("Time range from"),
      "2026-06-12T10:00",
    );
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(runSearch).toHaveBeenCalledWith(
      '"db"',
      "logical",
      new Date("2026-06-12T10:00").getTime(),
      null,
    );
  });
});
