import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LogLine } from "@/components/LogLine";
import { useLineSelectionKeyboard } from "@/hooks/useLineSelectionKeyboard";
import { useLineSelectionStore } from "@/hooks/useLineSelectionStore";
import { useLogStream, type UseLogStreamResult } from "@/hooks/useLogStream";
import { DEFAULT_SEARCH_UI_STATE, useSearchUiStore } from "@/hooks/useSearchUiStore";
import type { HighlightEntry } from "@/ipc/highlights";

/** Reverse lookup: the view-row whose `LineContent.line_index === lineIndex`, if loaded. */
function findViewRow(
  lines: UseLogStreamResult["lines"],
  lineIndex: number,
): number | undefined {
  for (const [viewRow, entry] of lines) {
    if (entry.line_index === lineIndex) {
      return viewRow;
    }
  }
  return undefined;
}

const LINE_HEIGHT_PX = 20;
/** Extra rows fetched/rendered beyond the visible viewport. */
const OVERSCAN = 10;

export interface LogViewerProps {
  /** Workspace alias of the file to view. */
  alias: string;
  /** Wrap long lines (FR-001/FR-002, moved from local state to `LogViewToolbar`). */
  wrap: boolean;
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
  /**
   * Whether `alias` has a detected timestamp format, gating the
   * `timeFrom`/`timeTo` view filter (FR-001-FR-005).
   */
  hasTimestampFormat: boolean;
}

/**
 * Virtualized log line viewer (FR-014/FR-016, SC-001): renders only the
 * visible window of lines, streaming new ranges from `useLogStream` as the
 * user scrolls. The `wrap` prop (FR-015) is controlled by `LogViewToolbar`.
 * Highlighted lines (FR-017/FR-018) are styled inline, and the "highlighted
 * only" filter (FR-019) switches to a flat list of just those lines.
 */
export function LogViewer({
  alias,
  wrap,
  highlights = [],
  highlightedOnly = false,
  onToggleHighlight,
  searchMatchLines,
  scrollToLine,
  hasTimestampFormat,
}: LogViewerProps) {
  const timeFrom = useSearchUiStore(
    (state) => state.slices[alias]?.timeFrom ?? DEFAULT_SEARCH_UI_STATE.timeFrom,
  );
  const timeTo = useSearchUiStore(
    (state) => state.slices[alias]?.timeTo ?? DEFAULT_SEARCH_UI_STATE.timeTo,
  );
  const { lines, totalLines, fileTotalLines, loadRange, viewVersion } = useLogStream(
    alias,
    timeFrom,
    timeTo,
    hasTimestampFormat,
  );
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
    totalLines: fileTotalLines,
    selectedLine,
    firstVisibleLineRef,
    getLineContent: (lineIndex) => {
      const viewRow = findViewRow(lines, lineIndex);
      return viewRow === undefined ? undefined : lines.get(viewRow)?.content;
    },
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
    // `viewVersion` re-triggers this when a time-range change clears `lines`
    // without changing `rangeKey` (e.g. already scrolled to the top).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, loadRange, viewVersion]);

  // A time-range change can shrink `totalLines` below the current scroll
  // offset, leaving the virtualizer reporting no visible items (blank pane)
  // until the user scrolls. Reset to the top whenever the view resets.
  useEffect(() => {
    virtualizer.scrollToOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewVersion]);

  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrap]);

  useEffect(() => {
    if (!scrollToLine) {
      return;
    }
    const viewRow = findViewRow(lines, scrollToLine.lineIndex);
    const scrollIndex =
      viewRow !== undefined ? viewRow - 1 : scrollToLine.lineIndex - 1;
    if (scrollIndex >= 0 && scrollIndex < totalLines) {
      virtualizer.scrollToIndex(scrollIndex, { align: "center" });
    }
    // Only `nonce` should (re-)trigger the scroll (research.md §6).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToLine?.nonce]);

  useEffect(() => {
    if (selectedLine === null) {
      return;
    }
    const viewRow = findViewRow(lines, selectedLine);
    if (viewRow === undefined) {
      return;
    }
    virtualizer.scrollToIndex(viewRow - 1, { align: "auto" });
    // Only `navNonce` (arrow-key navigation, FR-011/FR-012) should
    // (re-)trigger this scroll — click-based selection doesn't bump it
    // because the clicked row is already visible (research.md §6).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navNonce]);

  return (
    <div className="flex h-full flex-col">
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
              const viewRow = item.index + 1;
              const entry = lines.get(viewRow);
              const lineIndex = entry?.line_index ?? viewRow;
              const highlight = highlightMap.get(lineIndex);
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <LogLine
                    lineIndex={lineIndex}
                    content={entry?.content ?? ""}
                    wrap={wrap}
                    highlight={highlight}
                    isSearchMatch={searchMatchSet.has(lineIndex)}
                    isSelected={selectedLine === lineIndex}
                    onToggleHighlight={onToggleHighlight}
                    onSelect={selectLine}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
