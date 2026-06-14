import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSummary } from "@/ipc/workspace";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

const { pickLogFile } = vi.hoisted(() => ({
  pickLogFile: vi.fn(),
}));

vi.mock("@/ipc/dialog", () => ({ pickLogFile }));

const { useAddFile, useRenameWorkspace } = vi.hoisted(() => ({
  useAddFile: vi.fn(),
  useRenameWorkspace: vi.fn(),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useAddFile,
  useRenameWorkspace,
}));

function workspace(
  overrides: Partial<Pick<WorkspaceSummary, "alias" | "files">> = {},
): WorkspaceSummary {
  return {
    id: 1,
    alias: "my-workspace",
    is_draft: true,
    files: [],
    ...overrides,
  };
}

describe("WorkspaceSidebar", () => {
  beforeEach(() => {
    pickLogFile.mockReset();
    useAddFile.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    useRenameWorkspace.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it("renders the workspace alias at the top", () => {
    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace" })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    expect(screen.getByText("my-workspace")).toBeInTheDocument();
  });

  it('renders "Untitled workspace" when alias is null', () => {
    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: null })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    expect(screen.getByText("Untitled workspace")).toBeInTheDocument();
  });

  it("clicking the name switches to an editable input pre-filled with the current name", async () => {
    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace" })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("my-workspace"));

    expect(screen.getByRole("textbox", { name: "Workspace name" })).toHaveValue(
      "my-workspace",
    );
  });

  it("committing via Enter with a non-empty trimmed value calls useRenameWorkspace's mutate and exits edit mode on success", async () => {
    const mutate = vi.fn((_alias: string, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    useRenameWorkspace.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace" })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("my-workspace"));
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await userEvent.clear(input);
    await userEvent.type(input, "  renamed  {enter}");

    expect(mutate).toHaveBeenCalledWith("renamed", expect.anything());
    expect(
      screen.queryByRole("textbox", { name: "Workspace name" }),
    ).not.toBeInTheDocument();
  });

  it("committing an empty/whitespace-only value exits edit mode without calling the rename mutation and restores the previous name", async () => {
    const mutate = vi.fn();
    useRenameWorkspace.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace" })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("my-workspace"));
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await userEvent.clear(input);
    await userEvent.type(input, "   {enter}");

    expect(mutate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Workspace name" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("my-workspace")).toBeInTheDocument();
  });

  it("pressing Escape while editing exits edit mode, discards the draft text, and restores the original name without calling the mutation", async () => {
    const mutate = vi.fn();
    useRenameWorkspace.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace" })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("my-workspace"));
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await userEvent.clear(input);
    await userEvent.type(input, "discarded-name{Escape}");

    expect(mutate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: "Workspace name" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("my-workspace")).toBeInTheDocument();
  });

  it("shows an inline error and keeps edit mode active when the rename mutation fails", async () => {
    const mutate = vi.fn((_alias: string, options?: { onError?: (err: Error) => void }) => {
      options?.onError?.(new Error("workspace alias already in use"));
    });
    useRenameWorkspace.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace" })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("my-workspace"));
    const input = screen.getByRole("textbox", { name: "Workspace name" });
    await userEvent.clear(input);
    await userEvent.type(input, "taken{enter}");

    expect(
      await screen.findByText("workspace alias already in use"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Workspace name" })).toBeInTheDocument();
  });

  it('renders an "Add file" button that opens the add-file dialog', async () => {
    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace" })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Add file" }));

    expect(screen.getByRole("dialog", { name: "Add file" })).toBeInTheDocument();
  });

  it("renders each file with its alias plus availability/indexing indicators and a remove action", () => {
    render(
      <WorkspaceSidebar
        workspace={workspace({
          alias: "my-workspace",
          files: [
            {
              alias: "app",
              path: "/var/log/app.log",
              available: true,
              has_timestamp_format: true,
              indexing_complete: false,
            },
            {
              alias: "missing",
              path: "/var/log/missing.log",
              available: false,
              has_timestamp_format: false,
              indexing_complete: true,
            },
          ],
        })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    expect(screen.getByTitle("Indexing…")).toBeInTheDocument();
    expect(screen.getByTitle("File unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove app" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove missing" })).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no files", () => {
    render(
      <WorkspaceSidebar
        workspace={workspace({ alias: "my-workspace", files: [] })}
        selectedAlias={null}
        onSelectFile={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    expect(screen.getByText(/no files/i)).toBeInTheDocument();
  });
});
