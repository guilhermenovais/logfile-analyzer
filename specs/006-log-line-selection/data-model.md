# Data Model: Selectable Log Lines

All entities here are frontend-only, transient view state (per the spec's
Assumptions) — no SQLite schema or IPC payload changes.

## `LineSelectionState` (new Zustand store: `useLineSelectionStore`)

Per-alias slice, mirroring `SearchUiState`'s shape in `useSearchUiStore`:

```ts
interface LineSelectionSlice {
  /** 1-based line index of the selected line, or null if none. */
  selectedLine: number | null;
  /**
   * Incremented only when the selected line changes via arrow-key
   * navigation (FR-011). LogViewer and SearchResultsPanel watch this to
   * trigger scroll-follow (FR-012/FR-013). Click- and search-nav-driven
   * selection changes do NOT bump this (the row is already visible, or
   * useSearchUiStore's own scrollNonce already handles the scroll).
   */
  navNonce: number;
}

const DEFAULT_LINE_SELECTION_SLICE: LineSelectionSlice = {
  selectedLine: null,
  navNonce: 0,
};
```

Store shape and actions:

```ts
interface LineSelectionStoreState {
  slices: Record<string, LineSelectionSlice>;

  /**
   * Sets `selectedLine` for `alias` without bumping `navNonce`. Used by:
   * - LogLine's click handler (FR-001/FR-002/FR-003)
   * - useSearchUiStore's setResults/selectMatch/nextMatch/prevMatch (FR-010)
   */
  selectLine: (alias: string, lineIndex: number) => void;

  /**
   * Arrow-key navigation (FR-011/FR-014). `fallbackLine` is the line to
   * select if `selectedLine` is currently null (the "first visible line"
   * edge case). Clamps to [1, totalLines]; if the clamped result equals the
   * current line, state is unchanged (no-op at file bounds, scenario 5).
   * Otherwise sets `selectedLine` and bumps `navNonce`.
   */
  moveSelection: (
    alias: string,
    delta: 1 | -1,
    totalLines: number,
    fallbackLine: number,
  ) => void;
}
```

Non-reactive helper `getLineSelectionSlice(alias)` (mirrors
`getSearchUiSlice`) returns the slice or `DEFAULT_LINE_SELECTION_SLICE`.

**Relationships**:
- One slice per open file (alias), independent of every other alias (FR-016).
- `selectedLine` may or may not be a member of `useSearchUiStore`'s
  `slices[alias].results` for the same alias — `SearchResultsPanel` derives
  its own "is this match selected" boolean per row by comparing
  `match.line_index === selectedLine` (FR-008/FR-009).

## `LogLine` (new component: `src/components/LogLine.tsx`)

Presentational row shared by `LogViewer`'s normal (virtualized) and
"highlighted only" (flat list) render branches.

```ts
interface LogLineProps {
  lineIndex: number;          // 1-based
  content: string;
  wrap: boolean;
  highlight?: HighlightEntry;
  isSearchMatch?: boolean;     // normal view only; omitted/false in highlighted-only view
  isSelected: boolean;
  onToggleHighlight?: (lineIndex: number, isHighlighted: boolean) => void;
  onSelect: (lineIndex: number) => void; // called on plain click only (no drag-selection)
  /** Forwarded ref so SearchResultsPanel-driven consumers aren't needed here;
   *  used internally for style/position props passed through from LogViewer
   *  (absolute positioning for the virtualized branch). */
  style?: React.CSSProperties;
  className?: string;
}
```

Renders the star toggle button (`stopPropagation` on click, FR-018), the
content span (`whiteSpace: wrap ? "pre-wrap" : "pre"`), and the optional
highlight label — identical to the current inline markup in both `LogViewer`
branches, plus:
- `onClick` on the row: if `window.getSelection()?.toString()` is empty,
  calls `onSelect(lineIndex)`.
- `className` composition adds `border-2 border-selected-line` when
  `isSelected` (layered alongside existing `bg-accent` / `bg-search-match` /
  `ring-2 ring-inset ring-search-match` per FR-015).

## `useLineSelectionKeyboard` (new hook: `src/hooks/useLineSelectionKeyboard.ts`)

Not a data entity, but documents the inputs/outputs needed for the keyboard
behaviors (FR-006/FR-011/FR-019):

```ts
interface UseLineSelectionKeyboardOptions {
  alias: string;
  totalLines: number;
  selectedLine: number | null;
  /** 1-based index of the first currently-visible line (ref, read at
   *  keydown time to avoid stale closures as the user scrolls). */
  firstVisibleLineRef: React.RefObject<number>;
  /** Returns the full text of `lineIndex`, or undefined if not loaded. */
  getLineContent: (lineIndex: number) => string | undefined;
}
```

Side effects only (adds/removes a `window` `keydown` listener in a
`useEffect`); calls `useLineSelectionStore.getState().moveSelection(...)` for
Up/Down and `writeText(...)` (from `@tauri-apps/plugin-clipboard-manager`)
for Ctrl/Cmd+C.

## Existing entities touched

- **`SearchUiState`** (`useSearchUiStore`, unchanged shape): `setResults`,
  `selectMatch`, `nextMatch`, `prevMatch` additionally call
  `useLineSelectionStore.getState().selectLine(alias, <resulting match's
  line_index>)` (FR-010).
- **`HighlightEntry`** (unchanged): still the source of the star
  highlight/label shown by `LogLine`; orthogonal to selection (FR-015,
  FR-018).
- **`SearchMatchEntry`** (unchanged): `SearchResultsPanel` compares
  `match.line_index` against `LineSelectionSlice.selectedLine` to render the
  same `border-selected-line` treatment on the active match's row
  (FR-008/FR-009).

## New theme tokens (`src/App.css`)

```css
:root {
  --selected-line: oklch(0.623 0.214 259.815); /* Tailwind blue-500 */
}
.dark {
  --selected-line: oklch(0.707 0.165 254.624); /* Tailwind blue-400 */
}
@theme inline {
  --color-selected-line: var(--selected-line);
}
```
