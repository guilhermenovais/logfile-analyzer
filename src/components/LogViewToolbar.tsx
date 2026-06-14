import { List, ListX } from "lucide-react";
import {
  DEFAULT_LOG_VIEW_TOOLBAR_STATE,
  useLogViewToolbarStore,
} from "@/hooks/useLogViewToolbarStore";
import { useFileProperties } from "@/hooks/useFileProperties";
import { DEFAULT_SEARCH_UI_STATE, useSearchUiStore } from "@/hooks/useSearchUiStore";
import { TimeRangeField } from "./TimeRangeField";

export interface LogViewToolbarProps {
  alias: string;
  /** Whether the active file has a detected timestamp format (FR-001/FR-002). */
  hasTimestampFormat: boolean;
}

/**
 * Combined toolbar above the log content (data-model.md "`LogViewToolbar`
 * (NEW)"): the time-range filter (when the file has a detected timestamp
 * format), the "Highlighted only" filter, the highlighted-lines show/hide
 * toggle, and "Wrap lines" — all in one wrapping row (FR-001/FR-015).
 */
export function LogViewToolbar({ alias, hasTimestampFormat }: LogViewToolbarProps) {
  const { timeFrom, timeTo } = useSearchUiStore(
    (state) => state.slices[alias] ?? DEFAULT_SEARCH_UI_STATE,
  );
  const { highlightedOnly, highlightsVisible, wrap } = useLogViewToolbarStore(
    (state) => state.slices[alias] ?? DEFAULT_LOG_VIEW_TOOLBAR_STATE,
  );
  const { data: fileProperties } = useFileProperties(alias);
  const firstTimestamp = fileProperties?.first_timestamp ?? null;
  const lastTimestamp = fileProperties?.last_timestamp ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-2 text-sm">
      {hasTimestampFormat && (
        <>
          <TimeRangeField
            label="From"
            value={timeFrom}
            onChange={(value) =>
              useSearchUiStore.getState().setTimeRange(alias, value, timeTo)
            }
          />
          <TimeRangeField
            label="To"
            value={timeTo}
            onChange={(value) =>
              useSearchUiStore.getState().setTimeRange(alias, timeFrom, value)
            }
          />
          {(timeFrom !== null || timeTo !== null) && (
            <button
              type="button"
              className="text-xs hover:underline"
              onClick={() =>
                useSearchUiStore.getState().setTimeRange(alias, firstTimestamp, lastTimestamp)
              }
            >
              Clear
            </button>
          )}
        </>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={highlightedOnly}
          onChange={(event) =>
            useLogViewToolbarStore.getState().setHighlightedOnly(alias, event.target.checked)
          }
        />
        Highlighted only
      </label>

      <button
        type="button"
        aria-expanded={highlightsVisible}
        aria-controls="highlighted-lines-panel"
        className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent"
        onClick={() => useLogViewToolbarStore.getState().toggleHighlightsVisible(alias)}
      >
        {highlightsVisible ? <ListX size={14} /> : <List size={14} />}
        {highlightsVisible ? "Hide highlights" : "Show highlights"}
      </button>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={wrap}
          onChange={(event) =>
            useLogViewToolbarStore.getState().setWrap(alias, event.target.checked)
          }
        />
        Wrap lines
      </label>
    </div>
  );
}
