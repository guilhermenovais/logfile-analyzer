import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useActiveWorkspace,
  useIsWorkspaceDirty,
  useCreateWorkspace,
  useSaveWorkspace,
  useDiscardDraft,
} = vi.hoisted(() => ({
  useActiveWorkspace: vi.fn(),
  useIsWorkspaceDirty: vi.fn(),
  useCreateWorkspace: vi.fn(),
  useSaveWorkspace: vi.fn(),
  useDiscardDraft: vi.fn(),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useActiveWorkspace,
  useIsWorkspaceDirty,
  useCreateWorkspace,
  useSaveWorkspace,
  useDiscardDraft,
}));

import { useWorkspaceActions, useWorkspaceActionsStore } from "./useWorkspaceActions";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useWorkspaceActions", () => {
  beforeEach(() => {
    useWorkspaceActionsStore.setState({
      view: "workspace",
      pendingAction: null,
      savePromptError: null,
    });
    useActiveWorkspace.mockReturnValue({ data: { alias: null, files: [] } });
    useIsWorkspaceDirty.mockReturnValue({ data: false });
    useCreateWorkspace.mockReturnValue({ mutate: vi.fn() });
    useSaveWorkspace.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useDiscardDraft.mockReturnValue({ mutate: vi.fn() });
  });

  describe("handleNewWorkspace", () => {
    it("when dirty, prompts for save instead of creating a workspace", () => {
      useIsWorkspaceDirty.mockReturnValue({ data: true });
      const createWorkspace = { mutate: vi.fn() };
      useCreateWorkspace.mockReturnValue(createWorkspace);
      useWorkspaceActionsStore.setState({ savePromptError: "stale error" });

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleNewWorkspace());

      expect(result.current.pendingAction).toBe("new");
      expect(result.current.savePromptError).toBeNull();
      expect(createWorkspace.mutate).not.toHaveBeenCalled();
    });

    it("when not dirty, creates a workspace directly", () => {
      const createWorkspace = { mutate: vi.fn() };
      useCreateWorkspace.mockReturnValue(createWorkspace);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleNewWorkspace());

      expect(createWorkspace.mutate).toHaveBeenCalledOnce();
      expect(result.current.pendingAction).toBeNull();
    });
  });

  describe("handleOpenSavedWorkspaces", () => {
    it("when dirty, prompts for save instead of switching views", () => {
      useIsWorkspaceDirty.mockReturnValue({ data: true });

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleOpenSavedWorkspaces());

      expect(result.current.pendingAction).toBe("saved");
      expect(result.current.view).toBe("workspace");
    });

    it("when not dirty, switches to the saved view directly", () => {
      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleOpenSavedWorkspaces());

      expect(result.current.view).toBe("saved");
      expect(result.current.pendingAction).toBeNull();
    });
  });

  describe("handleSave (FR-005)", () => {
    it("when the workspace has a non-empty alias, saves directly under it", () => {
      useActiveWorkspace.mockReturnValue({
        data: { alias: "my-investigation", files: [] },
      });
      const saveWorkspace = { mutate: vi.fn(), isPending: false };
      useSaveWorkspace.mockReturnValue(saveWorkspace);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSave());

      expect(saveWorkspace.mutate).toHaveBeenCalledWith("my-investigation");
      expect(result.current.pendingAction).toBeNull();
    });

    it("when the workspace alias is null, opens the save prompt", () => {
      useActiveWorkspace.mockReturnValue({ data: { alias: null, files: [] } });
      useWorkspaceActionsStore.setState({ savePromptError: "stale" });

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSave());

      expect(result.current.pendingAction).toBe("save");
      expect(result.current.savePromptError).toBeNull();
    });
  });

  describe("handleSavePromptSave", () => {
    it("on success with pendingAction 'new', clears state and creates a workspace", () => {
      useWorkspaceActionsStore.setState({
        pendingAction: "new",
        savePromptError: "old error",
      });
      const createWorkspace = { mutate: vi.fn() };
      useCreateWorkspace.mockReturnValue(createWorkspace);
      const saveWorkspace = {
        mutate: vi.fn((_alias: string, opts?: { onSuccess?: () => void }) =>
          opts?.onSuccess?.(),
        ),
        isPending: false,
      };
      useSaveWorkspace.mockReturnValue(saveWorkspace);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSavePromptSave("new-alias"));

      expect(result.current.pendingAction).toBeNull();
      expect(result.current.savePromptError).toBeNull();
      expect(createWorkspace.mutate).toHaveBeenCalledOnce();
    });

    it("on success with pendingAction 'saved', switches to the saved view", () => {
      useWorkspaceActionsStore.setState({ pendingAction: "saved" });
      const saveWorkspace = {
        mutate: vi.fn((_alias: string, opts?: { onSuccess?: () => void }) =>
          opts?.onSuccess?.(),
        ),
        isPending: false,
      };
      useSaveWorkspace.mockReturnValue(saveWorkspace);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSavePromptSave("new-alias"));

      expect(result.current.view).toBe("saved");
      expect(result.current.pendingAction).toBeNull();
    });

    it("on success with pendingAction 'save', is a no-op proceed", () => {
      useWorkspaceActionsStore.setState({ pendingAction: "save" });
      const createWorkspace = { mutate: vi.fn() };
      useCreateWorkspace.mockReturnValue(createWorkspace);
      const saveWorkspace = {
        mutate: vi.fn((_alias: string, opts?: { onSuccess?: () => void }) =>
          opts?.onSuccess?.(),
        ),
        isPending: false,
      };
      useSaveWorkspace.mockReturnValue(saveWorkspace);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSavePromptSave("named"));

      expect(result.current.pendingAction).toBeNull();
      expect(result.current.view).toBe("workspace");
      expect(createWorkspace.mutate).not.toHaveBeenCalled();
    });

    it("on error, sets savePromptError and leaves pendingAction set", () => {
      useWorkspaceActionsStore.setState({ pendingAction: "new" });
      const saveWorkspace = {
        mutate: vi.fn((_alias: string, opts?: { onError?: (err: Error) => void }) =>
          opts?.onError?.(new Error("alias taken")),
        ),
        isPending: false,
      };
      useSaveWorkspace.mockReturnValue(saveWorkspace);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSavePromptSave("taken"));

      expect(result.current.savePromptError).toBe("alias taken");
      expect(result.current.pendingAction).toBe("new");
    });
  });

  describe("handleSavePromptDiscard", () => {
    it("on success, clears state and proceeds with the pending action", () => {
      useWorkspaceActionsStore.setState({ pendingAction: "saved" });
      const discardDraft = {
        mutate: vi.fn((_arg: undefined, opts?: { onSuccess?: () => void }) =>
          opts?.onSuccess?.(),
        ),
      };
      useDiscardDraft.mockReturnValue(discardDraft);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSavePromptDiscard());

      expect(result.current.view).toBe("saved");
      expect(result.current.pendingAction).toBeNull();
    });

    it("on error, sets savePromptError and leaves pendingAction set", () => {
      useWorkspaceActionsStore.setState({ pendingAction: "new" });
      const discardDraft = {
        mutate: vi.fn((_arg: undefined, opts?: { onError?: (err: Error) => void }) =>
          opts?.onError?.(new Error("discard failed")),
        ),
      };
      useDiscardDraft.mockReturnValue(discardDraft);

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSavePromptDiscard());

      expect(result.current.savePromptError).toBe("discard failed");
      expect(result.current.pendingAction).toBe("new");
    });
  });

  describe("handleSavePromptCancel", () => {
    it("clears both pendingAction and savePromptError", () => {
      useWorkspaceActionsStore.setState({
        pendingAction: "new",
        savePromptError: "err",
      });

      const { result } = renderHook(() => useWorkspaceActions(), { wrapper });
      act(() => result.current.handleSavePromptCancel());

      expect(result.current.pendingAction).toBeNull();
      expect(result.current.savePromptError).toBeNull();
    });
  });
});
