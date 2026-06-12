import { useState } from "react";
import type { HighlightEntry } from "@/ipc/highlights";

export interface HighlightPanelProps {
  /** Highlighted lines for the active file (FR-020), most recent first. */
  highlights: HighlightEntry[];
  /** Whether `highlights` is being (re)loaded. */
  isLoading: boolean;
  /** Message from the last failed highlight operation, if any. */
  error: string | null;
  /** Whether the log view is filtered to highlighted lines only (FR-019). */
  highlightedOnly: boolean;
  /** Toggles the "highlighted only" filter (FR-019). */
  onHighlightedOnlyChange: (value: boolean) => void;
  /** Updates (or clears, when `label` is `null`) a highlight's label (FR-018). */
  onUpdateLabel: (lineIndex: number, label: string | null) => void;
  /** Removes a highlight (FR-017). */
  onRemove: (lineIndex: number) => void;
}

/**
 * Lists highlighted lines for the active file, with inline label editing
 * (FR-018), removal (FR-017), and the "highlighted only" view filter
 * (FR-019).
 */
export function HighlightPanel({
  highlights,
  isLoading,
  error,
  highlightedOnly,
  onHighlightedOnlyChange,
  onUpdateLabel,
  onRemove,
}: HighlightPanelProps) {
  const [labelEdits, setLabelEdits] = useState<Record<number, string>>({});

  function handleLabelBlur(lineIndex: number, currentLabel: string | null) {
    const edited = labelEdits[lineIndex];
    if (edited === undefined) {
      return;
    }
    const trimmed = edited.trim();
    const next = trimmed === "" ? null : trimmed;
    if (next !== currentLabel) {
      onUpdateLabel(lineIndex, next);
    }
    setLabelEdits((edits) => {
      const rest = { ...edits };
      delete rest[lineIndex];
      return rest;
    });
  }

  const sorted = [...highlights].sort((a, b) => a.line_index - b.line_index);

  return (
    <div className="flex flex-col gap-2 border-b p-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={highlightedOnly}
          onChange={(event) => onHighlightedOnlyChange(event.target.checked)}
        />
        Highlighted only
      </label>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {isLoading && (
        <p className="text-xs text-muted-foreground">Loading highlights…</p>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No highlighted lines yet.
        </p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-auto text-xs">
          {sorted.map((highlight) => (
            <li
              key={highlight.line_index}
              className="flex items-center gap-2"
            >
              <span className="shrink-0 font-mono text-muted-foreground">
                {highlight.line_index}
              </span>
              <span className="flex-1 truncate font-mono">
                {highlight.content}
              </span>
              <input
                aria-label={`Label for line ${highlight.line_index}`}
                className="w-32 rounded border px-1 py-0.5"
                placeholder="Label"
                value={labelEdits[highlight.line_index] ?? highlight.label ?? ""}
                onChange={(event) =>
                  setLabelEdits((edits) => ({
                    ...edits,
                    [highlight.line_index]: event.target.value,
                  }))
                }
                onBlur={() =>
                  handleLabelBlur(highlight.line_index, highlight.label)
                }
              />
              <button
                type="button"
                aria-label={`Remove highlight from line ${highlight.line_index}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onRemove(highlight.line_index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
