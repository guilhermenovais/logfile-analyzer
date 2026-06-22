# Data Model: Rewrite Search-to-Scroll Navigation

## 1. Backend — New IPC Command

### `resolve_view_row`

Maps a 1-based file line index to its 1-based view-row under the current view
filter.

| Field | Type | Description |
|-------|------|-------------|
| `alias` | `String` | Workspace file alias |
| `line_index` | `u32` | 1-based file line index |
| **returns** | `u32` | 1-based view-row |

**Behaviour**:
- When `view_filter` is `None` (no time-range filter): returns `line_index`
  (identity mapping).
- When `view_filter` is `Some(indices)`: binary search on `indices` for
  `line_index`. Returns `position + 1` (1-based). Returns `LineOutOfRange` if
  `line_index` is not in the filtered set.

**Location**: `src-tauri/src/commands/viewing.rs`, alongside `stream_lines` and
`set_view_time_range`.

## 2. Frontend — New IPC Wrapper

### `resolveViewRow`

| Field | Type | Description |
|-------|------|-------------|
| `alias` | `string` | Workspace file alias |
| `lineIndex` | `number` | 1-based file line index |
| **returns** | `Promise<number>` | 1-based view-row |

**Location**: `src/ipc/viewing.ts`, alongside `streamLines` and
`setViewTimeRange`.

## 3. Frontend — New Hook: `useScrollToLine`

Encapsulates the two-pass scroll-to-line mechanism.

### Arguments

| Argument | Type | Description |
|----------|------|-------------|
| `alias` | `string` | File alias for `resolveViewRow` IPC |
| `virtualizer` | `Virtualizer<HTMLDivElement, Element>` | TanStack Virtual instance |
| `scrollTarget` | `{ lineIndex: number; nonce: number } \| null` | From `useSearchUiStore.scrollToLine()` |
| `totalLines` | `number` | Virtualizer count (visible rows) |

### Behaviour

1. When `scrollTarget` changes (by `nonce`), increment internal generation
   counter.
2. Call `resolveViewRow(alias, scrollTarget.lineIndex)`.
3. If generation is still current, call
   `virtualizer.scrollToIndex(viewRow - 1, { align: "center" })`.
4. Schedule a `requestAnimationFrame` callback. If generation is still current,
   call `virtualizer.scrollToIndex(viewRow - 1, { align: "center" })` again
   (correction pass for variable row heights).

### Cancellation

A generation counter (incrementing `useRef<number>`) ensures that if a new
scroll target arrives before the correction pass fires, the stale correction
is skipped.

**Location**: `src/hooks/useScrollToLine.ts`.

## 4. Removed Code

### `findViewRow` (LogViewer.tsx:11-20)

The standalone function that scans the `lines` Map is no longer needed for the
search-scroll path. It is still used by the `navNonce` effect (arrow-key
navigation, line 181-194) where the target is always near the viewport and
already loaded. It stays in `LogViewer.tsx` for that use case.

### Current `scrollToLine` effect (LogViewer.tsx:167-178)

Replaced entirely by `useScrollToLine`. The effect body is deleted; the hook
is called in its place.

## 5. Unchanged Data Structures

The following are not modified:
- `SearchUiState` and its `scrollNonce` / `scrollToLine()` selector
- `LineSelectionSlice` and its `navNonce`
- `SearchMatchEntry` (search IPC contract)
- `LineBatch` / `LineContent` (viewing IPC contract)
- `FileRuntime.view_filter` (backend, read-only by new command)
