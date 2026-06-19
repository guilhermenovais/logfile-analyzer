import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogLine } from "./LogLine";

function mockSelection(text: string) {
  vi.spyOn(window, "getSelection").mockReturnValue({
    toString: () => text,
  } as Selection);
}

describe("LogLine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls onSelect(lineIndex) on a plain click (no drag-selection)", async () => {
    mockSelection("");
    const onSelect = vi.fn();

    render(
      <LogLine
        lineIndex={3}
        content="hello world"
        wrap={false}
        isSelected={false}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByText("hello world"));

    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("does not call onSelect when the click follows a drag-selection", async () => {
    mockSelection("some selected text");
    const onSelect = vi.fn();

    render(
      <LogLine
        lineIndex={3}
        content="hello world"
        wrap={false}
        isSelected={false}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByText("hello world"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking the star button calls onToggleHighlight and not onSelect (FR-018)", async () => {
    mockSelection("");
    const onSelect = vi.fn();
    const onToggleHighlight = vi.fn();

    render(
      <LogLine
        lineIndex={3}
        content="hello world"
        wrap={false}
        isSelected={false}
        onSelect={onSelect}
        onToggleHighlight={onToggleHighlight}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /highlight line 3/i }));

    expect(onToggleHighlight).toHaveBeenCalledWith(3, false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders with border-2 border-transparent when unselected (T009)", () => {
    render(
      <LogLine
        lineIndex={1}
        content="hello world"
        wrap={false}
        isSelected={false}
        onSelect={() => {}}
      />,
    );

    const row = screen.getByText("hello world").closest("div");
    expect(row).toHaveClass("border-2");
    expect(row).toHaveClass("border-transparent");
  });

  it("renders with border-2 border-selected-line and no border-transparent when selected (T010)", () => {
    render(
      <LogLine
        lineIndex={1}
        content="hello world"
        wrap={false}
        isSelected={true}
        onSelect={() => {}}
      />,
    );

    const row = screen.getByText("hello world").closest("div");
    expect(row).toHaveClass("border-2");
    expect(row).toHaveClass("border-selected-line");
    expect(row).not.toHaveClass("border-transparent");
  });

  it("adds border-2 border-selected-line when isSelected", () => {
    render(
      <LogLine
        lineIndex={1}
        content="hello world"
        wrap={false}
        isSelected={true}
        onSelect={() => {}}
      />,
    );

    const row = screen.getByText("hello world").closest("div");
    expect(row).toHaveClass("border-2");
    expect(row).toHaveClass("border-selected-line");
  });

  it("does not add the selection border when isSelected is false", () => {
    render(
      <LogLine
        lineIndex={1}
        content="hello world"
        wrap={false}
        isSelected={false}
        onSelect={() => {}}
      />,
    );

    const row = screen.getByText("hello world").closest("div");
    expect(row).not.toHaveClass("border-selected-line");
  });

  it("composes the selection border with highlight and search-match classes (FR-015)", () => {
    render(
      <LogLine
        lineIndex={1}
        content="hello world"
        wrap={false}
        isSelected={true}
        isSearchMatch={true}
        highlight={{ line_index: 1, content: "hello world", label: null, origin: "user" }}
        onSelect={() => {}}
      />,
    );

    const row = screen.getByText("hello world").closest("div");
    expect(row).toHaveClass("border-2");
    expect(row).toHaveClass("border-selected-line");
    expect(row).toHaveClass("bg-accent");
    expect(row).toHaveClass("ring-2");
    expect(row).toHaveClass("ring-inset");
    expect(row).toHaveClass("ring-search-match");
  });
});
