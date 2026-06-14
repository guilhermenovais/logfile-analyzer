import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LogLine } from "@/components/LogLine";
import { useLineSelectionKeyboard } from "@/hooks/useLineSelectionKeyboard";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import { useLogStream } from "@/hooks/useLogStream";
import type { HighlightEntry } from "@/ipc/highlights";

const LINE_HEIGHT_PX = 20;
/** Extra rows fetched/rendered beyond the visible viewport. */
const OVERSCAN = 10;

export interface LogViewerProps {
  /** Workspace alias of the file to view. */
  alias: string;
  /** Highlighted lines for this file (FR-020), keyed by `line_index`. */
  highlights?: HighlightEntry[];
  /** Show only highlighted lines (FR-019). */
  highlightedOnly?: boolean;
  /** Called when the user toggles the highlight on `lineIndex` (FR-017). */
  onToggleHighlight?: (lineIndex: number, isHighlighted: boolean) => void;
  /**
   * 1-based line indices to mark with a gray `bg-search-match` background
   * while the search results panel is open (FR-005/FR-007).
   */
  searchMatchLines?: number[];
  /**
   * When set, scrolls to `lineIndex` (1-based) centered in the viewport.
   * `nonce` lets the parent re-request a scroll to the same line (research.md §6).
   */
  scrollToLine?: { lineIndex: number; nonce: number } | null;
}

/**
 * Virtualized log line viewer (FR-014/FR-016, SC-001): renders only the
 * visible window of lines, streaming new ranges from `useLogStream` as the
 * user scrolls. The line-wrap toggle is pure frontend view state (FR-015),
 * defaulting to off. Highlighted lines (FR-017/FR-018) are styled inline,
 * and the "highlighted only" filter (FR-019) switches to a flat list of just
 * those lines.
 */
export function LogViewer({
  alias,
  highlights = [],
  highlightedOnly = false,
  onToggleHighlight,
  searchMatchLines,
  scrollToLine,
}: LogViewerProps) {
  const { lines, totalLines, loadRange } = useLogStream(alias);
  const [wrap, setWrap] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  const selectedLine = useLineSelectionStore(
    (state) => state.slices[alias]?.selectedLine ?? null,
  );
  const navNonce = useLineSelectionStore(
    (state) => state.slices[alias]?.navNonce ?? 0,
  );
  const selectLine = (lineIndex: number) =>
    useLineSelectionStore.getState().selectLine(alias, lineIndex);

  const firstVisibleLineRef = useRef(1);

  useLineSelectionKeyboard({
    alias,
    totalLines,
    selectedLine,
    firstVisibleLineRef,
    getLineContent: (lineIndex) => lines.get(lineIndex),
  });

  const highlightMap = useMemo(() => {
    const map = new Map<number, HighlightEntry>();
    for (const highlight of highlights) {
      map.set(highlight.line_index, highlight);
    }
    return map;
  }, [highlights]);

  const searchMatchSet = useMemo(
    () => new Set(searchMatchLines ?? []),
    [searchMatchLines],
  );

  const virtualizer = useVirtualizer({
    count: totalLines,
    getScrollElement: () => parentRef.current,
    estimateSize: () => LINE_HEIGHT_PX,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const rangeKey = virtualItems.length
    ? `${virtualItems[0].index}-${virtualItems[virtualItems.length - 1].index}`
    : "";

  useEffect(() => {
    if (virtualItems.length > 0) {
      firstVisibleLineRef.current = virtualItems[0].index + 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  useEffect(() => {
    if (virtualItems.length === 0) {
      return;
    }
    const startIndex = virtualItems[0].index + 1;
    const endIndex = virtualItems[virtualItems.length - 1].index + 1;
    loadRange(startIndex, endIndex - startIndex + 1);
    // `rangeKey` mirrors the first/last visible indices; `virtualItems` is a
    // fresh array every render so isn't a stable dependency itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, loadRange]);

  useEffect(() => {
    if (!scrollToLine) {
      return;
    }
    virtualizer.scrollToIndex(scrollToLine.lineIndex - 1, {
      align: "center",
    });
    // Only `nonce` should (re-)trigger the scroll (research.md §6).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToLine?.nonce]);

  useEffect(() => {
    if (selectedLine === null) {
      return;
    }
    virtualizer.scrollToIndex(selectedLine - 1, { align: "auto" });
    // Only `navNonce` (arrow-key navigation, FR-011/FR-012) should
    // (re-)trigger this scroll — click-based selection doesn't bump it
    // because the clicked row is already visible (research.md §6).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navNonce]);

  return (
    <div className="flex h-full flex-col">
      <label className="flex items-center gap-2 border-b p-2 text-sm">
        <input
          type="checkbox"
          checked={wrap}
          onChange={(event) => setWrap(event.target.checked)}
        />
        Wrap lines
      </label>
      {highlightedOnly ? (
        <div className="flex-1 overflow-auto font-mono text-sm">
          {highlights.length === 0 ? (
            <p className="p-2 text-muted-foreground">
              No highlighted lines.
            </p>
          ) : (
            [...highlights]
              .sort((a, b) => a.line_index - b.line_index)
              .map((highlight) => (
                <LogLine
                  key={highlight.line_index}
                  lineIndex={highlight.line_index}
                  content={highlight.content}
                  wrap={wrap}
                  highlight={highlight}
                  isSelected={selectedLine === highlight.line_index}
                  onToggleHighlight={onToggleHighlight}
                  onSelect={selectLine}
                  className="border-b p-1"
                />
              ))
          )}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="flex-1 overflow-auto font-mono text-sm"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((item) => {
              const lineIndex = item.index + 1;
              const highlight = highlightMap.get(lineIndex);
              return (
                <LogLine
                  key={item.key}
                  lineIndex={lineIndex}
                  content={lines.get(lineIndex) ?? ""}
                  wrap={wrap}
                  highlight={highlight}
                  isSearchMatch={searchMatchSet.has(lineIndex)}
                  isSelected={selectedLine === lineIndex}
                  onToggleHighlight={onToggleHighlight}
                  onSelect={selectLine}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
