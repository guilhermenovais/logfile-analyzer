import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspacePage } from "./WorkspacePage";

const { pickLogFile } = vi.hoisted(() => ({
  pickLogFile: vi.fn(),
}));

vi.mock("@/ipc/dialog", () => ({ pickLogFile }));

const {
  useActiveWorkspace,
  useAddFile,
  useCreateWorkspace,
  useDiscardDraft,
  useIsWorkspaceDirty,
  useRemoveFile,
  useSaveWorkspace,
} = vi.hoisted(() => ({
  useActiveWorkspace: vi.fn(),
  useAddFile: vi.fn(),
  useCreateWorkspace: vi.fn(),
  useDiscardDraft: vi.fn(),
  useIsWorkspaceDirty: vi.fn(),
  useRemoveFile: vi.fn(),
  useSaveWorkspace: vi.fn(),
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useActiveWorkspace,
  useAddFile,
  useCreateWorkspace,
  useDiscardDraft,
  useIsWorkspaceDirty,
  useRemoveFile,
  useSaveWorkspace,
}));

vi.mock("@/hooks/useHighlights", () => ({
  useHighlights: () => ({
    highlights: [],
    isLoading: false,
    error: null,
    addHighlight: vi.fn(),
    removeHighlight: vi.fn(),
    updateLabel: vi.fn(),
  }),
}));

describe("WorkspacePage - Add file dialog", () => {
  beforeEach(() => {
    pickLogFile.mockReset();
    useActiveWorkspace.mockReturnValue({
      data: { alias: "ws", files: [] },
      isLoading: false,
    });
    useAddFile.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    useCreateWorkspace.mockReturnValue({ mutate: vi.fn() });
    useDiscardDraft.mockReturnValue({ mutate: vi.fn() });
    useIsWorkspaceDirty.mockReturnValue({ data: false });
    useRemoveFile.mockReturnValue({ mutate: vi.fn() });
    useSaveWorkspace.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("populates the path input when a file is picked via the browse button", async () => {
    pickLogFile.mockResolvedValue("/home/user/logs/app.log");

    render(<WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "Add file" }));
    await userEvent.click(screen.getByRole("button", { name: "Browse for file" }));

    expect(pickLogFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText("Path")).toHaveValue(
      "/home/user/logs/app.log",
    );
  });

  it("leaves the path unchanged when the user cancels the picker", async () => {
    pickLogFile.mockResolvedValue(null);

    render(<WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "Add file" }));
    await userEvent.type(screen.getByLabelText("Path"), "/keep/me");
    await userEvent.click(screen.getByRole("button", { name: "Browse for file" }));

    expect(await screen.findByLabelText("Path")).toHaveValue("/keep/me");
  });
});
