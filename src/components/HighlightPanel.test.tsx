import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
  it("shows a message when there are no highlights", () => {
    render(
      <HighlightPanel
        highlights={[]}
        isLoading={false}
        error={null}
        onUpdateLabel={noop}
        onRemove={noop}
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
      />,
    );

    expect(screen.getByText("LineOutOfRange")).toBeInTheDocument();
  });
});
