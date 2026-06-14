# Research: Selectable Log Lines

## 1. Per-file selection state container

**Decision**: New Zustand store `useLineSelectionStore` (`src/hooks/useLineSelectionStore.ts`), keyed by alias, mirroring the existing `useSearchUiStore` per-alias slice pattern: `{ selectedLine: number | null; navNonce: number }`.

**Rationale**: Selection state must be read by three independent consumers (`LogViewer`, `SearchResultsPanel`, and the keyboard handler) and written from two of them plus `useSearchUiStore`'s match-navigation actions. `useSearchUiStore` already solves this exact cross-component-sync problem for search state via a per-alias Zustand slice + non-reactive `getState()` calls for cross-store writes. Reusing the proven pattern keeps the addition minimal and consistent (Principle III).

**Alternatives considered**:
- *Fold into `useSearchUiStore`*: rejected — selection exists and must persist even when no search has ever run for the file (FR-016), and conflating the two stores would force every search-state consumer to also depend on selection fields.
- *React Context*: rejected — would need a provider mounted above `LogViewer`/`SearchResultsPanel`/`WorkspacePage` and doesn't give the same `getState()` escape hatch `useSearchUiStore`'s actions already rely on for cross-store writes (FR-010).

## 2. Click vs. click-and-drag distinction

**Decision**: In the row's `onClick` handler, read `window.getSelection()?.toString()`. If non-empty, the click resulted from a drag-selection — do not change the selected line. If empty, treat as a plain click and call `selectLine(alias, lineIndex)`.

**Rationale**: Mousedown collapses any existing selection before a drag begins, and a completed drag-selection leaves `window.getSelection()` non-empty at the moment `click` fires. This needs no extra state (no mousedown/mouseup coordinate tracking, no thresholds), which matches Principle III ("simplest code that solves the stated problem").

**Alternatives considered**:
- *mousedown/mouseup pixel-delta tracking*: rejected — adds per-row mutable state and a movement-threshold constant to tune, for a distinction the browser's own selection API already gives us for free.

## 3. Row element stays a `<div>`, not a `<button>`

**Decision**: The per-line row (now extracted into `LogLine.tsx`) remains a non-interactive `<div>` with a click handler, not a `<button>`/`<a>`. The existing star highlight-toggle stays a `<button>` with `event.stopPropagation()` so it doesn't also trigger row selection (FR-018).

**Rationale**: FR-004 requires native click-and-drag text selection across the row's content (and across rows). Browsers generally don't allow drag-text-selection inside `<button>` elements, so wrapping the row in one would break the core multi-line text-selection requirement. Full keyboard equivalence is still provided: Up/Down arrow-key navigation (FR-011) moves the selected line globally whenever a file is open and focus isn't in a text input (FR-019), so the row itself does not need to be an independent tab stop. This is a narrow, deliberate deviation from Principle V's "`<div onClick>` is forbidden" — recorded in plan.md's Complexity Tracking table per the Governance section.

**Alternatives considered**:
- *`role="option"`/`tabIndex` div with `aria-selected`*: still wouldn't restore native drag-text-selection inside a focusable widget without extra workarounds, and would add a second (redundant) keyboard-interaction model alongside Up/Down arrow navigation.

## 4. Extract shared `LogLine` row component

**Decision**: New `src/components/LogLine.tsx` renders a single row (star button, content span, label), used by both `LogViewer`'s virtualized normal view and its "highlighted only" flat list.

**Rationale**: `LogViewer.tsx` is already at 211 lines, over the 200-line TSX guideline (Principle III), before this feature's additions (selection styling, click handling, keyboard hook wiring). The two existing render branches duplicate row markup; extracting `LogLine` removes that duplication and absorbs the new per-row logic (selected styling, click-to-select) without growing `LogViewer.tsx` further — a directly-required split, not speculative.

## 5. Arrow-key navigation & Ctrl+C scope

**Decision**: New hook `useLineSelectionKeyboard` (`src/hooks/useLineSelectionKeyboard.ts`), called from `LogViewer`, attaches a single `window` `keydown` listener for the lifetime of the component.

**Rationale**: `LogViewer` is only mounted while a file is open (`WorkspacePage` renders it conditionally on `selectedAlias`), so a listener scoped to its lifecycle automatically satisfies FR-019 ("active by default whenever a file is open") with no extra "is a file open" check. The handler bails early when `document.activeElement` is an `<input>`/`<textarea>`/`contentEditable` element (covers the search field and any other text inputs, per FR-011/FR-019's text-input exception) for both arrow-key navigation and Ctrl+C.

For Ctrl+C (FR-005/FR-006/FR-007): if `window.getSelection()?.toString()` is non-empty, do nothing (let the browser's default copy handle the highlighted span — FR-005). If empty and a line is selected, `preventDefault()` and copy that line's content via the clipboard plugin (FR-006). If empty and no line is selected, do nothing (FR-007).

For arrow keys (FR-011/FR-014): compute `current = selectedLine ?? firstVisibleLine` (the "no selection yet" fallback, edge case), clamp `current ± 1` to `[1, totalLines]`, and only update state (bumping `navNonce`) if the clamped value differs from `current` — so at-bounds presses are true no-ops (acceptance scenario 5).

## 6. Scroll-follow mechanism

**Decision**: `LogViewer` gains a second `useEffect` (alongside the existing search-driven `scrollToLine` effect) that watches `useLineSelectionStore`'s `navNonce` for the current alias and calls `virtualizer.scrollToIndex(selectedLine - 1, { align: "auto" })` when it changes.

**Rationale**: `align: "auto"` (TanStack Virtual) scrolls the minimum amount needed to bring an item into view — appropriate for single-line arrow-key steps (FR-012, "scroll as needed"). The existing search-match scroll effect keeps its `align: "center"` behavior for jumping to a (possibly distant) match, unchanged. Click-based selection doesn't bump `navNonce` (the clicked row is already visible), so no extra effect/scroll fires for FR-001–FR-003.

`SearchResultsPanel`'s match list is a small non-virtualized `<ul>`; on the same `navNonce` change, if the new selected line is among `results`, it calls `scrollIntoView({ block: "nearest" })` on that `<li>`'s ref (FR-013). If the new selected line isn't a match, the panel does nothing — scroll position and selection indicator stay put (FR-013 negative case).

## 7. `useSearchUiStore` ↔ selection store wiring

**Decision**: `useSearchUiStore`'s `setResults`, `selectMatch`, `nextMatch`, and `prevMatch` actions additionally call `useLineSelectionStore.getState().selectLine(alias, lineIndex)` for the resulting current match (FR-010). This is a plain cross-store `getState()` call, the same pattern `SearchResultsPanel` already uses for `useSearchUiStore.getState()`.

**Rationale**: Keeps the "search nav also drives selection" rule in one place (the search store's own navigation actions) rather than duplicating it in every UI component that can trigger prev/next/select-match.

## 8. Selected-line visual treatment

**Decision**: Add a new theme token pair, `--selected-line` (light/dark oklch blue) and `--color-selected-line` in `@theme inline` (`src/App.css`, following the existing `--search-match`/`--color-search-match` pattern). `LogLine` applies it as `border-2 border-selected-line` when the row is selected.

**Rationale**: FR-015 requires the selected-line indicator to stay visually distinguishable when combined with the existing highlight (`bg-accent`) and search-match (`bg-search-match` / `ring-2 ring-inset ring-search-match`) treatments. Tailwind's `ring-*` utilities compile to a single `box-shadow`, so a second `ring-*` color can't be layered on top of the search-match-combo's existing `ring-2 ring-inset ring-search-match` — but a real `border` composites independently with both `bg-*` and `ring-*` utilities, so all three indicators can coexist on one row.

## 9. Clipboard write

**Decision**: Reuse `writeText` from `@tauri-apps/plugin-clipboard-manager` (already a dependency, already capability-granted via `clipboard-manager:allow-write-text` in `src-tauri/capabilities/default.json`, already used in `src/components/AgentInstructionsDialog.tsx`).

**Rationale**: No new dependency, no new capability entry — directly satisfies Principle II/III.
