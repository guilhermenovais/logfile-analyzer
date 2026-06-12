import { useCallback, useEffect, useState } from "react";
import { streamLines, subscribeIndexProgress } from "@/ipc/viewing";

export interface UseLogStreamResult {
  /** 1-based line index -> line content, for every line loaded so far. */
  lines: Map<number, string>;
  /** Number of lines indexed so far (grows until `indexingComplete`). */
  totalLines: number;
  /** Whether the background index has finished (SC-001). */
  indexingComplete: boolean;
  /** Requests the 1-based `[startIndex, startIndex + count)` range be loaded. */
  loadRange: (startIndex: number, count: number) => void;
}

/**
 * Subscribes to `subscribe_index_progress` for `alias` and exposes
 * `loadRange` to fetch line content via `stream_lines` on demand
 * (FR-014/FR-016/FR-032, SC-001).
 */
export function useLogStream(alias: string | null): UseLogStreamResult {
  const [lines, setLines] = useState<Map<number, string>>(new Map());
  const [totalLines, setTotalLines] = useState(0);
  const [indexingComplete, setIndexingComplete] = useState(false);

  // Reset accumulated state during render when the alias changes, rather
  // than via an effect (https://react.dev/learn/you-might-not-need-an-effect).
  const [trackedAlias, setTrackedAlias] = useState(alias);
  if (alias !== trackedAlias) {
    setTrackedAlias(alias);
    setLines(new Map());
    setTotalLines(0);
    setIndexingComplete(false);
  }

  useEffect(() => {
    if (!alias) {
      return;
    }

    subscribeIndexProgress(alias, (progress) => {
      setTotalLines(progress.indexed_lines);
      setIndexingComplete(progress.complete);
    });
  }, [alias]);

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

  return { lines, totalLines, indexingComplete, loadRange };
}
