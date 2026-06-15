# Phase 1 Data Model: Time Range Filter Behavior Fixes

All entities below are additive to the shapes established by features 007–009
(`specs/009-fix-time-range-filter/data-model.md`). Only new/changed fields and
their relationships are described; unchanged fields are omitted.

## 1. `FileIndex` (backend, `src-tauri/src/state.rs`)

In-memory, per-open-file index state guarded by `RwLock<FileIndex>`.

| Field | Type | Change | Notes |
|---|---|---|---|
| `line_timestamps` | `Option<Vec<Option<i64>>>` | unchanged | Each line's own parsed timestamp (epoch-ms), `None` if unparseable. |
| `effective_timestamps` | `Option<Vec<Option<i64>>>` | **NEW** | For each line, `line_timestamps[i]` if `Some`, else the nearest preceding `Some` value (carry-forward). `None` for lines before the first timestamped line. Computed once in `detect_and_parse` (research.md §1.3). Drives FR-004 inheritance for both main-view filtering and `filter_by_time_range`. |
| `utc_offset_minutes` | `i32` | **NEW** (default `0`) | The file's detected log-timestamp UTC offset in minutes (FR-008). `0` (UTC) unless the detected format is `Iso8601` and a sampled line carries an explicit offset (research.md §3.2). |
| `timestamp_detection_complete` | `bool` | **NEW** (default `false`) | Set to `true` by `index_and_detect_timestamps` once `detect_and_parse` has returned — regardless of whether a format was detected — *after* any `has_timestamp_format` DB write. Decouples "timestamp detection settled" from `state == Ready` (research.md §2.2). |

**Relationships**: `effective_timestamps.len() == line_timestamps.len() ==
line_offsets.len() == total_lines`, established at the same time as
`line_timestamps` (both `None` until detection runs/returns).

**Validation rules**:
- `effective_timestamps` and `utc_offset_minutes` are only meaningful when
  `timestamp_profile.is_some()`; both are left at their defaults (`None`/`0`)
  when no format is detected — consumers must gate on `has_timestamp_format`
  (already true for `first_timestamp`/`last_timestamp`, FR-008's "no
  timezone behavior applies" for files without a detected format).

## 2. `FileRuntime` (backend, `src-tauri/src/state.rs`)

| Field | Type | Change | Notes |
|---|---|---|---|
| `view_filter` | `RwLock<Option<Vec<u32>>>` | **NEW** (default `None`) | `None` = identity (all `total_lines` lines visible, in file order) — the unchanged pre-010 behavior. `Some(indices)` = the ordered 1-based file line indices visible under the currently-committed time range (FR-001–FR-005), set by `set_view_time_range`. Guarded by its own lock since it's written independently of `FileIndex`'s detection-completion state and is recomputed far more often (every range commit) than `FileIndex` changes. |

**State transitions**:
- Starts `None` (identity) for every newly opened file.
- `set_view_time_range(alias, time_from, time_to)` recomputes and overwrites
  it: `None` again if the requested range is `(None, None)` or fully covers
  `[first_timestamp, last_timestamp]` (FR-005); otherwise `Some(visible)`
  where `visible = filter_by_time_range((1..=total_lines),
  effective_timestamps, time_from, time_to)` (FR-001–FR-004).
- Never mutated by `stream_lines` (read-only there).

## 3. `set_view_time_range` (NEW Tauri command, `src-tauri/src/commands/viewing.rs`)

```rust
#[tauri::command]
#[specta::specta]
pub async fn set_view_time_range(
    state: State<'_, Arc<AppState>>,
    alias: String,
    time_from: Option<f64>,
    time_to: Option<f64>,
) -> Result<u32>
```

| Aspect | Value |
|---|---|
| Input | `alias`; `time_from`/`time_to`: epoch-ms bounds or `None`, same units/semantics as `search`'s existing `time_from`/`time_to` (FR-010). |
| Output | `u32` — the new visible line count (`view_filter.as_ref().map_or(total_lines, Vec::len)`), i.e. the value `LogViewer`'s virtualizer should use as `count`. |
| Side effect | Overwrites `runtime.view_filter` (entity 2). Runs via `spawn_blocking` (Principle VI) since it's an O(total_lines) pass for a narrowed range. |
| Errors | None beyond `resolve_runtime`'s existing `FileNotFound`/`FileUnavailable` — unlike `search`, **no** `TimeRangeUnavailable` check: if `effective_timestamps` is `None` (no detected format), `visible_line_indices` is never called with a non-default-span request from the frontend (gated by `hasTimestampFormat`, FR-006), but if it ever is, treat as identity (`None` effective_timestamps → empty slice → `filter_by_time_range` over an empty slice excludes everything *except* the `(None,None)`/default-span identity branches, which are checked first) — i.e. callable but only meaningfully narrows when a format is detected. |

## 4. `view_filter` module (NEW, `src-tauri/src/logfile/view_filter.rs`)

| Function | Signature | Purpose |
|---|---|---|
| `effective_timestamps` | `fn(line_timestamps: &[Option<i64>]) -> Vec<Option<i64>>` | FR-004 carry-forward (research.md §1.3). Pure, unit-tested directly. |
| `timestamp_bounds` | `fn(timestamps: &[Option<i64>]) -> (Option<i64>, Option<i64>)` | First/last `Some` entry in order — generalizes `commands::files::line_timestamp_bounds` (which becomes a thin `as f64` wrapper around this for `FileProperties`). |
| `visible_line_indices` | `fn(total_lines: usize, effective_timestamps: &[Option<i64>], first_ts: Option<i64>, last_ts: Option<i64>, time_from: Option<i64>, time_to: Option<i64>) -> Option<Vec<u32>>` | FR-001–FR-005 (research.md §1.2/§1.4): `None` for identity (default span or `(None,None)`), else `Some(filter_by_time_range((1..=total_lines), effective_timestamps, time_from, time_to))` cast to `u32`. |

## 5. `offset` module (NEW, `src-tauri/src/logfile/offset.rs`)

| Function | Signature | Purpose |
|---|---|---|
| `detect_utc_offset_minutes` | `fn(sample: &[String]) -> i32` | FR-008 (research.md §3.2): first sampled line whose leading token parses via `DateTime::parse_from_rfc3339` with an explicit offset → `offset().local_minus_utc() / 60`; else `0`. Called from `detect_and_parse` only when `profile.format == Iso8601`. |

## 6. `FileProperties` (IPC DTO, `src-tauri/src/commands/types.rs`)

| Field | Type | Change | Notes |
|---|---|---|---|
| `indexing_complete` | `bool` | **redefined** | Was `index.state == Ready`; now `index.state == Ready && index.timestamp_detection_complete` (research.md §2.2). Still drives `useFileProperties`'s `filePropertiesRefetchInterval` (poll until `true`). |
| `timestamp_offset_minutes` | `i32` | **NEW** | `index.utc_offset_minutes` when the file is loaded, else `0`. Meaningful only when `has_timestamp_format` is `true` (FR-008's "no timezone behavior" otherwise — frontend doesn't read it in that case). |

**Relationships**: `first_timestamp`/`last_timestamp` (existing, `Option<f64>`)
remain gated on `has_timestamp_format && indexing_complete`, now using the
redefined `indexing_complete` — so they, `has_timestamp_format`, and
`timestamp_offset_minutes` all become reliably available together, in the
same poll cycle (closes the US2 race).

## 7. `LineBatch` / `LineContent` (IPC DTO, `src-tauri/src/commands/types.rs`)

```rust
pub struct LineBatch {
    pub start_index: u32,        // CHANGED: 1-based VIEW-ROW index (was file line index)
    pub lines: Vec<LineContent>, // CHANGED: was Vec<String>
}
```

`LineContent { line_index: u32, content: String }` is the existing DTO
(unchanged), reused here so each row in a batch carries its true 1-based
**file** line index alongside its content.

**Relationships**: `LineBatch.start_index` and each entry's position within
`lines` together address `stream_lines`'s `start_index..start_index+count`
**view-row** range (entity 8); `LineContent.line_index` is the file line
index used for highlight/selection/search-match lookups (spec Assumptions).
When `view_filter == None` (identity), `line_index == view_row` for every
row, so this is a strict superset of pre-010 behavior.

## 8. `stream_lines` (MODIFIED Tauri command, `src-tauri/src/commands/viewing.rs`)

| Aspect | Before | After |
|---|---|---|
| `start_index`/`count` addressing | 1-based **file** line index range | 1-based **view-row** range (`1..=visible_line_count`, entity 3's return value) |
| Bound (`available`/`total_visible`) | `index.line_offsets.len()` (or `-1` while indexing) | `view_filter.as_ref().map_or(available, Vec::len)` — `available` computed exactly as before |
| Per-row resolution | `line_bytes(mmap, &line_offsets, line_index)` where `line_index == view_row` | `line_index = view_filter.as_ref().map_or(view_row, \|v\| v[view_row - 1] as usize)`, then `line_bytes(mmap, &line_offsets, line_index)` |
| Output | `LineBatch { start_index: view_row, lines: Vec<String> }` | `LineBatch { start_index: view_row, lines: Vec<LineContent { line_index, content }> }` |

`subscribe_index_progress`/`IndexProgress` are **unchanged** — they continue
to report file-wide `total_lines`/`state == Ready` for content-streaming
availability (FR-014), independent of `view_filter`.

## 9. `filter_by_time_range` callers (MODIFIED, no signature change)

`commands::search::search`, `commands::search::search_with_context`, and
`mcp::tools::run_search_with_context` each change their `line_timestamps`
argument to `filter_by_time_range` from `index.line_timestamps.as_deref()
.unwrap_or(&[])` to `index.effective_timestamps.as_deref().unwrap_or(&[])`
(research.md §1.3, FR-004/FR-010). `filter_by_time_range`'s own signature and
the `(None, None)` no-op behavior are unchanged.

## 10. `useLogStream` (MODIFIED hook, `src/hooks/useLogStream.ts`)

```ts
export function useLogStream(
  alias: string | null,
  timeFrom: number | null,
  timeTo: number | null,
  hasTimestampFormat: boolean,
): UseLogStreamResult

export interface UseLogStreamResult {
  /** view-row (1-based) -> {line_index, content}, for rows loaded so far. */
  lines: Map<number, LineContent>;
  /** Visible row count — virtualizer's `count` (FR-001-FR-005). */
  totalLines: number;
  /** File-wide line count — `useLineSelectionKeyboard`'s clamp bound, unchanged meaning. */
  fileTotalLines: number;
  indexingComplete: boolean;
  loadRange: (startIndex: number, count: number) => void;
}
```

**State transitions**:
- `fileTotalLines`/`indexingComplete` continue to come from
  `subscribeIndexProgress` exactly as before.
- Whenever `(timeFrom, timeTo)` changes (compared by value) and
  `hasTimestampFormat` is `true`, call `setViewTimeRange(alias, timeFrom,
  timeTo)`; on resolution, set `totalLines` to the returned count and clear
  `lines` (the view-row → content mapping is stale under the new filter).
- When `hasTimestampFormat` is `false`, `setViewTimeRange` is never called;
  `totalLines === fileTotalLines` always (server-side `view_filter` stays
  `None`), preserving pre-010 behavior byte-for-byte for files without a
  detected format.

## 11. `LogViewer` (MODIFIED component, `src/components/LogViewer.tsx`)

| Prop | Change | Notes |
|---|---|---|
| `hasTimestampFormat` | **NEW**, required | Passed from `WorkspacePage` (already computed there, entity 13). |

**Internal changes**:
- Reads `timeFrom`/`timeTo` from `useSearchUiStore`'s slice for `alias`
  (alongside the existing `searchMatchLines`/`scrollToLine` reads) and passes
  them into `useLogStream` (entity 10).
- `useVirtualizer({ count: totalLines, ... })` uses the **view** total;
  `useLineSelectionKeyboard`'s `totalLines` param is now `fileTotalLines`
  (file-wide, for clamping `selectedLine` which remains a file line index per
  spec Assumptions).
- Each rendered row resolves `lineIndex`/`content` from `lines.get(viewRow)`
  (`LineContent.line_index`/`.content`) instead of treating `viewRow` itself
  as the file line index.
- The `navNonce` scroll-to-`selectedLine` effect changes from
  `virtualizer.scrollToIndex(selectedLine - 1, ...)` to a reverse lookup:
  find the `viewRow` (if any) in the currently-loaded `lines` whose
  `line_index === selectedLine`, and scroll to that; no-op if `selectedLine`
  isn't currently loaded (spec Assumptions — hidden lines "are simply not
  rendered").

## 12. `useSearchUiStore` (UNCHANGED shape, new consumer)

No field changes. `timeFrom`/`timeTo`/`timeRangeInitialized` (existing, from
009) are now also read by `LogViewer` (entity 11) for main-view filtering,
in addition to their existing use by `useSearch`'s `search`/
`search_with_context` payloads (FR-010 — same state drives both).

## 13. `WorkspacePage` (MODIFIED, `src/pages/WorkspacePage.tsx`)

| Before | After |
|---|---|
| `hasTimestampFormat = files.find(f => f.alias === selectedAlias)?.has_timestamp_format ?? false` (from one-shot `useActiveWorkspace()`) | `hasTimestampFormat = fileProperties?.has_timestamp_format ?? false` (from the existing polling `useFileProperties(selectedAlias)` call, entity 6) |

`hasTimestampFormat` is passed to `SearchBar`, `LogViewToolbar` (unchanged
call sites) and now also to `LogViewer` (entity 11, new prop).

## 14. `timeRange.ts` (MODIFIED, `src/lib/timeRange.ts`)

| Before | After |
|---|---|
| `formatLocal(epochMs): string` — browser-local `Date` getters | `formatInOffset(epochMs, offsetMinutes): string` — UTC getters on `epochMs + offsetMinutes*60_000` (research.md §3.3) |
| `parseLocal(text): number \| null` — `new Date(y, m-1, d, h, min)` round-trip | `parseInOffset(text, offsetMinutes): number \| null` — `Date.UTC(y, m-1, d, h, min) - offsetMinutes*60_000`, with the same regex/round-trip validation shape |
| `combine(date, hour, minute): number` — local `setHours` | `combineInOffset(date, hour, minute, offsetMinutes): number` — reads `date`'s local Y/M/D (set via the constructor trick below), combines via `Date.UTC(...) - offsetMinutes*60_000` |

`pad` is unchanged. All three new functions take `offsetMinutes: number` as
their final parameter (no default — every call site is updated, FR-008/FR-009
apply uniformly whenever a timestamp format is detected).

## 15. `TimeRangeField` (MODIFIED, `src/components/TimeRangeField.tsx`)

| Prop | Change | Notes |
|---|---|---|
| `offsetMinutes` | **NEW**, required `number` | Threaded into `formatInOffset`/`parseInOffset`/`combineInOffset` (entity 14) everywhere `formatLocal`/`parseLocal`/`combine` were called. `pickerDate`'s seed is constructed via `new Date(year, month, day, hour, minute)` using the Y/M/D/H/M read from `formatInOffset`'s UTC getters (research.md §3.3), so `DayPicker`/the hour/minute `<input>`s — which use local getters — display exactly the offset-adjusted wall-clock values regardless of the browser's timezone. |

## 16. `LogViewToolbar` (MODIFIED, `src/components/LogViewToolbar.tsx`)

Passes `offsetMinutes={fileProperties?.timestamp_offset_minutes ?? 0}` to both
`TimeRangeField` instances, from the `useFileProperties(alias)` call it
already makes (entity 6) — no new query.
