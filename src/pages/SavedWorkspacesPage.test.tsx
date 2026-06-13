import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSummary } from "@/ipc/workspace";
import { SavedWorkspacesPage } from "./SavedWorkspacesPage";

const { useSavedWorkspaces, useOpenWorkspace } = vi.hoisted(() => ({
  useSavedWorkspaces: vi.fn(),
  useOpenWorkspace: vi.fn(),
}));

vi.mock("@/hooks/useWorkspace", () => ({ useSavedWorkspaces, useOpenWorkspace }));

const workspaceA: WorkspaceSummary = {
  id: 1,
  alias: "investigation-a",
  is_draft: false,
  files: [
    { alias: "app", path: "/var/log/app.log", available: true, has_timestamp_format: false, indexing_complete: false },
    { alias: "db", path: "/var/log/db.log", available: false, has_timestamp_format: false, indexing_complete: false },
  ],
};

function mockQuery(overrides: Partial<ReturnType<typeof useSavedWorkspaces>> = {}) {
  return {
    data: undefined,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function mockMutation(overrides: Partial<ReturnType<typeof useOpenWorkspace>> = {}) {
  return {
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  };
}

describe("SavedWorkspacesPage", () => {
  it("shows a loading message", () => {
    useSavedWorkspaces.mockReturnValue(mockQuery({ isLoading: true }));
    useOpenWorkspace.mockReturnValue(mockMutation());

    render(<SavedWorkspacesPage onClose={() => {}} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows a message when there are no saved workspaces", () => {
    useSavedWorkspaces.mockReturnValue(mockQuery({ data: [] }));
    useOpenWorkspace.mockReturnValue(mockMutation());

    render(<SavedWorkspacesPage onClose={() => {}} />);

    expect(screen.getByText(/no saved workspaces/i)).toBeInTheDocument();
  });

  it("lists saved workspaces with their files, marking unavailable ones", () => {
    useSavedWorkspaces.mockReturnValue(mockQuery({ data: [workspaceA] }));
    useOpenWorkspace.mockReturnValue(mockMutation());

    render(<SavedWorkspacesPage onClose={() => {}} />);

    expect(screen.getByText("investigation-a")).toBeInTheDocument();
    expect(screen.getByText("app")).toBeInTheDocument();
    expect(screen.getByText("db")).toBeInTheDocument();
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it("opens a workspace and closes the page on success", async () => {
    const mutate = vi.fn(
      (
        _id: number,
        opts?: { onSuccess?: () => void },
      ) => opts?.onSuccess?.(),
    );
    useSavedWorkspaces.mockReturnValue(mockQuery({ data: [workspaceA] }));
    useOpenWorkspace.mockReturnValue(mockMutation({ mutate }));
    const onClose = vi.fn();

    render(<SavedWorkspacesPage onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /investigation-a/i }));

    expect(mutate).toHaveBeenCalledWith(1, expect.anything());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error message", () => {
    useSavedWorkspaces.mockReturnValue(mockQuery({ error: new Error("Io: disk error") }));
    useOpenWorkspace.mockReturnValue(mockMutation());

    render(<SavedWorkspacesPage onClose={() => {}} />);

    expect(screen.getByText(/disk error/i)).toBeInTheDocument();
  });

  it("calls onClose when Back is clicked", async () => {
    useSavedWorkspaces.mockReturnValue(mockQuery({ data: [] }));
    useOpenWorkspace.mockReturnValue(mockMutation());
    const onClose = vi.fn();

    render(<SavedWorkspacesPage onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
