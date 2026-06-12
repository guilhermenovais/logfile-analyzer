import {
  commands,
  type HighlightEntry,
  type HighlightOrigin,
} from "@/bindings";
import { unwrapResult } from "./client";

export type { HighlightEntry, HighlightOrigin };

/** Creates/updates a highlight (origin `user`) on `lineIndex` (FR-017/FR-018). */
export async function setHighlight(
  alias: string,
  lineIndex: number,
  label: string | null,
): Promise<void> {
  unwrapResult(await commands.setHighlight(alias, lineIndex, label));
}

/** Removes a highlight (and its label) from `lineIndex` (FR-017). */
export async function clearHighlight(
  alias: string,
  lineIndex: number,
): Promise<void> {
  unwrapResult(await commands.clearHighlight(alias, lineIndex));
}

/** Updates (or clears) the label on `lineIndex` (FR-018). */
export async function setLabel(
  alias: string,
  lineIndex: number,
  label: string | null,
): Promise<void> {
  unwrapResult(await commands.setLabel(alias, lineIndex, label));
}

/** Returns every highlighted line for `alias` with its current content (FR-020). */
export async function listHighlights(
  alias: string,
): Promise<HighlightEntry[]> {
  return unwrapResult(await commands.listHighlights(alias));
}
