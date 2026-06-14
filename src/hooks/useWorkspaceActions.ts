import { create } from "zustand";
import {
  useActiveWorkspace,
  useCreateWorkspace,
  useDiscardDraft,
  useIsWorkspaceDirty,
  useSaveWorkspace,
} from "@/hooks/useWorkspace";

export type WorkspaceShellView = "workspace" | "saved";
export type PendingWorkspaceAction = "new" | "saved" | "save" | null;

interface WorkspaceActionsStoreState {
  view: WorkspaceShellView;
  pendingAction: PendingWorkspaceAction;
  savePromptError: string | null;
  setView: (view: WorkspaceShellView) => void;
  setPendingAction: (pendingAction: PendingWorkspaceAction) => void;
  setSavePromptError: (savePromptError: string | null) => void;
}

/** Shared "New"/"Open"/"Save" shell state (data-model.md), following
 *  `useSearchUiStore`'s precedent. */
export const useWorkspaceActionsStore = create<WorkspaceActionsStoreState>((set) => ({
  view: "workspace",
  pendingAction: null,
  savePromptError: null,
  setView: (view) => set({ view }),
  setPendingAction: (pendingAction) => set({ pendingAction }),
  setSavePromptError: (savePromptError) => set({ savePromptError }),
}));

/**
 * Shared "New"/"Open"/"Save" workspace-action handlers and the
 * save-prompt/saved-view state they drive (data-model.md), consumed by both
 * `MenuBar` (via `App.tsx`) and `WorkspacePage`.
 */
export function useWorkspaceActions() {
  const { data: workspace } = useActiveWorkspace();
  const isDirty = useIsWorkspaceDirty();
  const createWorkspace = useCreateWorkspace();
  const saveWorkspace = useSaveWorkspace();
  const discardDraft = useDiscardDraft();

  const view = useWorkspaceActionsStore((state) => state.view);
  const pendingAction = useWorkspaceActionsStore((state) => state.pendingAction);
  const savePromptError = useWorkspaceActionsStore((state) => state.savePromptError);
  const setView = useWorkspaceActionsStore((state) => state.setView);
  const setPendingAction = useWorkspaceActionsStore((state) => state.setPendingAction);
  const setSavePromptError = useWorkspaceActionsStore((state) => state.setSavePromptError);

  /** Continues the action that was blocked on the save prompt (`"save"` is a no-op). */
  function proceedPendingAction(action: PendingWorkspaceAction) {
    if (action === "new") {
      createWorkspace.mutate();
    } else if (action === "saved") {
      setView("saved");
    }
  }

  function handleNewWorkspace() {
    if (isDirty.data) {
      setSavePromptError(null);
      setPendingAction("new");
    } else {
      createWorkspace.mutate();
    }
  }

  function handleOpenSavedWorkspaces() {
    if (isDirty.data) {
      setSavePromptError(null);
      setPendingAction("saved");
    } else {
      setView("saved");
    }
  }

  /** Saves under the current alias directly, or prompts for one (FR-005). */
  function handleSave() {
    const alias = workspace?.alias;
    if (alias) {
      saveWorkspace.mutate(alias);
    } else {
      setSavePromptError(null);
      setPendingAction("save");
    }
  }

  function handleSavePromptSave(alias: string) {
    saveWorkspace.mutate(alias, {
      onSuccess: () => {
        setSavePromptError(null);
        const action = pendingAction;
        setPendingAction(null);
        proceedPendingAction(action);
      },
      onError: (err: Error) => setSavePromptError(err.message),
    });
  }

  function handleSavePromptDiscard() {
    discardDraft.mutate(undefined, {
      onSuccess: () => {
        setSavePromptError(null);
        const action = pendingAction;
        setPendingAction(null);
        proceedPendingAction(action);
      },
      onError: (err: Error) => setSavePromptError(err.message),
    });
  }

  function handleSavePromptCancel() {
    setPendingAction(null);
    setSavePromptError(null);
  }

  return {
    view,
    pendingAction,
    savePromptError,
    setView,
    saveWorkspace,
    handleNewWorkspace,
    handleOpenSavedWorkspaces,
    handleSave,
    handleSavePromptSave,
    handleSavePromptDiscard,
    handleSavePromptCancel,
  };
}
