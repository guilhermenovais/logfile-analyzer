import { commands, type IndexProgress, type LineBatch, type LineContent } from "@/bindings";
import { Channel, unwrapResult } from "./client";

export type { IndexProgress, LineBatch, LineContent };

/**
 * Streams `count` lines starting at the 1-based `startIndex`, invoking
 * `onBatch` for each `LineBatch` as it arrives (FR-014/FR-032). Works
 * incrementally while the background index is still building.
 */
export async function streamLines(
  alias: string,
  startIndex: number,
  count: number,
  onBatch: (batch: LineBatch) => void,
): Promise<void> {
  const channel = new Channel<LineBatch>();
  channel.onmessage = onBatch;
  unwrapResult(await commands.streamLines(alias, startIndex, count, channel));
}

/**
 * Subscribes to background-indexing progress for `alias`, invoking
 * `onProgress` for each update until `complete` (SC-001).
 */
export async function subscribeIndexProgress(
  alias: string,
  onProgress: (progress: IndexProgress) => void,
): Promise<void> {
  const channel = new Channel<IndexProgress>();
  channel.onmessage = onProgress;
  unwrapResult(await commands.subscribeIndexProgress(alias, channel));
}

/**
 * Maps a 1-based file line index to its 1-based view-row under the current
 * view filter for `alias` (contracts/resolve-view-row.md).
 */
export async function resolveViewRow(
  alias: string,
  lineIndex: number,
): Promise<number> {
  return unwrapResult(await commands.resolveViewRow(alias, lineIndex));
}

/**
 * Recomputes the main view's time-range filter for `alias` and returns the
 * new visible line count (FR-001–FR-005, contracts/main-view-time-filter.md §1).
 */
export async function setViewTimeRange(
  alias: string,
  timeFrom: number | null,
  timeTo: number | null,
): Promise<number> {
  return unwrapResult(await commands.setViewTimeRange(alias, timeFrom, timeTo));
}
