import { useEffect, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useLineSelectionStore } from "./useLineSelectionStore";

export interface UseLineSelectionKeyboardOptions {
  alias: string;
  /** Total number of lines in the file, for clamping arrow-key navigation. */
  totalLines: number;
  /** 1-based index of the currently selected line, or null if none. */
  selectedLine: number | null;
  /**
   * 1-based index of the first currently-visible line (ref, read at keydown
   * time to avoid stale closures as the user scrolls).
   */
  firstVisibleLineRef: React.RefObject<number>;
  /** Returns the full text of `lineIndex`, or undefined if not loaded. */
  getLineContent: (lineIndex: number) => string | undefined;
}

function isTextInput(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  return (element as HTMLElement).isContentEditable;
}

/**
 * Window-level keydown handler for Ctrl/Cmd+C line-copy (FR-005-FR-007/
 * FR-019), active for the lifetime of the calling component (research.md §5).
 */
export function useLineSelectionKeyboard(
  options: UseLineSelectionKeyboardOptions,
) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTextInput(document.activeElement)) {
        return;
      }

      const isCopy =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
      if (isCopy) {
        if (window.getSelection()?.toString()) {
          return;
        }

        const { selectedLine, getLineContent } = optionsRef.current;
        if (selectedLine === null) {
          return;
        }

        const content = getLineContent(selectedLine);
        if (content === undefined) {
          return;
        }

        event.preventDefault();
        void writeText(content);
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const { alias, totalLines, firstVisibleLineRef } = optionsRef.current;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        event.preventDefault();
        useLineSelectionStore
          .getState()
          .moveSelection(alias, delta, totalLines, firstVisibleLineRef.current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
