# Data Model: Fix Line Wrap Layout

**Feature Branch**: `014-fix-line-wrap-layout`
**Date**: 2026-06-19

This feature is a CSS/layout bug fix — no new entities, state, or IPC contracts are introduced. The changes are confined to existing frontend components and their rendering logic.

## Affected Components

### LogLine (`src/components/LogLine.tsx`)

**Current state**:
- Conditionally applies `border-2 border-selected-line` when `isSelected` is true
- No border when unselected (0px) — causes 4px layout shift on selection

**Target state**:
- Always applies `border-2`
- Unselected: `border-transparent` (invisible, but occupies space)
- Selected: `border-selected-line` (colored)
- Net layout shift: 0px

### LogViewer (`src/components/LogViewer.tsx`)

**Current state**:
- `useVirtualizer` configured with fixed `estimateSize: () => LINE_HEIGHT_PX` (20px)
- Virtual items rendered with fixed `height: ${item.size}px` and absolute positioning
- No dynamic measurement — wrapped lines overflow their allocated height

**Target state**:
- `useVirtualizer` with `measureElement` enabled for dynamic row heights
- Each virtual item attaches `virtualizer.measureElement` as its `ref` callback
- `data-index` attribute set on each item (required by TanStack Virtual for measurement tracking)
- Fixed `height` style removed from items (let the DOM determine height, virtualizer measures it)
- `estimateSize` remains as fallback for unmeasured rows
- `virtualizer.measure()` called when `wrap` prop changes to invalidate cached heights

## State Changes

No new Zustand stores, slices, or state fields. Existing stores are unchanged:
- `useLogViewToolbarStore` — `wrap: boolean` (existing, no changes)
- `useLineSelectionStore` — `selectedLine` (existing, no changes)

## Validation Rules

- `LINE_HEIGHT_PX` constant retained as `estimateSize` fallback — not removed
- Transparent border must match the width of the selection border exactly (both `border-2`)
- `data-index` must equal `item.index` (TanStack Virtual requirement for `measureElement`)
