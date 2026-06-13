import { useOpenWorkspace, useSavedWorkspaces } from "@/hooks/useWorkspace";

export interface SavedWorkspacesPageProps {
  /** Returns to the previous (active workspace) view. */
  onClose: () => void;
}

/**
 * Browser for previously saved workspaces (US6/FR-009): lists each saved
 * workspace with its files, marking files missing on disk as unavailable,
 * and reopens the selected workspace as the active one.
 */
export function SavedWorkspacesPage({ onClose }: SavedWorkspacesPageProps) {
  const { data, isLoading, error } = useSavedWorkspaces();
  const openWorkspace = useOpenWorkspace();

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h1 className="text-sm font-semibold">Saved workspaces</h1>
        <button
          type="button"
          onClick={onClose}
          className="rounded border px-2 py-1 text-xs hover:bg-accent"
        >
          Back
        </button>
      </div>

      <div className="flex-1 overflow-auto py-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">
            No saved workspaces yet.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {data?.map((workspace) => (
            <li key={workspace.id} className="rounded border p-2">
              <button
                type="button"
                disabled={openWorkspace.isPending}
                className="w-full text-left text-sm font-medium hover:underline disabled:opacity-50"
                onClick={() =>
                  openWorkspace.mutate(workspace.id, { onSuccess: onClose })
                }
              >
                {workspace.alias ?? "Untitled"}
              </button>
              <ul className="mt-1 flex flex-col gap-0.5 pl-3 text-xs text-muted-foreground">
                {workspace.files.map((file) => (
                  <li key={file.alias} className="flex items-center gap-1">
                    <span>{file.alias}</span>
                    {!file.available && (
                      <span className="text-destructive">(unavailable)</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
