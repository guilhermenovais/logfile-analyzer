import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  clearHighlight,
  listHighlights,
  setHighlight,
  setLabel,
  type HighlightEntry,
} from "@/ipc/highlights";

export interface UseHighlightsResult {
  /** Highlighted lines for the active file (FR-020). */
  highlights: HighlightEntry[];
  /** Whether `highlights` is being (re)loaded. */
  isLoading: boolean;
  /** Message from the last failed operation, if any. */
  error: string | null;
  /** Highlights `lineIndex` with an optional label (FR-017/FR-018). */
  addHighlight: (lineIndex: number, label?: string | null) => void;
  /** Removes the highlight (and label) from `lineIndex` (FR-017). */
  removeHighlight: (lineIndex: number) => void;
  /** Updates (or clears) the label on `lineIndex` (FR-018). */
  updateLabel: (lineIndex: number, label: string | null) => void;
}

function highlightsQueryKey(alias: string | null) {
  return ["highlights", alias] as const;
}

/**
 * Loads and manages highlighted lines for `alias` (FR-017–FR-020), shared
 * with the MCP `list_highlights`/`set_highlight`/`clear_highlight` tools
 * (FR-029).
 */
export function useHighlights(alias: string | null): UseHighlightsResult {
  const queryClient = useQueryClient();

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: highlightsQueryKey(alias),
    queryFn: () => listHighlights(alias as string),
    enabled: alias !== null,
  });

  function invalidate() {
    if (alias) {
      void queryClient.invalidateQueries({ queryKey: highlightsQueryKey(alias) });
    }
  }

  const setHighlightMutation = useMutation({
    mutationFn: ({
      lineIndex,
      label,
    }: {
      lineIndex: number;
      label: string | null;
    }) => setHighlight(alias as string, lineIndex, label),
    onSuccess: invalidate,
  });

  const clearHighlightMutation = useMutation({
    mutationFn: (lineIndex: number) => clearHighlight(alias as string, lineIndex),
    onSuccess: invalidate,
  });

  const setLabelMutation = useMutation({
    mutationFn: ({
      lineIndex,
      label,
    }: {
      lineIndex: number;
      label: string | null;
    }) => setLabel(alias as string, lineIndex, label),
    onSuccess: invalidate,
  });

  const failure =
    setHighlightMutation.error ??
    clearHighlightMutation.error ??
    setLabelMutation.error ??
    queryError;

  return {
    highlights: data ?? [],
    isLoading,
    error: failure
      ? failure instanceof Error
        ? failure.message
        : String(failure)
      : null,
    addHighlight: (lineIndex, label = null) =>
      setHighlightMutation.mutate({ lineIndex, label }),
    removeHighlight: (lineIndex) => clearHighlightMutation.mutate(lineIndex),
    updateLabel: (lineIndex, label) =>
      setLabelMutation.mutate({ lineIndex, label }),
  };
}
