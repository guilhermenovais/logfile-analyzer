# Phase 1 Data Model: Streamlined Log Viewer Header

No SQLite schema changes. One additive IPC field change
(`FileProperties`) plus frontend-only state (new Zustand store, an extension
to `useSearchUiStore`'s existing per-alias slice, and two new components).

---

## IPC/runtime entity: `FileProperties` (CHANGED — additive fields)

`src-tauri/src/commands/types.rs` / `src/bindings/index.ts`
(`get_file_properties` Tauri command, FR-027/FR-029, used by
`useFileProperties`):

```ts
type FileProperties = {
  total_lines: number;
  has_timestamp_format: boolean;
  available: boolean;
  indexing_complete: boolean;
  first_timestamp: number | null; // NEW — epoch-ms (f64), FR-011
  last_timestamp: number | null;  // NEW — epoch-ms (f64), FR-011
};
```

- **`first_timestamp`/`last_timestamp`**: the epoch-ms value of the first and
  last entries of `FileIndex.line_timestamps` that are `Some` (i.e., the first
  and last lines containing a recognizable timestamp), in line order.
- Both are `null` when `has_timestamp_format` is `false`, when indexing is not
  yet complete, or (defensively) when `line_timestamps` is `None`/has no
  `Some` entries despite a detected profile.
- `f64`, not `i64`, per the existing `SearchHistoryEntry.time_from`/`time_to`
  convention (specta/tauri-specta forbid exporting 64-bit integers; epoch-ms
  values are always exactly representable as `f64`).
- The MCP `get_file_properties` tool's `GetFilePropertiesOutput`
  (`src-tauri/src/mcp/tools.rs`) is unchanged — it's built field-by-field and
  this feature has no MCP-facing requirement.

See `contracts/file-properties.md` for the full before/after contract.

---

## Frontend-only state

### `useLogViewToolbarStore` (NEW Zustand store)

Per-alias slice, mirroring `useSearchUiStore`'s/`useLineSelectionStore`'s
pattern (`slices: Record<string, LogViewToolbarState>`, defaults returned for
any alias not yet present):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `highlightedOnly` | `boolean` | `false` | FR-006 — moved from `WorkspacePage`'s local `useState`. Controls whether `LogViewer` shows all lines or only highlighted ones. |
| `highlightsVisible` | `boolean` | `false` | FR-003/FR-004/FR-005 — whether `HighlightPanel`'s list is rendered. Independent of `highlightedOnly` (FR-005/FR-006). |
| `wrap` | `boolean` | `false` | Moved from `LogViewer`'s local `useState`. Per-file "Wrap lines" preference (Assumptions: placement changes, behavior doesn't). |

**Actions**:
- `setHighlightedOnly(alias, value)`
- `toggleHighlightsVisible(alias)` — FR-005 (does not touch `highlightedOnly`
  or the underlying highlight set)
- `setWrap(alias, value)`

**Reset semantics**: any alias not yet present in `slices` returns the
defaults above — satisfies US2 Scenario 5 ("switches to a different file...
the highlighted lines list starts hidden for that file as well") without
extra reset logic.

### `useSearchUiStore` (CHANGED — `SearchUiState` extension)

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `timeRangeInitialized` | `boolean` | `false` | NEW. Set to `true` by (a) the new `initializeTimeRange` action once a pre-fill has been applied, or (b) any call to the existing `setTimeRange` action (user typed/picked/cleared a value) — whichever happens first. |

**New action**:
- `initializeTimeRange(alias, timeFrom, timeTo)`: if the slice's
  `timeRangeInitialized` is `false`, sets `timeFrom`/`timeTo` to the given
  values and `timeRangeInitialized = true`; otherwise a no-op. Called once
  per file from `WorkspacePage` when `useFileProperties` reports non-null
  `first_timestamp`/`last_timestamp` (FR-011–FR-013, research.md §6).

**Changed action**:
- `setTimeRange(alias, timeFrom, timeTo)`: unchanged behavior, plus now also
  sets `timeRangeInitialized = true` (so a manual edit/clear before indexing
  finishes "wins" over a later pre-fill).

---

## Component contracts

### `LogViewToolbar` (NEW — `src/components/LogViewToolbar.tsx`)

The single combined row (FR-001/FR-002). Replaces: the time-range block
removed from `SearchBar`, the "Highlighted only" checkbox removed from
`HighlightPanel`, and the "Wrap lines" checkbox removed from `LogViewer`.

```ts
interface LogViewToolbarProps {
  /** Workspace alias of the active file. */
  alias: string;
  /** Whether the active file has a detected timestamp format (FR-002). */
  hasTimestampFormat: boolean;
}
```

Reads/writes `useLogViewToolbarStore` and (for the time-range fields)
`useSearchUiStore`, both keyed by `alias`. Renders, in a single
`flex flex-wrap items-center gap-2` row:
1. (if `hasTimestampFormat`) `<TimeRangeField label="From" .../>`,
   `<TimeRangeField label="To" .../>`, and the existing "Clear" button
   (shown when either bound is set) — FR-001, FR-007–FR-013.
2. "Highlighted only" checkbox bound to
   `useLogViewToolbarStore`'s `highlightedOnly` — FR-001/FR-002/FR-006.
3. A show/hide button beside it, bound to `highlightsVisible`
   (`toggleHighlightsVisible`), `aria-expanded={highlightsVisible}`,
   `aria-controls` pointing at the `HighlightPanel` list's id — FR-003/FR-005.
4. "Wrap lines" checkbox bound to `wrap` (`setWrap`) — moved from
   `LogViewer`, FR-001/FR-002.

For files without a detected timestamp format, item 1 is omitted entirely
(FR-002); items 2–4 still render.

### `TimeRangeField` (NEW — `src/components/TimeRangeField.tsx`)

```ts
interface TimeRangeFieldProps {
  /** "From" or "To" — used for the visible label and aria-label. */
  label: "From" | "To";
  /** Current committed value (epoch-ms), or `null` if unset. */
  value: number | null;
  /** Called with the new committed value (epoch-ms), or `null` to clear. */
  onChange: (value: number | null) => void;
  disabled?: boolean;
}
```

Internal state: `text` (the typed buffer, initialized from `value` via the
`YYYY-MM-DD HH:mm` formatter, research.md §4), `invalid: boolean`, `open:
boolean` (popover).

- Typing + blur/Enter (FR-007): parses `text`; if valid, calls `onChange` and
  clears `invalid`; if invalid/incomplete, sets `invalid = true` (red outline,
  `aria-invalid`) and does **not** call `onChange` (FR-010) — `value`/`text`
  revert to the last committed value on next external update.
- Popover button (FR-008): opens a `@radix-ui/react-popover` containing a
  `react-day-picker` month grid plus hour/minute `<input type="number">`
  steppers, seeded from `value` (or "now" if unset).
- Selecting a day, or changing hour/minute, immediately calls `onChange` with
  the combined value and closes the popover (FR-009) by setting
  `open = false`.

### `HighlightPanel` (CHANGED — narrower responsibility)

Drops the "Highlighted only" checkbox and its props (`highlightedOnly`,
`onHighlightedOnlyChange` — now owned by `LogViewToolbar`/
`useLogViewToolbarStore`). Remaining props (`highlights`, `isLoading`,
`error`, `onUpdateLabel`, `onRemove`) and the list rendering/empty-state are
unchanged (US2 Scenario 4). Rendered by `WorkspacePage` only when
`highlightsVisible` is `true` (FR-004).

### `LogViewer` (CHANGED — `wrap` becomes a prop)

Drops the local `wrap` `useState` and its checkbox row (moved to
`LogViewToolbar`). Adds:

```ts
interface LogViewerProps {
  // ...existing fields...
  /** Wrap long lines (now owned by `useLogViewToolbarStore`). */
  wrap: boolean;
}
```

No other behavior change.

### `SearchBar` (CHANGED — narrower responsibility)

Drops the entire time-range block (the `hasTimestampFormat &&` section) and
its now-unused `toDatetimeLocalValue`/`fromDatetimeLocalValue` helpers (moved/
adapted into `TimeRangeField`, research.md §4). The search form row (query,
type, submit, history) is unchanged, per the spec's Assumptions ("not the
search query/type input row, which is unaffected").

### `WorkspacePage` (CHANGED — wiring)

- Removes the local `highlightedOnly` `useState`; reads/writes it via
  `useLogViewToolbarStore` instead.
- Adds `useFileProperties(selectedAlias)` and an effect that calls
  `useSearchUiStore.getState().initializeTimeRange(...)` once
  `first_timestamp`/`last_timestamp` are available (research.md §6).
- Renders `LogViewToolbar` between `SearchBar`/`SearchResultsPanel` and the
  conditionally-rendered `HighlightPanel` (now gated on
  `highlightsVisible`) and `LogViewer` (now passed `wrap` from the store).
