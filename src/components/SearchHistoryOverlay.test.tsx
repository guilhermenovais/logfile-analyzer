import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SearchHistoryEntry } from "@/bindings";
import { SearchHistoryOverlay } from "./SearchHistoryOverlay";

const entries: SearchHistoryEntry[] = [
  {
    id: 2,
    workspace_id: 1,
    query: "newest",
    search_type: "logical",
    time_from: null,
    time_to: null,
    last_used_at: "2026-06-12T10:01:00.000Z",
  },
  {
    id: 1,
    workspace_id: 1,
    query: "older",
    search_type: "regex",
    time_from: null,
    time_to: null,
    last_used_at: "2026-06-12T10:00:00.000Z",
  },
];

describe("SearchHistoryOverlay", () => {
  it("renders entries most-recent-first (FR-012)", () => {
    render(
      <SearchHistoryOverlay
        open={true}
        onOpenChange={() => {}}
        entries={entries}
        onSelect={() => {}}
      />,
    );

    const items = screen.getAllByRole("option");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("newest");
    expect(items[1]).toHaveTextContent("older");
  });

  it('shows a "nothing to show yet" message when entries is empty', () => {
    render(
      <SearchHistoryOverlay
        open={true}
        onOpenChange={() => {}}
        entries={[]}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
  });

  it("calls onSelect with the clicked entry (FR-018)", async () => {
    const onSelect = vi.fn();
    render(
      <SearchHistoryOverlay
        open={true}
        onOpenChange={() => {}}
        entries={entries}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole("option", { name: /newest/ }));

    expect(onSelect).toHaveBeenCalledWith(entries[0]);
  });
});
