import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import type { HighlightEntry } from "@/ipc/highlights";
import { HighlightPanel } from "./HighlightPanel";

const highlightA: HighlightEntry = {
  line_index: 3,
  content: "an error talking to db",
  label: "investigate",
  origin: "user",
};

const highlightB: HighlightEntry = {
  line_index: 1,
  content: "start",
  label: null,
  origin: "mcp_agent",
};

function noop() {
  // placeholder callback for unused handlers
}

describe("HighlightPanel", () => {
  beforeEach(() => {
    useLineSelectionStore.setState({ slices: {} });
  });

  it("shows a message when there are no highlights", () => {
    render(
      <HighlightPanel
        highlights={[]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    expect(screen.getByText(/no highlighted lines/i)).toBeInTheDocument();
  });

  it("lists highlights sorted by line index with their labels", () => {
    render(
      <HighlightPanel
        highlights={[highlightA, highlightB]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("start");
    expect(items[1]).toHaveTextContent("3");
    expect(items[1]).toHaveTextContent("an error talking to db");
    expect(
      screen.getByLabelText("Label for line 3"),
    ).toHaveValue("investigate");
  });

  it("commits an edited label on blur", async () => {
    const onUpdateLabel = vi.fn();
    render(
      <HighlightPanel
        highlights={[highlightB]}
        isLoading={false}
        error={null}
        onUpdateLabel={onUpdateLabel}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    const input = screen.getByLabelText("Label for line 1");
    await userEvent.type(input, "boot");
    await userEvent.tab();

    expect(onUpdateLabel).toHaveBeenCalledWith(1, "boot");
  });

  it("clears a label when blurred empty", async () => {
    const onUpdateLabel = vi.fn();
    render(
      <HighlightPanel
        highlights={[highlightA]}
        isLoading={false}
        error={null}
        onUpdateLabel={onUpdateLabel}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    const input = screen.getByLabelText("Label for line 3");
    await userEvent.clear(input);
    await userEvent.tab();

    expect(onUpdateLabel).toHaveBeenCalledWith(3, null);
  });

  it("removes a highlight", async () => {
    const onRemove = vi.fn();
    render(
      <HighlightPanel
        highlights={[highlightA]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={onRemove}
        alias="app"
        onSelect={noop}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /remove highlight from line 3/i }),
    );

    expect(onRemove).toHaveBeenCalledWith(3);
  });

  it("displays an error message", () => {
    render(
      <HighlightPanel
        highlights={[]}
        isLoading={false}
        error="LineOutOfRange"
        onUpdateLabel={noop}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    expect(screen.getByText("LineOutOfRange")).toBeInTheDocument();
  });

  it("calls onSelect with the correct lineIndex when a highlight entry is clicked (T001/FR-001)", async () => {
    const onSelect = vi.fn();
    render(
      <HighlightPanel
        highlights={[highlightA, highlightB]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={noop}
        alias="app"
        onSelect={onSelect}
      />,
    );

    const entryButtons = screen.getAllByRole("button", { name: /navigate to line/i });
    await userEvent.click(entryButtons[1]);

    expect(onSelect).toHaveBeenCalledWith(highlightA.line_index);
  });

  it("shows border-selected-line on the entry matching selectedLine (T002/FR-007)", () => {
    useLineSelectionStore.getState().selectLine("app", highlightA.line_index);

    render(
      <HighlightPanel
        highlights={[highlightA, highlightB]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    const selectedEntry = screen.getByRole("button", {
      name: `Navigate to line ${highlightA.line_index}`,
    });
    expect(selectedEntry).toHaveClass("border-selected-line");

    const otherEntry = screen.getByRole("button", {
      name: `Navigate to line ${highlightB.line_index}`,
    });
    expect(otherEntry).not.toHaveClass("border-selected-line");
    expect(otherEntry).toHaveClass("border-transparent");
  });

  it("scroll-follows navNonce changes for selected entry (FR-007)", () => {
    Element.prototype.scrollIntoView = vi.fn();
    useLineSelectionStore.getState().selectLine("app", 2);

    const { rerender } = render(
      <HighlightPanel
        highlights={[highlightA, highlightB]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    useLineSelectionStore.getState().moveSelection("app", 1, 100, 2);
    rerender(
      <HighlightPanel
        highlights={[highlightA, highlightB]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={noop}
        alias="app"
        onSelect={noop}
      />,
    );

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
    });
  });
});
