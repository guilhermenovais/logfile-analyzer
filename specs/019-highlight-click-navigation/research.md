# Research: Highlight Click Navigation

**Feature Branch**: `019-highlight-click-navigation` | **Date**: 2026-06-22

## 1. How Search Results Click-to-Scroll Works (End-to-End)

### Decision: Reuse the same scroll signaling pattern for highlights

### Data Flow

1. User clicks a search result `<button>` in `SearchResultsPanel` (line 108)
2. Calls `useSearchUiStore.getState().selectMatch(alias, index)`
3. `selectMatch` (useSearchUiStore.ts:119-127):
   - Reads `line_index` from `results[index]`
   - Calls `useLineSelectionStore.getState().selectLine(alias, lineIndex)` — updates selection across all panels
   - Increments `scrollNonce` — signals "re-scroll needed"
   - Updates `currentMatchIndex`
4. `WorkspacePage` reads `useSearchUiStore.scrollToLine(selectedAlias)` → returns `{ lineIndex, nonce }` when `panelOpen && currentMatchIndex >= 0`
5. Passes as `scrollToLine` prop to `LogViewer`
6. `useScrollToLine` hook (useScrollToLine.ts:20-41) watches `scrollTarget?.nonce`:
   - Resolves 1-based `lineIndex` to 0-based view-row via `resolveViewRow()`
   - Calls `virtualizer.scrollToIndex(index, { align: "center" })`
   - Safety pass: repeats in `requestAnimationFrame`

### Key Insight

The scroll signal is a `{ lineIndex: number; nonce: number }` pair. The `useScrollToLine` hook is generic — it doesn't know or care about search. It just scrolls to `lineIndex` when `nonce` changes. We can feed it a second scroll target from highlight navigation.

## 2. Highlight Navigation Scroll Strategy

### Decision: Add a second `scrollToLine` source via WorkspacePage state

### Alternatives Considered

1. **New Zustand store (`useHighlightNavStore`)**: Consistent with search pattern but over-engineered — a whole file for 2 fields when the state is only used in WorkspacePage → LogViewer.

2. **Extend `useSearchUiStore`**: Would conflate search and highlight concerns. The store is already search-specific.

3. **Unified scroll target store**: Would require refactoring search to use it too — unnecessary scope creep.

4. **Two `useScrollToLine` calls in LogViewer** ← **Chosen**: Add a `highlightScrollToLine` prop to `LogViewer` and call `useScrollToLine` for both targets. Each hook instance has its own `generationRef`, so they don't interfere. The highlight scroll state lives as `useState` in `WorkspacePage` — no new store file needed.

### Rationale

- No modifications to existing stores
- No nonce collision risk (independent nonce spaces)
- Clean separation: search scrolling and highlight scrolling are independent concerns
- `useScrollToLine` is already generic enough to be called twice

## 3. HighlightPanel Click Handler Design

### Decision: Mirror SearchResultsPanel's button-per-entry pattern

### Implementation

- Convert each highlight entry's display area from a plain `<li>` with text content to a `<li>` containing a `<button>` (Constitution Principle V: accessible elements)
- The `<button>` wraps the line number and content spans
- The label `<input>` and remove `×` button remain outside the clickable button, as they have their own interactions
- Add `alias` prop so the panel can subscribe to `useLineSelectionStore` for selected state
- Add `onSelect: (lineIndex: number) => void` prop — WorkspacePage provides the handler that calls `selectLine` + bumps scroll nonce

### Selection Visual

- Same `border-selected-line` / `border-transparent` pattern as SearchResultsPanel (line 102-106)
- HighlightPanel subscribes to `useLineSelectionStore` for `selectedLine` (same as SearchResultsPanel line 25-27)
- Panel auto-scrolls its own selected entry into view on `navNonce` change (keyboard nav scroll-follow, same as SearchResultsPanel line 34-41)

## 4. Star Tooltip Implementation

### Decision: Native browser `title` attribute on the star `<button>`

### Rationale

- Spec clarification explicitly states "Native browser tooltip (`title` attribute)"
- Zero dependencies, zero new components
- Consistent with spec FR-005: no tooltip when label is `null`/empty

### Implementation

- In `LogLine.tsx`, add `title={highlight?.label ?? undefined}` to the star `<button>` element
- When `highlight` exists and has a non-null/non-empty `label`, the `title` attribute renders a native tooltip on hover
- When `highlight` is `undefined` or `label` is `null`, `title` is `undefined` (no attribute rendered)

## 5. Existing `useScrollToLine` Hook Reusability

### Decision: Fully reusable, no modifications needed

The hook accepts:
```typescript
interface UseScrollToLineArgs {
  alias: string;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollTarget: { lineIndex: number; nonce: number } | null;
  totalLines: number;
}
```

It watches `scrollTarget?.nonce` and calls `virtualizer.scrollToIndex(index, { align: "center" })`. This is completely generic. Calling it a second time in `LogViewer` with a different `scrollTarget` is safe because:
- Each call has its own `generationRef` (line 18)
- React's dependency array (`[scrollTarget?.nonce]`) scopes the effect to each instance
- The virtualizer's `scrollToIndex` is idempotent — the last one to fire wins, which is correct behavior

## 6. Files to Modify

| File | Change |
|------|--------|
| `src/components/HighlightPanel.tsx` | Add `alias`, `onSelect` props; wrap entries in `<button>`; subscribe to selection store; add selected styling and scroll-follow |
| `src/pages/WorkspacePage.tsx` | Add highlight scroll state; pass `alias`/`onSelect` to HighlightPanel; pass `highlightScrollToLine` to LogViewer |
| `src/components/LogViewer.tsx` | Add `highlightScrollToLine` prop; second `useScrollToLine` call |
| `src/components/LogLine.tsx` | Add `title` attribute to star button |

**No new files. No Rust changes. No new IPC commands. No new stores.**
