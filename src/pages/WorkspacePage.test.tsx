import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogViewerProps } from "@/components/LogViewer";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
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

vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    isSearching: false,
    error: null,
    runSearch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSearchHistory", () => ({
  useSearchHistory: () => ({
    history: [],
    isLoading: false,
    suggestions: () => [],
  }),
}));

const { LogViewer } = vi.hoisted(() => ({
  LogViewer: vi.fn<(props: LogViewerProps) => React.ReactElement>(() => (
    <div data-testid="log-viewer" />
  )),
}));

vi.mock("@/components/LogViewer", () => ({ LogViewer }));

describe("WorkspacePage - Search results panel", () => {
  beforeEach(() => {
    LogViewer.mockClear();
    useSearchUiStore.setState({ slices: {} });
    useActiveWorkspace.mockReturnValue({
      data: {
        alias: "ws",
        files: [
          {
            alias: "app",
            available: true,
            indexing_complete: true,
            has_timestamp_format: false,
          },
        ],
      },
      isLoading: false,
    });
    useAddFile.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    useCreateWorkspace.mockReturnValue({ mutate: vi.fn() });
    useDiscardDraft.mockReturnValue({ mutate: vi.fn() });
    useIsWorkspaceDirty.mockReturnValue({ data: false });
    useRemoveFile.mockReturnValue({ mutate: vi.fn() });
    useSaveWorkspace.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders SearchResultsPanel and updates LogViewer's scrollToLine prop when a row is clicked", async () => {
    render(<WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "app" }));

    act(() => {
      useSearchUiStore.getState().setResults(
        "app",
        [
          { line_index: 2, content: "connecting to db" },
          { line_index: 7, content: "another error" },
        ],
        false,
      );
    });

    expect(screen.getByText("connecting to db")).toBeInTheDocument();

    const callsBeforeClick = LogViewer.mock.calls;
    const lastPropsBeforeClick = callsBeforeClick[callsBeforeClick.length - 1]?.[0];
    expect(lastPropsBeforeClick?.searchMatchLines).toEqual([2, 7]);

    await userEvent.click(screen.getByText("another error"));

    const callsAfterClick = LogViewer.mock.calls;
    const lastPropsAfterClick = callsAfterClick[callsAfterClick.length - 1]?.[0];
    expect(lastPropsAfterClick?.scrollToLine).not.toEqual(
      lastPropsBeforeClick?.scrollToLine,
    );
    expect(lastPropsAfterClick?.scrollToLine?.lineIndex).toBe(7);
  });

  it("closing the results panel removes it and clears LogViewer's searchMatchLines/scrollToLine while preserving the query (FR-007/FR-008)", async () => {
    render(<WorkspacePage />);

    await userEvent.click(screen.getByRole("button", { name: "app" }));
    await userEvent.type(screen.getByLabelText("Search query"), '"error"');

    act(() => {
      useSearchUiStore.getState().setResults(
        "app",
        [
          { line_index: 2, content: "connecting to db" },
          { line_index: 7, content: "another error" },
        ],
        false,
      );
    });

    expect(screen.getByText("connecting to db")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Close search results" }),
    );

    expect(screen.queryByText("connecting to db")).not.toBeInTheDocument();

    const calls = LogViewer.mock.calls;
    const lastProps = calls[calls.length - 1]?.[0];
    expect(lastProps?.searchMatchLines).toEqual([]);
    expect(lastProps?.scrollToLine).toBeNull();

    expect(screen.getByLabelText("Search query")).toHaveValue('"error"');
  });
});

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
