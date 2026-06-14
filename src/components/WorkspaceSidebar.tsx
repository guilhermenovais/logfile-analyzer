import { useState, type FormEvent, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderOpen } from "lucide-react";
import { useAddFile, useRenameWorkspace } from "@/hooks/useWorkspace";
import { pickLogFile } from "@/ipc/dialog";
import type { WorkspaceSummary } from "@/ipc/workspace";
import { cn } from "@/lib/utils";

export interface WorkspaceSidebarProps {
  workspace: WorkspaceSummary | undefined;
  selectedAlias: string | null;
  onSelectFile: (alias: string) => void;
  onRemoveFile: (alias: string) => void;
}

/**
 * Current-workspace panel: a renamable workspace name (FR-010-FR-013), an
 * "Add file" action, and the workspace's file list (FR-014-FR-016).
 */
export function WorkspaceSidebar({
  workspace,
  selectedAlias,
  onSelectFile,
  onRemoveFile,
}: WorkspaceSidebarProps) {
  const addFile = useAddFile();
  const renameWorkspace = useRenameWorkspace();

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [path, setPath] = useState("");
  const [alias, setAlias] = useState("");

  const files = workspace?.files ?? [];
  const displayName = workspace?.alias ?? "Untitled workspace";

  function startEditing() {
    setDraftName(workspace?.alias ?? "");
    setRenameError(null);
    setEditing(true);
  }

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed === "") {
      setEditing(false);
      setRenameError(null);
      return;
    }
    renameWorkspace.mutate(trimmed, {
      onSuccess: () => {
        setEditing(false);
        setRenameError(null);
      },
      onError: (err: Error) => setRenameError(err.message),
    });
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      commitRename();
    } else if (event.key === "Escape") {
      setEditing(false);
      setRenameError(null);
    }
  }

  function handleAddFile(event: FormEvent) {
    event.preventDefault();
    addFile.mutate(
      { path, alias: alias.trim() === "" ? undefined : alias.trim() },
      {
        onSuccess: (summary) => {
          onSelectFile(summary.alias);
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

  return (
    <aside className="flex w-64 flex-col border-r">
      <div className="flex flex-col gap-2 border-b p-2">
        {editing ? (
          <div className="flex flex-col gap-1">
            <input
              aria-label="Workspace name"
              autoFocus
              className="rounded border px-2 py-1 text-sm font-semibold"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={handleNameKeyDown}
              onBlur={commitRename}
            />
            {renameError && (
              <p className="text-xs text-destructive">{renameError}</p>
            )}
          </div>
        ) : (
          <h2
            className="cursor-pointer truncate text-sm font-semibold"
            title="Click to rename"
            onClick={startEditing}
          >
            {displayName}
          </h2>
        )}

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

      {files.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          No files in this workspace yet. Use "Add file" to get started.
        </p>
      ) : (
        <ul className="flex-1 overflow-auto py-1">
          {files.map((file) => (
            <li key={file.alias}>
              <div
                className={cn(
                  "flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-accent",
                  file.alias === selectedAlias && "bg-accent",
                )}
              >
                <button
                  type="button"
                  className="flex-1 truncate text-left"
                  onClick={() => onSelectFile(file.alias)}
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
                  onClick={() => onRemoveFile(file.alias)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
