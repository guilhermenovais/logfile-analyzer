import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderOpen } from "lucide-react";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { HighlightPanel } from "@/components/HighlightPanel";
import { LogViewer } from "@/components/LogViewer";
import { SavePromptDialog } from "@/components/SavePromptDialog";
import { SearchBar } from "@/components/SearchBar";
import { useHighlights } from "@/hooks/useHighlights";
import { pickLogFile } from "@/ipc/dialog";
import {
  useActiveWorkspace,
  useAddFile,
  useCreateWorkspace,
  useDiscardDraft,
  useIsWorkspaceDirty,
  useRemoveFile,
  useSaveWorkspace,
} from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import { SavedWorkspacesPage } from "./SavedWorkspacesPage";

/** Which action triggered the save/discard prompt (FR-006). */
type PendingAction = "new" | "saved";

/**
 * Main workspace screen (US1): add-file dialog, file list with
 * availability/indexing status, and the `LogViewer` for the selected file.
 */
export function WorkspacePage() {
  const { data: workspace, isLoading } = useActiveWorkspace();
  const addFile = useAddFile();
  const removeFile = useRemoveFile();
  const isDirty = useIsWorkspaceDirty();
  const createWorkspace = useCreateWorkspace();
  const saveWorkspace = useSaveWorkspace();
  const discardDraft = useDiscardDraft();

  const [selectedAlias, setSelectedAlias] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");
  const [highlightedOnly, setHighlightedOnly] = useState(false);
  const [view, setView] = useState<"workspace" | "saved">("workspace");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [savePromptError, setSavePromptError] = useState<string | null>(null);

  const highlights = useHighlights(selectedAlias);

  const files = workspace?.files ?? [];

  function runOrPromptSave(action: PendingAction, run: () => void) {
    if (isDirty.data) {
      setSavePromptError(null);
      setPendingAction(action);
    } else {
      run();
    }
  }

  function proceedPendingAction(action: PendingAction) {
    if (action === "new") {
      createWorkspace.mutate();
    } else {
      setView("saved");
    }
  }

  function handleNewWorkspace() {
    runOrPromptSave("new", () => createWorkspace.mutate());
  }

  function handleOpenSavedWorkspaces() {
    runOrPromptSave("saved", () => setView("saved"));
  }

  function handleSavePromptSave(saveAlias: string) {
    saveWorkspace.mutate(saveAlias, {
      onSuccess: () => {
        setSavePromptError(null);
        const action = pendingAction;
        setPendingAction(null);
        if (action) proceedPendingAction(action);
      },
      onError: (err) => setSavePromptError(err.message),
    });
  }

  function handleSavePromptDiscard() {
    discardDraft.mutate(undefined, {
      onSuccess: () => {
        setSavePromptError(null);
        const action = pendingAction;
        setPendingAction(null);
        if (action) proceedPendingAction(action);
      },
      onError: (err) => setSavePromptError(err.message),
    });
  }

  function handleSavePromptCancel() {
    setPendingAction(null);
    setSavePromptError(null);
  }

  function handleToggleHighlight(lineIndex: number, isHighlighted: boolean) {
    if (isHighlighted) {
      highlights.removeHighlight(lineIndex);
    } else {
      highlights.addHighlight(lineIndex);
    }
  }

  if (view === "saved") {
    return <SavedWorkspacesPage onClose={() => setView("workspace")} />;
  }

  function handleAddFile(event: FormEvent) {
    event.preventDefault();
    addFile.mutate(
      { path, alias: alias.trim() === "" ? undefined : alias.trim() },
      {
        onSuccess: (summary) => {
          setSelectedAlias(summary.alias);
          setDialogOpen(false);
          setPath("");
          setAlias("");
        },
      },
    );
  }

  async function handleBrowseForFile() {
    const selected = await pickLogFile();
    if (selected) {
      setPath(selected);
    }
  }

  function handleRemoveFile(fileAlias: string) {
    removeFile.mutate(fileAlias);
    if (selectedAlias === fileAlias) {
      setSelectedAlias(null);
    }
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col border-r">
        <div className="flex items-center justify-between gap-2 border-b p-2">
          <h2 className="truncate text-sm font-semibold">
            {workspace?.alias ?? "Untitled workspace"}
          </h2>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs hover:bg-accent"
              onClick={handleNewWorkspace}
            >
              New
            </button>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs hover:bg-accent"
              onClick={handleOpenSavedWorkspaces}
            >
              Saved
            </button>
          </div>
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs hover:bg-accent"
              >
                Add file
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50" />
              <Dialog.Content className="fixed top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
                <Dialog.Title className="text-sm font-semibold">
                  Add file
                </Dialog.Title>
                <form
                  onSubmit={handleAddFile}
                  className="mt-3 flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1 text-xs">
                    <label htmlFor="add-file-path">Path</label>
                    <div className="flex gap-1">
                      <input
                        id="add-file-path"
                        className="flex-1 rounded border px-2 py-1 text-sm"
                        value={path}
                        onChange={(event) => setPath(event.target.value)}
                        required
                      />
                      <button
                        type="button"
                        aria-label="Browse for file"
                        onClick={handleBrowseForFile}
                        className="rounded border px-2 py-1 hover:bg-accent"
                      >
                        <FolderOpen size={16} />
                      </button>
                    </div>
                  </div>
                  <label className="flex flex-col gap-1 text-xs">
                    Alias (optional)
                    <input
                      className="rounded border px-2 py-1 text-sm"
                      value={alias}
                      onChange={(event) => setAlias(event.target.value)}
                    />
                  </label>
                  {addFile.isError && (
                    <p className="text-xs text-destructive">
                      {addFile.error.message}
                    </p>
                  )}
                  <div className="mt-1 flex justify-end gap-2">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs hover:bg-accent"
                      >
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      type="submit"
                      disabled={addFile.isPending}
                      className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>

        <ul className="flex-1 overflow-auto">
          {files.map((file) => (
            <li key={file.alias}>
              <div
                className={cn(
                  "flex items-center justify-between gap-1 px-2 py-1 text-sm hover:bg-accent",
                  file.alias === selectedAlias && "bg-accent",
                )}
              >
                <button
                  type="button"
                  className="flex-1 truncate text-left"
                  onClick={() => setSelectedAlias(file.alias)}
                >
                  {file.alias}
                  {!file.available && (
                    <span title="File unavailable" className="ml-1">
                      ⚠
                    </span>
                  )}
                  {file.available && !file.indexing_complete && (
                    <span title="Indexing…" className="ml-1">
                      …
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${file.alias}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => handleRemoveFile(file.alias)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex flex-1 flex-col">
        {isLoading && (
          <p className="p-4 text-sm text-muted-foreground">
            Loading workspace…
          </p>
        )}
        {!isLoading && selectedAlias && (
          <>
            <FeatureErrorBoundary key={`search-${selectedAlias}`} label="Search">
              <SearchBar
                alias={selectedAlias}
                hasTimestampFormat={
                  files.find((file) => file.alias === selectedAlias)
                    ?.has_timestamp_format ?? false
                }
              />
            </FeatureErrorBoundary>
            <FeatureErrorBoundary
              key={`highlights-${selectedAlias}`}
              label="Highlights"
            >
              <HighlightPanel
                highlights={highlights.highlights}
                isLoading={highlights.isLoading}
                error={highlights.error}
                highlightedOnly={highlightedOnly}
                onHighlightedOnlyChange={setHighlightedOnly}
                onUpdateLabel={highlights.updateLabel}
                onRemove={highlights.removeHighlight}
              />
            </FeatureErrorBoundary>
            <div className="flex-1 overflow-hidden">
              <FeatureErrorBoundary
                key={`log-viewer-${selectedAlias}`}
                label="Log viewer"
              >
                <LogViewer
                  alias={selectedAlias}
                  highlights={highlights.highlights}
                  highlightedOnly={highlightedOnly}
                  onToggleHighlight={handleToggleHighlight}
                />
              </FeatureErrorBoundary>
            </div>
          </>
        )}
        {!isLoading && !selectedAlias && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a file to view its contents.
          </div>
        )}
      </main>

      <SavePromptDialog
        open={pendingAction !== null}
        error={savePromptError}
        isSaving={saveWorkspace.isPending}
        onSave={handleSavePromptSave}
        onDiscard={handleSavePromptDiscard}
        onCancel={handleSavePromptCancel}
      />
    </div>
  );
}
