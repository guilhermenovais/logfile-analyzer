# Research: Fix Search UX

## 1. Layout Overflow Root Cause

**Decision**: The overflow is caused by `SearchResultsPanel` and `SearchBar` being stacked vertically inside a `flex-col` parent (`<main>`) without height constraints, pushing the flex-1 `LogViewer` wrapper and other toolbar controls past the viewport edge.

**Rationale**: In `WorkspacePage.tsx`, the `<main className="flex flex-1 flex-col">` renders `SearchBar`, `SearchResultsPanel`, `LogViewToolbar`, optional `HighlightPanel`, and the `LogViewer` div (`flex-1 overflow-hidden`). When `SearchResultsPanel` opens with its `max-h-48` list plus header, the total height of non-flex-1 children exceeds available space at smaller viewport heights. The `SearchBar` and `SearchResultsPanel` both use `flex flex-col gap-2 border-b p-2` but have no `shrink-0` — however the real issue is that the results panel's `max-h-48` (12rem = 192px) plus the search bar (~56px) plus toolbar (~40px) can take substantial vertical space. At narrow viewports, the flex-1 LogViewer gets squeezed, but the controls within SearchBar's form row (input, select, button, history button) can get clipped horizontally if the parent is too narrow.

**Root cause for horizontal overflow**: The `SearchBar` form uses `flex items-center gap-2` but has no `min-w-0` on the flex child containing the input, and no `flex-wrap` for narrow viewports. The fixed-width elements (select, buttons) plus the flex-1 input can push past the container width.

**Root cause for vertical overflow**: The `SearchResultsPanel` has `max-h-48` on its list but the panel header area and wrapper div are unconstrained. When the results panel is open, the total non-flex-1 content can exceed the viewport, and the `SearchResultsPanel` wrapper has no `shrink-0` to prevent the flex layout from trying to shrink it.

**Fix approach**:
1. Add `shrink-0` to all non-LogViewer children in the main flex-col (SearchBar, SearchResultsPanel, LogViewToolbar, HighlightPanel) to prevent them from being squeezed but ensure they don't grow unbounded.
2. Constrain SearchResultsPanel with `max-h` and `overflow-hidden` on its outer wrapper, so it never pushes the layout past the viewport.
3. Add `min-w-0` on the SearchBar's input wrapper to prevent horizontal overflow.

**Alternatives considered**:
- Making SearchResultsPanel a floating overlay (rejected: inconsistent with panel-based UX, harder to maintain layout state)
- Making the entire main area scrollable (rejected: LogViewer already has its own virtualizer, double scrolling is confusing)

## 2. Click-to-Navigate from Search Results

**Decision**: The `selectMatch` action in `useSearchUiStore` already calls `useLineSelectionStore.selectLine(alias, lineIndex)` and increments `scrollNonce`. The `LogViewer` already watches `scrollToLine?.nonce` and calls `virtualizer.scrollToIndex(viewRow - 1, { align: "center" })`. So click-to-navigate **already works** through the `selectMatch` action.

**Rationale**: In `SearchResultsPanel.tsx:107-109`, clicking a result calls `useSearchUiStore.getState().selectMatch(alias, index)`. In `useSearchUiStore.ts:119-127`, `selectMatch` calls `selectLine` on the line selection store and bumps `scrollNonce`. In `WorkspacePage.tsx:145-146`, `scrollToLine` is derived from `useSearchUiStore.scrollToLine(alias)` which reads `scrollNonce`. In `LogViewer.tsx:167-178`, the `useEffect` watching `scrollToLine?.nonce` calls `virtualizer.scrollToIndex` with `align: "center"`.

**Verification needed**: The only gap is that `scrollToLine` and `searchMatchLines` in `WorkspacePage` are computed using the static `useSearchUiStore.scrollToLine()` and `useSearchUiStore.searchMatchLines()` functions (non-reactive reads off `getState()`). These are called inside the render body, which means they get the latest state because `WorkspacePage` re-renders when `searchSlice` changes (line 49). This pattern is correct.

**Conclusion**: Click-to-navigate works. The issue reported by the user is likely a side-effect of the layout overflow (Story 1) making the results panel unclickable, or the scroll not being visible because the LogViewer is squeezed. Fixing Story 1 should resolve this. No additional wiring needed.

**Alternatives considered**: None — the mechanism already exists and is correct.

## 3. Visible Scrollbar in Search Results Panel

**Decision**: Add a CSS utility class for visible scrollbar styling and apply it to the results panel's `<ul>` element.

**Rationale**: The results panel `<ul>` already has `overflow-auto` and `max-h-48`, so it scrolls — but the default scrollbar on many platforms (especially macOS/Webkit) is an overlay scrollbar that fades to invisible. A visible, always-present scrollbar requires explicit CSS.

**Fix approach**: Add a `scrollbar-visible` utility class in `App.css` targeting `::-webkit-scrollbar` (for WebKit/Blink, which is what Tauri's webview uses) with thin width, themed track/thumb colors using CSS variables. Apply this class to the `<ul>` in `SearchResultsPanel`. Since Tauri uses WebKit (on macOS/Linux) or WebView2 (on Windows), both support `-webkit-scrollbar` pseudo-elements.

**Alternatives considered**:
- Using `scrollbar-thin` Tailwind v4 utility (rejected: Tailwind CSS 4 has `scrollbar-color` and `scrollbar-width` utilities via the `scrollbar-*` namespace, but these are based on the CSS Scrollbar Styling Module which has limited WebKit support; `scrollbar-width` is not supported in WebKit)
- Using a virtual scrollbar library like `simplebar` (rejected: adds dependency, Constitution III favors minimal footprint)
- Relying on `overflow-y: scroll` to force scrollbar (rejected: shows empty scrollbar track when content fits)

## 4. Consistent Line Margins (Border Placeholder)

**Decision**: Apply the same `border-2 border-transparent` / `border-selected-line` pattern from `LogLine` to `SearchResultsPanel` result buttons.

**Rationale**: `LogLine.tsx:40-48` already applies `border-2` unconditionally and toggles between `border-selected-line` and `border-transparent` based on `isSelected`. The `SearchResultsPanel` result buttons (line 102-106) currently only get `border-2 border-selected-line` when selected but have no border at all when unselected, causing a 2px shift on selection.

**Fix approach**: Change the button's className logic to always include `border-2` and toggle between `border-selected-line` (selected) and `border-transparent` (unselected), exactly matching `LogLine`'s pattern.

**Alternatives considered**: None — the spec explicitly says to follow LogLine's existing pattern.

## 5. Scrollbar Styling for Consistency with LogViewer

**Decision**: Apply the same `scrollbar-visible` class to the LogViewer's scroll container for consistency, if it doesn't already have visible scrollbars.

**Rationale**: The spec says "consistent with the main log viewer's scrollbar" (Assumptions section). The LogViewer's `overflow-auto` div also uses the platform default scrollbar. Applying the same utility to both ensures visual consistency.

**Note**: This is a low-priority nice-to-have. The LogViewer's scrollbar is typically visible because the content area is large. Focus on the SearchResultsPanel scrollbar first.

## 6. Edge Cases

- **Zero results**: Panel already shows "No matches found." and the `<ul>` is not rendered, so no scrollbar/layout issues.
- **Rapid open/close**: `panelOpen` is toggled via Zustand, which batches updates. Layout uses flex, so toggling the panel is a single re-render with no animation issues.
- **Clicked line far from current scroll**: `virtualizer.scrollToIndex` with `align: "center"` handles this. The `loadRange` effect will fetch the new visible range after scroll.
- **Very narrow window (~800px)**: The SearchBar form should not overflow. Adding `min-w-0` on the input wrapper and ensuring the form uses `flex-wrap` for the controls would help, but the controls are small enough (~9rem for select + ~5rem for search button + ~2.25rem for history button ≈ ~16rem ≈ 256px) that they fit in 800px minus sidebar (~200px) = ~600px easily.
