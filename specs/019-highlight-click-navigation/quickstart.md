# Quickstart: Highlight Click Navigation

**Feature Branch**: `019-highlight-click-navigation` | **Date**: 2026-06-22

## Overview

Add click-to-navigate behavior to the highlights panel (mirroring search results) and star tooltip showing highlight labels in the main log view. Pure frontend feature — no Rust/IPC changes.

## Prerequisites

```bash
git checkout 019-highlight-click-navigation
npm install    # if needed
npm run dev    # start Vite dev server
cargo tauri dev # start Tauri dev mode
```

## What to Change

### 1. LogLine Star Tooltip (FR-004/FR-005)

**File**: `src/components/LogLine.tsx`

Add `title` attribute to the star `<button>`:
```tsx
<button
  type="button"
  title={highlight?.label ?? undefined}
  aria-label={...}
  ...
>
```

### 2. HighlightPanel Click Navigation (FR-001/FR-002/FR-003/FR-006/FR-007)

**File**: `src/components/HighlightPanel.tsx`

- Add `alias: string` and `onSelect: (lineIndex: number) => void` props
- Subscribe to `useLineSelectionStore` for `selectedLine` and `navNonce`
- Wrap each entry's line-number + content in a `<button>` (like SearchResultsPanel)
- Apply `border-selected-line` / `border-transparent` based on selection
- Add `useEffect` to scroll selected entry into view on `navNonce` change
- Use `entryRefs` (Map of `lineIndex → HTMLButtonElement`) for scroll-follow

### 3. LogViewer Second Scroll Target (FR-002)

**File**: `src/components/LogViewer.tsx`

- Add `highlightScrollToLine?: { lineIndex: number; nonce: number } | null` prop
- Add second `useScrollToLine` call:
  ```tsx
  useScrollToLine({ alias, virtualizer, scrollTarget: highlightScrollToLine ?? null, totalLines });
  ```

### 4. WorkspacePage Wiring

**File**: `src/pages/WorkspacePage.tsx`

- Add highlight scroll state:
  ```tsx
  const highlightScrollNonce = useRef(0);
  const [highlightScrollTarget, setHighlightScrollTarget] = useState<...>(null);
  ```
- Add handler:
  ```tsx
  function handleHighlightSelect(lineIndex: number) {
    useLineSelectionStore.getState().selectLine(selectedAlias!, lineIndex);
    highlightScrollNonce.current += 1;
    setHighlightScrollTarget({ lineIndex, nonce: highlightScrollNonce.current });
  }
  ```
- Pass `alias={selectedAlias}` and `onSelect={handleHighlightSelect}` to HighlightPanel
- Pass `highlightScrollToLine={highlightScrollTarget}` to LogViewer

## Testing

```bash
npm run test       # Vitest suite
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

### Manual Testing Checklist

1. Open a log file, highlight several lines with labels
2. Open highlights panel ("Show highlights" button)
3. Click a highlight entry → main view scrolls to that line, selection border appears on all panels
4. Click different entries in sequence → selection and scroll update correctly
5. Hover over ★ on a labeled highlighted line → tooltip shows label
6. Hover over ★ on an unlabeled highlighted line → no tooltip
7. Arrow-key navigate while highlights panel open → selection follows in all panels
8. Verify search result clicking still works as before
