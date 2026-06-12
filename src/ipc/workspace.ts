import { commands, type WorkspaceSummary } from "@/bindings";
import { unwrapResult } from "./client";

export type { WorkspaceSummary };

/** Starts a new draft workspace (FR-006). */
export async function createWorkspace(): Promise<WorkspaceSummary> {
  return unwrapResult(await commands.createWorkspace());
}

/** Returns the active (auto-recovered) workspace and its files (FR-005). */
export async function getActiveWorkspace(): Promise<WorkspaceSummary> {
  return unwrapResult(await commands.getActiveWorkspace());
}

/** Persists the active draft under `alias` (FR-008). */
export async function saveWorkspace(alias: string): Promise<WorkspaceSummary> {
  return unwrapResult(await commands.saveWorkspace(alias));
}

/** Drops the unsaved draft and starts a fresh one (FR-007). */
export async function discardDraft(): Promise<void> {
  unwrapResult(await commands.discardDraft());
}

/** Returns every saved (non-draft) workspace (FR-009). */
export async function listSavedWorkspaces(): Promise<WorkspaceSummary[]> {
  return unwrapResult(await commands.listSavedWorkspaces());
}

/** Loads a previously saved workspace, making it the active workspace (FR-009). */
export async function openWorkspace(id: number): Promise<WorkspaceSummary> {
  return unwrapResult(await commands.openWorkspace(id));
}

/** Whether the active workspace is an unsaved draft with content (FR-006). */
export async function isWorkspaceDirty(): Promise<boolean> {
  return unwrapResult(await commands.isWorkspaceDirty()).dirty;
}
