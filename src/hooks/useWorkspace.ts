import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addFile, removeFile } from "@/ipc/files";
import {
  createWorkspace,
  discardDraft,
  getActiveWorkspace,
  isWorkspaceDirty,
  listSavedWorkspaces,
  openWorkspace,
  saveWorkspace,
} from "@/ipc/workspace";

export const workspaceQueryKey = ["workspace"] as const;
export const savedWorkspacesQueryKey = ["workspace", "saved"] as const;
export const workspaceDirtyQueryKey = ["workspace", "dirty"] as const;

/** The active (auto-recovered) workspace and its files (FR-005). */
export function useActiveWorkspace() {
  return useQuery({
    queryKey: workspaceQueryKey,
    queryFn: getActiveWorkspace,
  });
}

/** Starts a new draft workspace, replacing the previous draft (FR-006). */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkspace,
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceQueryKey, workspace);
    },
  });
}

/** Whether the active workspace is an unsaved draft with content (FR-006). */
export function useIsWorkspaceDirty() {
  return useQuery({
    queryKey: workspaceDirtyQueryKey,
    queryFn: isWorkspaceDirty,
  });
}

/** Persists the active draft under an alias (FR-008). */
export function useSaveWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveWorkspace,
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceQueryKey, workspace);
      void queryClient.invalidateQueries({ queryKey: workspaceDirtyQueryKey });
      void queryClient.invalidateQueries({ queryKey: savedWorkspacesQueryKey });
    },
  });
}

/** Drops the unsaved draft and starts a fresh one (FR-007). */
export function useDiscardDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: discardDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
      void queryClient.invalidateQueries({ queryKey: workspaceDirtyQueryKey });
    },
  });
}

/** Lists previously saved workspaces (FR-009). */
export function useSavedWorkspaces() {
  return useQuery({
    queryKey: savedWorkspacesQueryKey,
    queryFn: listSavedWorkspaces,
  });
}

/** Loads a previously saved workspace, making it active (FR-009). */
export function useOpenWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: openWorkspace,
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceQueryKey, workspace);
      void queryClient.invalidateQueries({ queryKey: workspaceDirtyQueryKey });
    },
  });
}

/** Adds a file to the active workspace (FR-002/FR-003). */
export function useAddFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, alias }: { path: string; alias?: string }) =>
      addFile(path, alias),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
    },
  });
}

/** Removes a file from the active workspace. */
export function useRemoveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alias: string) => removeFile(alias),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceQueryKey });
    },
  });
}
