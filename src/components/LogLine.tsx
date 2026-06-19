import type { HighlightEntry } from "@/ipc/highlights";
import { cn } from "@/lib/utils";

export interface LogLineProps {
  /** 1-based line index. */
  lineIndex: number;
  content: string;
  wrap: boolean;
  highlight?: HighlightEntry;
  /** Normal view only; omitted/false in the "Highlighted only" view. */
  isSearchMatch?: boolean;
  isSelected: boolean;
  /** Called when the user toggles the highlight on this line (FR-017). */
  onToggleHighlight?: (lineIndex: number, isHighlighted: boolean) => void;
  /** Called on a plain click only, not after a drag-selection (FR-001-FR-004). */
  onSelect: (lineIndex: number) => void;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Shared per-line row (star highlight toggle, content, optional label),
 * used by both of `LogViewer`'s render branches (research.md §2-4).
 */
export function LogLine({
  lineIndex,
  content,
  wrap,
  highlight,
  isSearchMatch,
  isSelected,
  onToggleHighlight,
  onSelect,
  style,
  className,
}: LogLineProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border-2",
        highlight && "bg-accent",
        isSearchMatch &&
          (highlight
            ? "ring-2 ring-inset ring-search-match"
            : "bg-search-match"),
        isSelected ? "border-selected-line" : "border-transparent",
        className,
      )}
      style={style}
      onClick={() => {
        if (!window.getSelection()?.toString()) {
          onSelect(lineIndex);
        }
      }}
    >
      <button
        type="button"
        aria-label={
          highlight
            ? `Remove highlight from line ${lineIndex}`
            : `Highlight line ${lineIndex}`
        }
        className="shrink-0"
        onClick={(event) => {
          event.stopPropagation();
          onToggleHighlight?.(lineIndex, !!highlight);
        }}
      >
        {highlight ? "★" : "☆"}
      </button>
      <span style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}>{content}</span>
      {highlight?.label && (
        <span className="text-xs text-muted-foreground">
          {highlight.label}
        </span>
      )}
    </div>
  );
}
