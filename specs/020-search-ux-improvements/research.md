# Research: Search UX Improvements

**Feature**: `020-search-ux-improvements` | **Date**: 2026-06-22

## 1. Tooltip Approach

**Decision**: Use native HTML `title` attributes for all tooltips.

**Rationale**: The project already uses native `title` attributes for tooltips
(e.g., `LogLine.tsx` star button at line 58, `WorkspaceSidebar.tsx` file items).
Adding `@radix-ui/react-tooltip` would introduce a new dependency for a simple
feature that native HTML handles well. Native `title` attributes are accessible
by default (screen readers announce them) and require zero configuration.

**Alternatives considered**:
- `@radix-ui/react-tooltip`: Provides styled, controlled-delay tooltips. Rejected
  because the added dependency and wrapper complexity is disproportionate to the
  benefit. SC-002 specifies "within 300ms" which native tooltips approximate
  adequately (browser-controlled, typically 400-800ms). If precise timing becomes
  a requirement, this can be revisited.
- Custom CSS tooltip via `::after` pseudo-element: More control than native but
  adds CSS complexity and accessibility concerns. Rejected for simplicity.

## 2. Keyboard Shortcut Implementation

**Decision**: Add Shift+Up/Down handling to the existing
`useLineSelectionKeyboard` hook, placed before the `isTextInput()` early-return
guard so shortcuts work regardless of focus.

**Rationale**: The spec (FR-009) and clarification explicitly state that
Shift+Up/Down must work globally regardless of focus. The existing `isTextInput`
guard at the top of `handleKeyDown` blocks all keyboard handling in text inputs.
To satisfy FR-009, the Shift+arrow handler must be checked before this guard.

The handler calls `useSearchUiStore.getState().nextMatch(alias)` /
`.prevMatch(alias)`, which already exist and handle wrap-around.

**Alternatives considered**:
- Separate `useEffect` hook for search shortcuts: Would duplicate event listener
  setup. Rejected — adding to the existing hook keeps the keyboard logic
  centralized.
- Blocking Shift+Up/Down in text inputs (matching existing ArrowUp/Down
  behavior): Rejected per explicit clarification in spec.

## 3. Horizontal Scrolling vs Wrap Lines

**Decision**: Default to horizontal scrolling (no wrap). Add a toggle that
switches between `overflow-x-auto whitespace-pre` (scroll mode) and
`whitespace-pre-wrap break-all` (wrap mode) on the results list.

**Rationale**: The spec defaults wrap to OFF (FR-011) and horizontal scrolling
is the primary experience. The `truncate` class currently on result line content
(`SearchResultsPanel.tsx:115`) clips content — replacing it with
`whitespace-pre overflow-x-auto` on the container allows horizontal scrolling.
When wrap is enabled, `whitespace-pre-wrap break-all` wraps long lines within
the panel.

The wrap toggle state lives in `useSearchUiStore` as `wrapLines: boolean`
(per-file, session-scoped, defaults to `false`). This is consistent with how the
main view's wrap toggle lives in `useLogViewToolbarStore`.

**Alternatives considered**:
- Global wrap preference (not per-file): Rejected because users may want
  different settings for different files open simultaneously.
- Persistent wrap preference (across sessions): Rejected per spec assumption
  "session-level persistence is sufficient."

## 4. Pagination Strategy

**Decision**: Stateless re-scan with offset/limit parameters. The `search`
command accepts an optional `offset: u32` parameter and returns a new
`total_count: u32` field in `SearchMatchBatch`.

**Rationale**: The current `scan_matches()` function (Rayon parallel iterator
over mmap) finds ALL matching line indices in a single fast pass. The total count
is `match_indices.len()` — already computed, just not exposed. Adding `offset`
lets the frontend request any page: `match_indices[offset..offset+500]`.

Re-scanning per page change is acceptable because:
1. The file is mmap'd — no disk I/O for repeated scans
2. Rayon parallelizes across CPU cores — typical scan <100ms
3. No backend session state needed (Principle III)

The frontend stores `currentPage` and `totalCount` in `useSearchUiStore`.
Page changes call `search()` with the appropriate offset. New searches reset
to page 0.

**Alternatives considered**:
- Backend-cached search session (store match indices, serve pages from cache):
  More complex, requires session lifecycle management, cache invalidation.
  Rejected per Principle III (simplicity).
- Frontend receives all match indices (just u32 numbers), requests content per
  page: Potentially millions of u32s for large files; IPC payload could exceed
  100KB limit (Principle VI). Rejected.
- Two-phase async (return first page immediately, compute total async):
  Unnecessary — `scan_matches` already computes the total during the same pass
  that finds the first 500. No separate async step needed.

## 5. Larger Button Sizing

**Decision**: Increase navigation and close button click targets to at least
28×28px using Tailwind utility classes (`min-w-7 min-h-7` = 28px) with flexbox
centering. Add `rounded hover:bg-accent` for visual feedback.

**Rationale**: SC-006 requires "at least 28×28 pixels." Current buttons are
unstyled text characters (↑, ↓, ×) with no explicit size — they render at
~16×16px depending on font. Adding `min-w-7 min-h-7 flex items-center
justify-center` ensures the 28px minimum while keeping the text symbols.

**Alternatives considered**:
- Replace text symbols with Lucide icons (`ChevronUp`, `ChevronDown`, `X`):
  Would be more visually consistent with the rest of the app (SearchBar uses
  Lucide `Clock`). Could be done as a follow-up but is not required by the spec.
  For simplicity, keeping text symbols with larger hit targets satisfies
  requirements.

## 6. Pagination UX Controls

**Decision**: Add simple Previous/Next page buttons below the results list
when `totalCount > PAGE_SIZE`. Show a page indicator like "Page 1 of 3".
Display a spinner overlay on the results list during page transitions.

**Rationale**: The spec requires next/previous page controls (FR-014), a
loading indicator during transitions (FR-017), and an updated match counter
showing position within the full set (FR-015, e.g. "501 of 1200"). A simple
prev/next pagination bar is the minimal implementation that satisfies all
requirements without over-engineering.

The match counter format changes from `"X of Y"` to `"X of Y"` where Y is
`totalCount` (not `results.length`). When `truncated` is true and `totalCount`
is known, the counter shows the global position: e.g., on page 2 with match
index 3, counter shows "503 of 1200".

**Alternatives considered**:
- Infinite scroll (auto-load next page on scroll to bottom): More complex,
  requires managing growing result arrays, potential memory issues with very
  large result sets. Rejected per Principle III.
- Jump-to-page input: Over-engineering for the expected use case. Users
  typically page forward sequentially through results. Rejected.

## 7. Edge Case: Keyboard Navigation Across Page Boundaries

**Decision**: Keyboard shortcuts (Shift+Up/Down) stay within the current page.
Users must explicitly change pages.

**Rationale**: This is explicitly stated in the spec edge cases: "Navigation
should stay within the current page; the user must explicitly change pages."
When the user reaches the last match on a page and presses Shift+Down, selection
wraps to the first match on the same page (consistent with the existing
wrap-around behavior of `nextMatch`/`prevMatch`).

## 8. Edge Case: Wrap Toggle Scroll Preservation

**Decision**: After toggling wrap, scroll the currently selected match entry
into view.

**Rationale**: The spec edge case says "scroll position should be preserved as
closely as possible to keep the currently selected match visible." Toggling
wrap changes line heights, which shifts scroll positions. The simplest fix:
after toggling, call `scrollIntoView({ block: "nearest" })` on the selected
entry. This is triggered by bumping `navNonce` in the line selection store,
which the existing `useEffect` in `SearchResultsPanel` already watches.
