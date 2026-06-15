import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { LogViewToolbar } from "./LogViewToolbar";
import { SearchBar } from "./SearchBar";

const { useFileProperties } = vi.hoisted(() => ({ useFileProperties: vi.fn() }));
vi.mock("@/hooks/useFileProperties", () => ({ useFileProperties }));

vi.mock("@/hooks/useSearchHistory", () => ({
  useSearchHistory: () => ({ history: [], isLoading: false, suggestions: () => [] }),
}));

/**
 * Wires `LogViewToolbar` + `SearchBar` against the real `useSearchUiStore`,
 * with only `@tauri-apps/api/core`'s `invoke` mocked (research.md §1), to
 * confirm a time range set via the toolbar reaches the `search` IPC payload
 * end-to-end (FR-001–FR-003).
 */
describe("Time range filter pipeline (US1)", () => {
  beforeEach(() => {
    useSearchUiStore.setState({ slices: {} });
    useFileProperties.mockReturnValue({ data: undefined });
  });

  afterEach(() => {
    clearMocks();
  });

  it("passes the toolbar's committed time range to the search invoke payload", async () => {
    const searchCalls: Record<string, unknown>[] = [];
    mockIPC((cmd, args) => {
      switch (cmd) {
        case "get_search_history":
          return [];
        case "search":
          searchCalls.push(args as Record<string, unknown>);
          return null;
        default:
          return null;
      }
    });

    render(
      <>
        <SearchBar alias="app" hasTimestampFormat={true} />
        <LogViewToolbar alias="app" hasTimestampFormat={true} />
      </>,
    );

    await userEvent.type(screen.getByLabelText("Time range from"), "2026-06-12 10:00");
    await userEvent.tab();

    await userEvent.type(screen.getByLabelText("Time range to"), "2026-06-12 10:30");
    await userEvent.tab();

    await userEvent.type(screen.getByLabelText("Search query"), '"error"');
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(searchCalls.length).toBeGreaterThan(0));
    expect(searchCalls[0].timeFrom).toBe(Date.UTC(2026, 5, 12, 10, 0));
    expect(searchCalls[0].timeTo).toBe(Date.UTC(2026, 5, 12, 10, 30));
  });
});
