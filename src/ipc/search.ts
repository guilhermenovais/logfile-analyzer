import {
  commands,
  type ContextMatch,
  type SearchHistoryEntry,
  type SearchMatchBatch,
  type SearchType,
  type SearchWithContextBatch,
} from "@/bindings";
import { Channel, unwrapResult } from "./client";

export type {
  ContextMatch,
  SearchHistoryEntry,
  SearchMatchBatch,
  SearchType,
  SearchWithContextBatch,
};

/**
 * Streams every matching line for `query` over `alias` (FR-021–FR-023),
 * optionally restricted to lines whose detected timestamp falls within
 * `[timeFrom, timeTo]` (epoch-ms, FR-012/FR-013), invoking `onBatch` for each
 * batch as it arrives, and records the search in history (FR-024).
 */
export async function search(
  alias: string,
  query: string,
  searchType: SearchType,
  timeFrom: number | null,
  timeTo: number | null,
  onBatch: (batch: SearchMatchBatch) => void,
  offset?: number | null,
): Promise<void> {
  const channel = new Channel<SearchMatchBatch>();
  channel.onmessage = onBatch;
  unwrapResult(
    await commands.search(
      alias,
      query,
      searchType,
      timeFrom,
      timeTo,
      offset ?? null,
      channel,
    ),
  );
}

/**
 * Streams every match for `query` over `alias` with up to
 * `surroundingCount` lines of context (FR-021–FR-025), optionally restricted
 * to lines whose detected timestamp falls within `[timeFrom, timeTo]`
 * (epoch-ms, FR-012/FR-013), invoking `onBatch` as results arrive, and
 * records the search in history (FR-024).
 */
export async function searchWithContext(
  alias: string,
  query: string,
  searchType: SearchType,
  surroundingCount: number | null,
  timeFrom: number | null,
  timeTo: number | null,
  onBatch: (batch: SearchWithContextBatch) => void,
): Promise<void> {
  const channel = new Channel<SearchWithContextBatch>();
  channel.onmessage = onBatch;
  unwrapResult(
    await commands.searchWithContext(
      alias,
      query,
      searchType,
      surroundingCount,
      timeFrom,
      timeTo,
      channel,
    ),
  );
}

/**
 * Returns the active workspace's recorded search history, most recently
 * used first (FR-013/FR-024).
 */
export async function getSearchHistory(): Promise<SearchHistoryEntry[]> {
  return unwrapResult(await commands.getSearchHistory());
}
