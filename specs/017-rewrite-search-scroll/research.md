# Research: Rewrite Search-to-Scroll Navigation

## 1. Root Cause Analysis — Why Distant Scrolling Fails

**Decision**: The failure has two independent root causes, both in `LogViewer.tsx:167-178`.

**Root cause A — File line index ≠ virtualizer index under time-range filter**:
When `findViewRow(lines, targetLineIndex)` returns `undefined` (the target row's
data hasn't been streamed yet because it's far from the viewport), the fallback
is `scrollIndex = scrollToLine.lineIndex - 1`. This treats the 1-based *file*
line index as a 0-based *virtualizer* index.

Without a time-range filter the identity holds (view-row == line_index), so the
fallback is correct. With a filter, the virtualizer's `count` equals the filtered
visible-line count (e.g. 5,000), while the file line index can be much larger
(e.g. 45,000). The guard `scrollIndex < totalLines` then fails, and no scroll
happens at all. Even when the guard passes, the virtualizer index points to the
wrong row.

**Root cause B — One-shot scroll with no verification for variable row heights**:
`virtualizer.scrollToIndex(index, { align: "center" })` computes the target
pixel offset as the sum of estimated sizes (all 20 px) up to `index`. With line
wrapping enabled, some rows are 40-80 px tall. Over thousands of rows the
cumulative estimation error can put the target slightly off-screen. The effect
fires once on `scrollToLine?.nonce` and never re-checks.

**Alternatives considered**:
- Sending the view-row from the search IPC (rejected: changes the search
  contract, which is shared with MCP; the search results would become
  view-filter-dependent and would need to be recomputed on filter changes)
- Downloading the full `view_filter` to the frontend (rejected: can be 500 K
  entries × 4 bytes = 2 MB; violates Principle VI's ~100 KB IPC cap)

## 2. Solution: Backend `resolve_view_row` Command

**Decision**: Add a Tauri command `resolve_view_row(alias, line_index) → u32`
that maps a 1-based file line index to its 1-based view-row using the backend's
`view_filter`.

**Rationale**: The `view_filter: Option<Vec<u32>>` already exists in
`FileRuntime` (state.rs:71). When `None` (no filter), view-row == line_index
(identity). When `Some(indices)`, a binary search (`Vec::binary_search`) on the
sorted `indices` vec gives the 0-based position, and `+1` yields the 1-based
view-row. This is O(log n), negligible compared to the IPC round-trip.

**Error handling**: Returns `LineOutOfRange` if the line_index is not in the
filtered view (shouldn't happen for search results, but guards against stale
state).

**IPC contract**:
```
resolve_view_row(alias: string, lineIndex: number) → number
```

**Alternatives considered**:
- Caching the view_filter on the frontend (rejected: Principle VI, size)
- Using the `lines` Map as a reverse index (rejected: only covers loaded rows)
- Sending view-row in `SearchMatchEntry` (rejected: couples search to view
  filter, breaks MCP contract)

## 3. Solution: Frontend Scroll Rewrite

**Decision**: Replace the current `useEffect` in `LogViewer.tsx` (lines 167-178)
with a dedicated `useScrollToLine` hook that:
1. Resolves the view-row via `resolveViewRow` IPC
2. Calls `virtualizer.scrollToIndex(viewRow - 1, { align: "center" })`
3. After a `requestAnimationFrame`, verifies the target is visible and
   re-scrolls if needed (at most one correction pass)

**Rationale**: Separating the scroll logic into a hook makes it testable and
keeps `LogViewer` focused on rendering. The correction pass handles variable
row heights without a more complex measurement-preloading strategy.

**Cancellation**: Each scroll request stores a generation counter. If a new
request arrives (rapid clicks, FR-007), the previous one's correction pass
is cancelled by checking the counter.

**Alternatives considered**:
- Using `virtualizer.scrollToOffset` with a pre-computed pixel offset
  (rejected: still relies on estimated sizes; no more accurate than
  `scrollToIndex`)
- Implementing a custom smooth-scroll animation (rejected: unnecessary
  complexity; the virtualizer's instant scroll is fine for navigation)
- Pre-loading data at the target before scrolling (rejected: adds latency;
  data loads after scroll anyway via `loadRange`)

## 4. Impact on Existing Features

**Decision**: The rewrite is confined to the scroll mechanism. Existing features
are unaffected.

**Analysis**:
- **Line selection highlighting** (`useLineSelectionStore`): The `selectMatch`
  action already calls `selectLine` before bumping `scrollNonce`. The rewrite
  does not change this flow.
- **Search match highlighting** (`searchMatchLines`): Driven by `panelOpen` and
  `results` in `useSearchUiStore`. No change.
- **Arrow-key navigation** (`navNonce` effect, lines 181-194): This effect uses
  `findViewRow` on already-loaded data (the selected line is always near the
  viewport). It does not need the `resolveViewRow` IPC because the data is
  already loaded. Left unchanged.
- **`viewVersion` reset** (line 157-160): Scrolls to offset 0 on time-range
  change. Unrelated to search scroll. Left unchanged.
- **`wrap` re-measure** (line 162-165): Calls `virtualizer.measure()`. Left
  unchanged.

## 5. TanStack Virtual `scrollToIndex` Behavior

**Decision**: `scrollToIndex` with `align: "center"` is reliable enough for the
initial jump. A single correction pass after `requestAnimationFrame` handles
the residual error from variable row heights.

**Rationale**: TanStack Virtual v3's `scrollToIndex` calculates the target
offset as the cumulative estimated size up to the target index. For fixed 20 px
rows, this is exact. For variable heights (line wrapping), the error grows with
the number of un-measured rows between the current position and the target. In
practice, the target row ends up within a few rows of the viewport center. After
the initial scroll, the virtualizer renders and measures the rows near the
target. A single `requestAnimationFrame` later, calling `scrollToIndex` again
with measured data produces an accurate result.

Testing with `@tanstack/react-virtual@3.14.2` confirms this two-pass approach
reliably lands the target within the visible viewport with `align: "center"`.

## 6. Performance Considerations

**Decision**: The `resolveViewRow` IPC call adds negligible latency (< 1 ms for
binary search + IPC overhead). The two-pass scroll adds one animation frame
(~16 ms). Total navigation time stays well under the 500 ms acceptance criterion
(SC-002).

**Constraints**:
- Files up to 500,000 lines (SC-001): binary search on 500 K items is ~19
  comparisons, trivial.
- Rapid successive clicks (FR-007): cancellation via generation counter prevents
  stacked scroll corrections.
- Memory: no new data structures; the existing `view_filter` is reused.
