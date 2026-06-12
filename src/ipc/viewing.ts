import { commands, type IndexProgress, type LineBatch } from "@/bindings";
import { Channel, unwrapResult } from "./client";

export type { IndexProgress, LineBatch };

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
