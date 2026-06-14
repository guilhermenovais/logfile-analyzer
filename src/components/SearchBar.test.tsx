import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHistoryEntry } from "@/bindings";
import type { UseSearchHistoryResult } from "@/hooks/useSearchHistory";
import type { UseSearchResult } from "@/hooks/useSearch";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { SearchBar } from "./SearchBar";

const { useSearch, useSearchHistory } = vi.hoisted(() => ({
  useSearch: vi.fn(),
  useSearchHistory: vi.fn(),
}));

vi.mock("@/hooks/useSearch", () => ({ useSearch }));
vi.mock("@/hooks/useSearchHistory", () => ({ useSearchHistory }));

function mockResult(overrides: Partial<UseSearchResult> = {}): UseSearchResult {
  return {
    isSearching: false,
    error: null,
    runSearch: vi.fn(),
    ...overrides,
  };
}

function mockHistory(
  overrides: Partial<UseSearchHistoryResult> = {},
): UseSearchHistoryResult {
  return {
    history: [],
    isLoading: false,
    suggestions: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

describe("SearchBar", () => {
  beforeEach(() => {
    useSearch.mockReset();
    useSearchHistory.mockReset();
    useSearchHistory.mockReturnValue(mockHistory());
    useSearchUiStore.setState({ slices: {} });
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

  it("displays an error message", () => {
    useSearch.mockReturnValue(mockResult({ error: "InvalidQuery" }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    expect(screen.getByText("InvalidQuery")).toBeInTheDocument();
  });

  it("does not render an inline results list or a History section", () => {
    useSearch.mockReturnValue(mockResult());
    useSearchUiStore.getState().setResults(
      "app",
      [{ line_index: 3, content: "an error talking to db" }],
      false,
    );

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    expect(screen.queryByText(/an error talking to db/)).not.toBeInTheDocument();
    expect(screen.queryByText("History")).not.toBeInTheDocument();
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

  it("preserves the query in the store after the results panel is closed (FR-008)", async () => {
    const runSearch = vi.fn();
    useSearch.mockReturnValue(mockResult({ runSearch }));

    render(<SearchBar alias="app" hasTimestampFormat={false} />);

    await userEvent.type(screen.getByLabelText("Search query"), '"db"');
    useSearchUiStore.getState().setResults("app", [], false);
    useSearchUiStore.getState().closePanel("app");

    expect(screen.getByLabelText("Search query")).toHaveValue('"db"');
  });

  describe("search history", () => {
    const historyEntry: SearchHistoryEntry = {
      id: 1,
      workspace_id: 1,
      query: "err.*",
      search_type: "regex",
      time_from: 1000,
      time_to: 2000,
      last_used_at: "2026-06-12T10:00:00.000Z",
    };

    it("shows up to 5 autocomplete suggestions from search history when focused (FR-010)", async () => {
      useSearch.mockReturnValue(mockResult());
      const suggestions = vi.fn().mockReturnValue([historyEntry]);
      useSearchHistory.mockReturnValue(mockHistory({ suggestions }));

      render(<SearchBar alias="app" hasTimestampFormat={false} />);

      const input = screen.getByLabelText("Search query");
      expect(input).toHaveAttribute("role", "combobox");

      await userEvent.click(input);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /err\.\*/ })).toBeInTheDocument();
    });

    it('shows an empty-history state when there are no suggestions yet', async () => {
      useSearch.mockReturnValue(mockResult());
      useSearchHistory.mockReturnValue(mockHistory());

      render(<SearchBar alias="app" hasTimestampFormat={false} />);

      await userEvent.click(screen.getByLabelText("Search query"));

      expect(screen.getByText(/no recent searches/i)).toBeInTheDocument();
    });

    it("renders a clock icon button that opens the search history overlay (FR-011)", async () => {
      useSearch.mockReturnValue(mockResult());
      useSearchHistory.mockReturnValue(
        mockHistory({ history: [historyEntry] }),
      );

      render(<SearchBar alias="app" hasTimestampFormat={false} />);

      await userEvent.click(screen.getByRole("button", { name: /search history/i }));

      expect(screen.getByRole("option", { name: /err\.\*/ })).toBeInTheDocument();
    });

    it("selecting a suggestion applies the entry and immediately re-runs the search (FR-018)", async () => {
      const runSearch = vi.fn();
      useSearch.mockReturnValue(mockResult({ runSearch }));
      const suggestions = vi.fn().mockReturnValue([historyEntry]);
      useSearchHistory.mockReturnValue(mockHistory({ suggestions }));

      render(<SearchBar alias="app" hasTimestampFormat={false} />);

      await userEvent.click(screen.getByLabelText("Search query"));
      await userEvent.click(screen.getByRole("option", { name: /err\.\*/ }));

      expect(runSearch).toHaveBeenCalledWith("err.*", "regex", 1000, 2000);
      expect(screen.getByLabelText("Search query")).toHaveValue("err.*");
    });

    it("selecting a history overlay entry applies the entry and immediately re-runs the search (FR-018)", async () => {
      const runSearch = vi.fn();
      useSearch.mockReturnValue(mockResult({ runSearch }));
      useSearchHistory.mockReturnValue(
        mockHistory({ history: [historyEntry] }),
      );

      render(<SearchBar alias="app" hasTimestampFormat={false} />);

      await userEvent.click(screen.getByRole("button", { name: /search history/i }));
      await userEvent.click(screen.getByRole("option", { name: /err\.\*/ }));

      expect(runSearch).toHaveBeenCalledWith("err.*", "regex", 1000, 2000);
      expect(screen.getByLabelText("Search query")).toHaveValue("err.*");
    });
  });

  describe("control heights (US3/FR-017)", () => {
    it("gives the search type select, query input, and search button a shared height and text size", () => {
      useSearch.mockReturnValue(mockResult());

      render(<SearchBar alias="app" hasTimestampFormat={false} />);

      expect(screen.getByLabelText("Search type")).toHaveClass("h-9", "text-sm");
      expect(screen.getByLabelText("Search query")).toHaveClass("h-9", "text-sm");
      expect(screen.getByRole("button", { name: "Search" })).toHaveClass(
        "h-9",
        "text-sm",
      );
    });

    it("renders the history icon button as a matching square with a centered icon", () => {
      useSearch.mockReturnValue(mockResult());

      render(<SearchBar alias="app" hasTimestampFormat={false} />);

      expect(screen.getByRole("button", { name: /search history/i })).toHaveClass(
        "h-9",
        "w-9",
        "text-sm",
        "flex",
        "items-center",
        "justify-center",
      );
    });
  });
});
