# Contract: Main-View Time Range Filtering (US1, FR-001–FR-005, FR-010)

This contract covers the new `set_view_time_range` command, the modified
`stream_lines`/`LineBatch` shape, and the shared `effective_timestamps`
semantics now used by both main-view and search-result time filtering.

## 1. `set_view_time_range` (NEW)

```rust
#[tauri::command]
#[specta::specta]
pub async fn set_view_time_range(
    state: State<'_, Arc<AppState>>,
    alias: String,
    time_from: Option<f64>,  // epoch-ms, inclusive lower bound
    time_to: Option<f64>,    // epoch-ms, inclusive upper bound
) -> Result<u32>;            // new visible line count
```

**Guarantees**:

| Inputs | `runtime.view_filter` after | Returned `u32` |
|---|---|---|
| `time_from = None`, `time_to = None` | `None` (identity — all lines visible) | `total_lines` |
| `time_from = Some(first_timestamp)`, `time_to = Some(last_timestamp)` (the file's actual full span, from `get_file_properties`) | `None` (identity, FR-005 — "default span MUST NOT exclude any line") | `total_lines` |
| `time_from = Some(a)`, `time_to = Some(b)` where `(a, b) != (first_timestamp, last_timestamp)` | `Some(visible)` — `visible = filter_by_time_range((1..=total_lines), effective_timestamps, Some(a), Some(b))`, ascending file line indices | `visible.len()` |
| Only `time_from` set | as above with `time_to = None` — `visible` = lines with effective timestamp `>= a` | `visible.len()` |
| Only `time_to` set | as above with `time_from = None` — `visible` = lines with effective timestamp `<= b` | `visible.len()` |
| Range excludes every line (e.g. `time_from > time_to`, or a window with no matching effective timestamps) | `Some(vec![])` | `0` |
| File has no detected timestamp format (`effective_timestamps` absent) | `None` (treated as empty slice; only the `(None,None)`/default-span identity branches can match without it) | `total_lines` |

- Idempotent: calling with the same `(time_from, time_to)` again recomputes
  the same result (no incremental state).
- Errors: only `resolve_runtime`'s existing `FileNotFound`/`FileUnavailable`
  — **no** `TimeRangeUnavailable` (unlike `search`/`search_with_context`).
- Runs via `spawn_blocking` (Principle VI): an O(`total_lines`) scan over
  `effective_timestamps`.

## 2. `stream_lines` (MODIFIED — view-row addressing)

```rust
#[tauri::command]
#[specta::specta]
pub fn stream_lines(
    state: State<'_, Arc<AppState>>,
    alias: String,
    start_index: u32,  // CHANGED: 1-based VIEW-ROW index (was file line index)
    count: u32,
    channel: Channel<LineBatch>,
) -> Result<()>;
```

```rust
pub struct LineBatch {
    pub start_index: u32,        // CHANGED: 1-based VIEW-ROW index
    pub lines: Vec<LineContent>, // CHANGED: was Vec<String>
}
// LineContent { line_index: u32, content: String } — existing DTO, unchanged
```

**Guarantees**:

| `runtime.view_filter` | `start_index..start_index+count` addresses | `LineBatch.start_index` | each `LineContent.line_index` |
|---|---|---|---|
| `None` (identity — unfiltered, or no detected format) | file line indices `1..=total_lines`, exactly as before 010 | `start_index` (unchanged value) | `view_row` (i.e. `== start_index + offset`, same as the old `Vec<String>` position) |
| `Some(visible)` | indices into `visible`, i.e. `1..=visible.len()` | `start_index` (a view-row, not necessarily a file line index) | `visible[view_row - 1]` — the underlying file line index, used for highlight/selection/search-match identity |

- Clamping behavior (the `available`/in-progress-indexing logic) is
  unchanged in its own terms, just measured against `total_visible =
  view_filter.as_ref().map_or(available, Vec::len)` instead of `available`.
- For files with no detected timestamp format, `view_filter` is always
  `None` (never written), so this is byte-for-byte the pre-010 contract
  except for the `Vec<String>` → `Vec<LineContent>` wrapping (every
  `LineContent.line_index == view_row`).
- `subscribe_index_progress`/`IndexProgress` are **unchanged**: still report
  file-wide `total_lines`/`state == Ready`, independent of `view_filter`.

## 3. `effective_timestamps` / `filter_by_time_range` (FR-004, FR-010)

`effective_timestamps[i]` = `line_timestamps[i]` if `Some`, else the nearest
preceding `Some` value (carry-forward); remains `None` for any line before
the first timestamped line.

| Caller | Before 010 | After 010 |
|---|---|---|
| `set_view_time_range` (new, main view) | n/a | `filter_by_time_range(_, effective_timestamps, ...)` |
| `commands::search::search` | `filter_by_time_range(_, line_timestamps, ...)` | `filter_by_time_range(_, effective_timestamps, ...)` |
| `commands::search::search_with_context` | `filter_by_time_range(_, line_timestamps, ...)` | `filter_by_time_range(_, effective_timestamps, ...)` |
| `mcp::tools::run_search_with_context` | `filter_by_time_range(_, line_timestamps, ...)` | `filter_by_time_range(_, effective_timestamps, ...)` |

`filter_by_time_range`'s own signature, inclusive-bounds semantics, and
`(None, None)` no-op are **unchanged**. The only change is which timestamps
slice is passed in — meaning a line without its own timestamp that previously
could never match a search-with-time-range now matches based on its nearest
preceding timestamped line, for **all four** callers uniformly (FR-010:
"search-result time range filtering ... MUST continue to apply, operating
consistently with the main-view filtering").

## 4. Main log view rendering (FR-001–FR-005, spec Assumptions)

- `LogViewer`'s virtualizer `count` = the `u32` returned by the most recent
  `set_view_time_range` call (or `fileTotalLines` if `hasTimestampFormat` is
  `false`, in which case `set_view_time_range` is never called).
- Each rendered row's `LogLine` `lineIndex` prop = `LineContent.line_index`
  from the loaded `LineBatch` entry for that view-row — used for
  highlight/selection/search-match lookups (spec Assumptions: these continue
  to refer to file line indices).
- `useLineSelectionKeyboard`'s clamp bound (`totalLines` param) is
  `fileTotalLines` (unchanged meaning: file-wide line count), **not** the
  view total — `selectedLine` remains a file line index and may reference a
  line currently hidden by the filter (spec Assumptions: "simply not
  rendered ... state is preserved, not deleted").
- Scrolling to `selectedLine` via `navNonce`: best-effort reverse lookup over
  currently-loaded `lines` entries for one whose `line_index === selectedLine`;
  no-op if not found (hidden/not-loaded).
