import { useState } from "react";
import { FeatureErrorBoundary } from "@/components/FeatureErrorBoundary";
import { HighlightPanel } from "@/components/HighlightPanel";
import { LogViewer } from "@/components/LogViewer";
import { SavePromptDialog } from "@/components/SavePromptDialog";
import { SearchBar } from "@/components/SearchBar";
import { SearchResultsPanel } from "@/components/SearchResultsPanel";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { useHighlights } from "@/hooks/useHighlights";
import { useSearchUiStore } from "@/hooks/useSearchUiStore";
import { useWorkspaceActions } from "@/hooks/useWorkspaceActions";
import { useActiveWorkspace, useRemoveFile } from "@/hooks/useWorkspace";
import { SavedWorkspacesPage } from "./SavedWorkspacesPage";

/**
 * Main workspace screen (US1): add-file dialog, file list with
 * availability/indexing status, and the `LogViewer` for the selected file.
 */
export function WorkspacePage() {
  const { data: workspace, isLoading } = useActiveWorkspace();
  const removeFile = useRemoveFile();
  const {
    view,
    pendingAction,
    savePromptError,
    setView,
    saveWorkspace,
    handleSavePromptSave,
    handleSavePromptDiscard,
    handleSavePromptCancel,
  } = useWorkspaceActions();

  const [selectedAlias, setSelectedAlias] = useState<string | null>(null);
  const [highlightedOnly, setHighlightedOnly] = useState(false);

  const highlights = useHighlights(selectedAlias);
  // Subscribing to the whole slice (rather than a derived value) ensures the
  // component re-renders on every change to it, so the `searchMatchLines`/
  // `scrollToLine` selectors below (read non-reactively) stay fresh.
  const searchSlice = useSearchUiStore(
    (state) => state.slices[selectedAlias ?? ""],
  );
  const panelOpen = searchSlice?.panelOpen ?? false;

  const files = workspace?.files ?? [];

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

  function handleRemoveFile(fileAlias: string) {
    removeFile.mutate(fileAlias);
    if (selectedAlias === fileAlias) {
      setSelectedAlias(null);
    }
  }

  return (
    <div className="flex h-full">
      <WorkspaceSidebar
        workspace={workspace}
        selectedAlias={selectedAlias}
        onSelectFile={setSelectedAlias}
        onRemoveFile={handleRemoveFile}
      />

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
            {panelOpen && (
              <FeatureErrorBoundary
                key={`search-results-${selectedAlias}`}
                label="Search results"
              >
                <SearchResultsPanel alias={selectedAlias} />
              </FeatureErrorBoundary>
            )}
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
                  searchMatchLines={useSearchUiStore.searchMatchLines(selectedAlias)}
                  scrollToLine={useSearchUiStore.scrollToLine(selectedAlias)}
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
