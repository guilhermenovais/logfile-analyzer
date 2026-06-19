# Data Model: Fix Search UX

No new entities, state, or IPC contracts are introduced. All changes are CSS/layout and minor className adjustments in existing components.

## Existing Entities (unchanged)

### SearchUiState (Zustand — `useSearchUiStore`)

| Field | Type | Notes |
|-------|------|-------|
| `results` | `SearchMatchEntry[]` | Match list from backend |
| `panelOpen` | `boolean` | Controls panel visibility |
| `currentMatchIndex` | `number` | Active match (-1 if none) |
| `scrollNonce` | `number` | Bumped to trigger LogViewer scroll |

### LineSelectionSlice (Zustand — `useLineSelectionStore`)

| Field | Type | Notes |
|-------|------|-------|
| `selectedLine` | `number \| null` | 1-based line index |
| `navNonce` | `number` | Bumped on arrow-key nav |

## Data Flow (click-to-navigate)

Already implemented — no changes needed:

```
SearchResultsPanel click
  → useSearchUiStore.selectMatch(alias, index)
    → useLineSelectionStore.selectLine(alias, lineIndex)   // sets selectedLine
    → patch { currentMatchIndex: index, scrollNonce: +1 }  // triggers scroll
  → WorkspacePage re-renders (subscribes to searchSlice)
    → scrollToLine = { lineIndex, nonce } passed to LogViewer
      → useEffect on nonce → virtualizer.scrollToIndex(viewRow - 1, { align: "center" })
```

## CSS Changes

### New utility class: `scrollbar-visible` (App.css)

```css
.scrollbar-visible::-webkit-scrollbar {
  width: 8px;
}
.scrollbar-visible::-webkit-scrollbar-track {
  background: var(--muted);
  border-radius: 4px;
}
.scrollbar-visible::-webkit-scrollbar-thumb {
  background: var(--muted-foreground);
  border-radius: 4px;
}
```

### Layout Changes

| Component | Change | Reason |
|-----------|--------|--------|
| `SearchResultsPanel` outer div | Add `shrink-0` | Prevent flex-col parent from squeezing |
| `SearchResultsPanel` button | Always `border-2`, toggle `border-transparent`/`border-selected-line` | Prevent text shift (FR-006/FR-007) |
| `SearchResultsPanel` `<ul>` | Add `scrollbar-visible` class | Visible scrollbar (FR-005) |
| `SearchBar` outer div | Add `shrink-0` | Prevent flex-col squeezing |
| `SearchBar` input wrapper | Add `min-w-0` | Prevent horizontal overflow |
| `WorkspacePage` toolbar/panel wrappers | Ensure `shrink-0` on all non-LogViewer children | Layout stability (FR-008) |
