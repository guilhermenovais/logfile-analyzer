import {
  commands,
  type FileProperties,
  type LineContent,
  type LogFileSummary,
} from "@/bindings";
import { unwrapResult } from "./client";

export type { FileProperties, LineContent, LogFileSummary };

/**
 * Adds a file to the active workspace (FR-002/FR-003). `alias` defaults to
 * the file name without its extension when omitted.
 */
export async function addFile(
  path: string,
  alias?: string,
): Promise<LogFileSummary> {
  return unwrapResult(await commands.addFile(path, alias ?? null));
}

/** Lists the files in the active workspace (FR-026). */
export async function listFiles(): Promise<LogFileSummary[]> {
  return unwrapResult(await commands.listFiles());
}

/** Returns line-count, timestamp-detection, and indexing status (FR-027). */
export async function getFileProperties(
  alias: string,
): Promise<FileProperties> {
  return unwrapResult(await commands.getFileProperties(alias));
}

/** Returns the content of the 1-based `lineIndex` (FR-028). */
export async function getLine(
  alias: string,
  lineIndex: number,
): Promise<LineContent> {
  return unwrapResult(await commands.getLine(alias, lineIndex));
}

/** Removes a file (and its highlights/search history) from the workspace. */
export async function removeFile(alias: string): Promise<void> {
  unwrapResult(await commands.removeFile(alias));
}
