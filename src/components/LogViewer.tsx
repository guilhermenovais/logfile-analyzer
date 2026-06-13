import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLogStream } from "@/hooks/useLogStream";
import type { HighlightEntry } from "@/ipc/highlights";
import { cn } from "@/lib/utils";

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
                <div
                  key={highlight.line_index}
                  className="flex items-start gap-2 border-b p-1 bg-accent"
                  style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
                >
                  <button
                    type="button"
                    aria-label={`Remove highlight from line ${highlight.line_index}`}
                    className="shrink-0"
                    onClick={() =>
                      onToggleHighlight?.(highlight.line_index, true)
                    }
                  >
                    ★
                  </button>
                  <div>
                    <div>{highlight.content}</div>
                    {highlight.label && (
                      <div className="text-xs text-muted-foreground">
                        {highlight.label}
                      </div>
                    )}
                  </div>
                </div>
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
                <div
                  key={item.key}
                  data-index={item.index}
                  className={cn(
                    "flex items-start gap-2",
                    highlight && "bg-accent",
                    searchMatchSet.has(lineIndex) &&
                      (highlight
                        ? "ring-2 ring-inset ring-search-match"
                        : "bg-search-match"),
                  )}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={
                      highlight
                        ? `Remove highlight from line ${lineIndex}`
                        : `Highlight line ${lineIndex}`
                    }
                    className="shrink-0"
                    onClick={() => onToggleHighlight?.(lineIndex, !!highlight)}
                  >
                    {highlight ? "★" : "☆"}
                  </button>
                  <span style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}>
                    {lines.get(lineIndex) ?? ""}
                  </span>
                  {highlight?.label && (
                    <span className="text-xs text-muted-foreground">
                      {highlight.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
