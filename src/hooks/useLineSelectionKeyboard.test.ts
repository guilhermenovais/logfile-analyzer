import { renderHook } from "@testing-library/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLineSelectionSlice, useLineSelectionStore } from "./useLineSelectionStore";
import { useSearchUiStore } from "./useSearchUiStore";
import { useLineSelectionKeyboard } from "./useLineSelectionKeyboard";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

function mockSelection(text: string) {
  vi.spyOn(window, "getSelection").mockReturnValue({
    toString: () => text,
  } as Selection);
}

function fireCtrlC() {
  const event = new KeyboardEvent("keydown", {
    key: "c",
    ctrlKey: true,
    cancelable: true,
  });
  const notPrevented = window.dispatchEvent(event);
  return { event, prevented: !notPrevented };
}

function fireArrowKey(key: "ArrowUp" | "ArrowDown") {
  const event = new KeyboardEvent("keydown", { key, cancelable: true });
  const notPrevented = window.dispatchEvent(event);
  return { event, prevented: !notPrevented };
}

describe("useLineSelectionKeyboard - Ctrl/Cmd+C (US2)", () => {
  beforeEach(() => {
    vi.mocked(writeText).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not call writeText when there is an active text selection (FR-005)", () => {
    mockSelection("highlighted text");
    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 3,
        totalLines: 10,
        firstVisibleLineRef: { current: 1 },
        getLineContent: () => "line three content",
      }),
    );

    fireCtrlC();

    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the selected line's content when nothing is highlighted (FR-006)", () => {
    mockSelection("");
    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 3,
        totalLines: 10,
        firstVisibleLineRef: { current: 1 },
        getLineContent: (lineIndex) =>
          lineIndex === 3 ? "line three content" : undefined,
      }),
    );

    const { prevented } = fireCtrlC();

    expect(writeText).toHaveBeenCalledWith("line three content");
    expect(prevented).toBe(true);
  });

  it("does nothing when selectedLine is null and nothing is highlighted (FR-007)", () => {
    mockSelection("");
    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: null,
        totalLines: 10,
        firstVisibleLineRef: { current: 1 },
        getLineContent: () => undefined,
      }),
    );

    const { prevented } = fireCtrlC();

    expect(writeText).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it("does nothing when focus is in a text input (FR-019)", () => {
    mockSelection("");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 3,
        totalLines: 10,
        firstVisibleLineRef: { current: 1 },
        getLineContent: () => "line three content",
      }),
    );

    fireCtrlC();

    expect(writeText).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});

describe("useLineSelectionKeyboard - Up/Down (US4)", () => {
  beforeEach(() => {
    useLineSelectionStore.setState({ slices: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pressing Down calls moveSelection(alias, 1, totalLines, firstVisibleLineRef.current) and prevents default (FR-011/FR-014)", () => {
    const firstVisibleLineRef = { current: 1 };
    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: null,
        totalLines: 10,
        firstVisibleLineRef,
        getLineContent: () => undefined,
      }),
    );

    const { prevented } = fireArrowKey("ArrowDown");

    expect(getLineSelectionSlice("app").selectedLine).toBe(2);
    expect(getLineSelectionSlice("app").navNonce).toBe(1);
    expect(prevented).toBe(true);
  });

  it("pressing Up moves the selection up by one (FR-011/FR-014)", () => {
    useLineSelectionStore.getState().selectLine("app", 5);
    const firstVisibleLineRef = { current: 1 };
    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 5,
        totalLines: 10,
        firstVisibleLineRef,
        getLineContent: () => undefined,
      }),
    );

    fireArrowKey("ArrowUp");

    expect(getLineSelectionSlice("app").selectedLine).toBe(4);
  });

  it("does nothing on Up/Down when focus is in a text input (FR-011/FR-014/FR-019)", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    useLineSelectionStore.getState().selectLine("app", 5);
    const firstVisibleLineRef = { current: 1 };
    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 5,
        totalLines: 10,
        firstVisibleLineRef,
        getLineContent: () => undefined,
      }),
    );

    fireArrowKey("ArrowDown");

    expect(getLineSelectionSlice("app").selectedLine).toBe(5);
    expect(getLineSelectionSlice("app").navNonce).toBe(0);

    document.body.removeChild(input);
  });
});

function fireShiftArrow(key: "ArrowUp" | "ArrowDown") {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey: true,
    cancelable: true,
  });
  const notPrevented = window.dispatchEvent(event);
  return { event, prevented: !notPrevented };
}

const searchMatches = [
  { line_index: 2, content: "two" },
  { line_index: 5, content: "five" },
  { line_index: 9, content: "nine" },
];

describe("useLineSelectionKeyboard - Shift+Up/Down search navigation (US4)", () => {
  beforeEach(() => {
    useLineSelectionStore.setState({ slices: {} });
    useSearchUiStore.setState({ slices: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Shift+Down calls nextMatch when search results are visible", () => {
    useSearchUiStore.getState().setResults("app", searchMatches, false);
    expect(useSearchUiStore.getState().slices["app"].currentMatchIndex).toBe(0);

    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 2,
        totalLines: 20,
        firstVisibleLineRef: { current: 1 },
        getLineContent: () => undefined,
      }),
    );

    fireShiftArrow("ArrowDown");

    expect(useSearchUiStore.getState().slices["app"].currentMatchIndex).toBe(1);
  });

  it("Shift+Up calls prevMatch when search results are visible", () => {
    useSearchUiStore.getState().setResults("app", searchMatches, false);
    useSearchUiStore.getState().selectMatch("app", 2);

    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 9,
        totalLines: 20,
        firstVisibleLineRef: { current: 1 },
        getLineContent: () => undefined,
      }),
    );

    fireShiftArrow("ArrowUp");

    expect(useSearchUiStore.getState().slices["app"].currentMatchIndex).toBe(1);
  });

  it("Shift+Down works when focused on a text input (FR-009)", () => {
    useSearchUiStore.getState().setResults("app", searchMatches, false);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 2,
        totalLines: 20,
        firstVisibleLineRef: { current: 1 },
        getLineContent: () => undefined,
      }),
    );

    fireShiftArrow("ArrowDown");

    expect(useSearchUiStore.getState().slices["app"].currentMatchIndex).toBe(1);

    document.body.removeChild(input);
  });

  it("Shift+Down does not affect search state when search panel is not open", () => {
    renderHook(() =>
      useLineSelectionKeyboard({
        alias: "app",
        selectedLine: 2,
        totalLines: 20,
        firstVisibleLineRef: { current: 1 },
        getLineContent: () => undefined,
      }),
    );

    fireShiftArrow("ArrowDown");

    expect(useSearchUiStore.getState().slices["app"]).toBeUndefined();
  });
});
