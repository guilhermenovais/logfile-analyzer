import { useCallback, useEffect, useState } from "react";
import type { LineContent } from "@/bindings";
import { setViewTimeRange, streamLines, subscribeIndexProgress } from "@/ipc/viewing";

export interface UseLogStreamResult {
  /** view-row (1-based) -> {line_index, content}, for rows loaded so far. */
  lines: Map<number, LineContent>;
  /** Visible row count — virtualizer's `count` (FR-001-FR-005). */
  totalLines: number;
  /** File-wide line count, for `useLineSelectionKeyboard`'s clamp bound. */
  fileTotalLines: number;
  /** Whether the background index has finished (SC-001). */
  indexingComplete: boolean;
  /** Requests the 1-based `[startIndex, startIndex + count)` view-row range be loaded. */
  loadRange: (startIndex: number, count: number) => void;
  /** Incremented each time `(timeFrom, timeTo)` resets the view, so consumers can re-sync scroll/loaded ranges. */
  viewVersion: number;
}

/**
 * Subscribes to `subscribe_index_progress` for `alias` and exposes
 * `loadRange` to fetch line content via `stream_lines` on demand
 * (FR-014/FR-016/FR-032, SC-001). When `hasTimestampFormat` is `true`,
 * `(timeFrom, timeTo)` changes are applied via `set_view_time_range`
 * (FR-001-FR-005, contracts/main-view-time-filter.md §1).
 */
export function useLogStream(
  alias: string | null,
  timeFrom: number | null,
  timeTo: number | null,
  hasTimestampFormat: boolean,
): UseLogStreamResult {
  const [lines, setLines] = useState<Map<number, LineContent>>(new Map());
  const [totalLines, setTotalLines] = useState(0);
  const [fileTotalLines, setFileTotalLines] = useState(0);
  const [indexingComplete, setIndexingComplete] = useState(false);
  const [viewVersion, setViewVersion] = useState(0);

  // Reset accumulated state during render when the alias changes, rather
  // than via an effect (https://react.dev/learn/you-might-not-need-an-effect).
  const [trackedAlias, setTrackedAlias] = useState(alias);
  if (alias !== trackedAlias) {
    setTrackedAlias(alias);
    setLines(new Map());
    setTotalLines(0);
    setFileTotalLines(0);
    setIndexingComplete(false);
  }

  useEffect(() => {
    if (!alias) {
      return;
    }

    subscribeIndexProgress(alias, (progress) => {
      setFileTotalLines(progress.indexed_lines);
      if (!hasTimestampFormat) {
        setTotalLines(progress.indexed_lines);
      }
      setIndexingComplete(progress.complete);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alias]);

  useEffect(() => {
    if (!alias || !hasTimestampFormat) {
      return;
    }

    setViewTimeRange(alias, timeFrom, timeTo).then((count) => {
      setTotalLines(count);
      setLines(new Map());
      setViewVersion((version) => version + 1);
    });
  }, [alias, timeFrom, timeTo, hasTimestampFormat]);

  const loadRange = useCallback(
    (startIndex: number, count: number) => {
      if (!alias || count <= 0) {
        return;
      }

      streamLines(alias, startIndex, count, (batch) => {
        setLines((prev) => {
          const next = new Map(prev);
          batch.lines.forEach((line, offset) => {
            next.set(batch.start_index + offset, line);
          });
          return next;
        });
      });
    },
    [alias],
  );

  return { lines, totalLines, fileTotalLines, indexingComplete, loadRange, viewVersion };
}
