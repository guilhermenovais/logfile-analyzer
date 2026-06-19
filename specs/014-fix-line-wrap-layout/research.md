# Research: Fix Line Wrap Layout

**Feature Branch**: `014-fix-line-wrap-layout`
**Date**: 2026-06-19

## R-001: Why wrapped lines overlap

**Decision**: The overlap is caused by `@tanstack/react-virtual`'s virtualizer using a fixed `estimateSize: () => 20` (the `LINE_HEIGHT_PX` constant). Each virtual item is absolutely positioned with a fixed `height: ${item.size}px` and `transform: translateY(${item.start}px)`. When `white-space: pre-wrap` causes a line to render taller than 20px, the virtualizer is unaware and positions the next item at `start + 20`, causing visual overlap.

**Rationale**: TanStack Virtual v3 supports dynamic row heights via its `measureElement` API. Each virtual item can register a `ref` callback (`virtualizer.measureElement`) that lets the virtualizer observe the item's actual rendered height and recalculate layout. This is the idiomatic solution — no custom height calculation or ResizeObserver wiring needed.

**Alternatives considered**:
- **Manual height calculation** (measure text width, divide by container width, multiply by line height): Fragile, doesn't account for fonts, padding, or sub-pixel rendering. Rejected.
- **CSS-only approach** (remove absolute positioning, use flow layout): Incompatible with TanStack Virtual's positioning model; would require replacing the virtualizer entirely. Rejected.
- **Fixed large estimate** (set `estimateSize` to a large value like 80px): Wastes space for non-wrapped lines (the majority), causes jarring layout jumps. Rejected.

## R-002: Why selection border shifts content

**Decision**: The `LogLine` component conditionally applies `border-2 border-selected-line` only when `isSelected` is true. When unselected, there is no border at all (0px). Adding a 2px border increases the element's box size by 4px (2px each side), which shifts the content inward.

**Rationale**: The fix is to always render a 2px border — transparent when unselected, colored when selected. This keeps the box size constant regardless of selection state. Using `border-2 border-transparent` as the default and swapping only the color on selection eliminates the shift.

**Alternatives considered**:
- **`box-sizing: border-box` with fixed height**: Already the default in Tailwind (`box-border`), but the issue is that unselected lines have no border at all, so the box model is different. Also doesn't work with dynamic heights for wrapped lines.
- **Outline instead of border**: Outlines don't affect layout, but they render outside the element and can overlap adjacent rows. With the virtualizer's tight positioning, this would cause visual artifacts. Rejected.
- **Padding swap** (remove padding equal to border width when border appears): More complex, harder to maintain, same net effect as transparent border. Rejected.

## R-003: Dynamic sizing integration with TanStack Virtual v3

**Decision**: Use TanStack Virtual v3's built-in `measureElement` callback for dynamic row heights.

**Rationale**: The `@tanstack/react-virtual` v3 API provides:
1. `measureElement` — a ref callback that, when attached to each virtual item's DOM node, uses `ResizeObserver` under the hood to track the element's actual rendered size.
2. When `wrap` is disabled, all rows are a fixed 20px, so no measurement is needed.
3. When `wrap` is toggled on, the virtualizer needs to be told to re-measure all items. Calling `virtualizer.measure()` resets all measurements and forces re-layout.

**Implementation approach**:
- Attach `virtualizer.measureElement` as a `ref` on each virtual item's `LogLine` wrapper (via `data-index` attribute required by TanStack Virtual).
- Keep `estimateSize: () => LINE_HEIGHT_PX` as the initial estimate — TanStack Virtual will replace it with actual measurements once rendered.
- When the `wrap` prop toggles, call `virtualizer.measure()` to invalidate cached heights.

**Alternatives considered**:
- **Custom `ResizeObserver`**: Reinventing what `measureElement` already does. Rejected.
- **Debounced re-measurement**: Adds latency to layout correction. TanStack Virtual handles this efficiently out of the box. Rejected.

## R-004: Performance impact of dynamic measurement

**Decision**: Dynamic measurement is acceptable for the performance requirements (smooth scrolling with up to 100,000 lines).

**Rationale**: TanStack Virtual's `measureElement` uses a single `ResizeObserver` instance shared across all visible items (typically 30-50 rows with overscan). The `ResizeObserver` callback is batched by the browser and runs off the main thread. Only visible rows are measured — unmounted rows fall back to `estimateSize`. This is the same pattern used by production virtualizers in apps with millions of rows.

When `wrap` is off, rows are fixed-height and no measurement overhead occurs (the `measureElement` ref is still attached but the `ResizeObserver` fires once per row mount, which is negligible).

**Alternatives considered**: None — this is the standard approach.
