# Data Model: Highlight Click Navigation

**Feature Branch**: `019-highlight-click-navigation` | **Date**: 2026-06-22

## Entities

### Existing Entities (no modifications)

#### HighlightEntry (src/bindings/index.ts)

```typescript
type HighlightEntry = {
  line_index: number;       // 1-based line index
  content: string;          // Current line content
  label: string | null;     // Optional user label (used for star tooltip)
  origin: HighlightOrigin;  // "user" | "mcp_agent"
};
```

No changes needed — already contains all fields required for navigation and tooltip.

#### LineSelectionSlice (src/hooks/useLineSelectionStore.ts)

```typescript
interface LineSelectionSlice {
  selectedLine: number | null;  // 1-based line index
  navNonce: number;             // Incremented on arrow-key navigation
}
```

No changes needed — `selectLine(alias, lineIndex)` already handles click-based selection for both search results and direct line clicks. Highlight clicks will use the same method.

#### ScrollTarget (inline type in LogViewer props)

```typescript
{ lineIndex: number; nonce: number }
```

No changes to the type — used as-is for both search and highlight scroll targets.

## New State

### WorkspacePage Local State

```typescript
// Highlight scroll signal — mirrors how search drives scrollToLine
highlightScrollTarget: { lineIndex: number; nonce: number } | null
// Nonce counter (useRef) to ensure each click produces a unique nonce
highlightScrollNonce: useRef<number>(0)
```

This state is local to `WorkspacePage` because:
- Only `WorkspacePage` needs to produce it (from HighlightPanel's `onSelect` callback)
- Only `LogViewer` needs to consume it (via the `highlightScrollToLine` prop)
- No other component reads or writes it

## Props Changes

### HighlightPanel (added props)

```typescript
interface HighlightPanelProps {
  // ... existing props unchanged ...
  alias: string;                           // NEW: file alias for store subscription
  onSelect: (lineIndex: number) => void;   // NEW: click-to-navigate callback
}
```

### LogViewer (added prop)

```typescript
interface LogViewerProps {
  // ... existing props unchanged ...
  highlightScrollToLine?: { lineIndex: number; nonce: number } | null;  // NEW
}
```

## Data Flow

```
User clicks highlight entry in HighlightPanel
  │
  ├─► onSelect(lineIndex) callback fires
  │     │
  │     ├─► useLineSelectionStore.selectLine(alias, lineIndex)
  │     │     └─► selectedLine updates across all panels
  │     │
  │     └─► setHighlightScrollTarget({ lineIndex, nonce: ++ref })
  │           └─► highlightScrollToLine prop updates on LogViewer
  │                 └─► useScrollToLine hook detects nonce change
  │                       └─► virtualizer.scrollToIndex(viewRow, { align: "center" })
  │
  └─► HighlightPanel re-renders with border-selected-line on clicked entry
        (reads selectedLine from useLineSelectionStore)
```

## Validation Rules

- `lineIndex` passed to `onSelect` is always a valid 1-based index (comes from `HighlightEntry.line_index` which originates from the Rust backend)
- `nonce` is always monotonically increasing (ref counter), ensuring every click triggers a scroll
- `title` attribute on star button is `undefined` when `label` is `null` (no empty tooltip rendered)
