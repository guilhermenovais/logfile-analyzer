# Phase 0 Research: Time Range Filter Behavior Fixes

## 1. US1 — Filtering the main log view (FR-001–FR-005)

### 1.1 Current architecture

- `LogViewer`/`useLogStream` render a virtualized window over **all** of a
  file's lines: `useVirtualizer({ count: totalLines, ... })` where
  `totalLines` comes from `subscribe_index_progress`'s `IndexProgress.
  indexed_lines` (file-wide line count), and `loadRange(startIndex, count)`
  calls `stream_lines(alias, startIndex, count, channel)`, which returns
  `LineBatch { start_index: u32, lines: Vec<String> }` where `start_index` and
  every entry's position are 1:1 with **file line indices**.
- `timeFrom`/`timeTo` (`useSearchUiStore`) are currently read only by
  `SearchBar`/`useSearch` (passed to the `search`/`search_with_context` IPC
  commands) and by `LogViewToolbar`. `LogViewer` never reads them — this is
  why "nothing happens" (the bug report's core complaint).
- `logfile::query::filter_by_time_range(match_indices, line_timestamps,
  time_from, time_to)` already exists, is correct, and is unit-tested. It
  takes a `Vec<usize>` of candidate 1-based line indices and returns the
  subset whose `line_timestamps[i-1]` (own timestamp only, no inheritance)
  falls in `[time_from, time_to]`; lines with `None` are dropped entirely.

### 1.2 Decision: backend computes and caches a "visible line index" list

- **Decision**: add a new Tauri command `set_view_time_range(alias, time_from:
  Option<f64>, time_to: Option<f64>) -> Result<u32>` that computes the file's
  current "view filter" — a `Vec<u32>` of 1-based **file** line indices that
  should be displayed, in order — caches it on `FileRuntime`, and returns its
  length (the new visible-line count). `stream_lines` is changed so
  `start_index`/`count` address this cached list (1-based "view-row" index)
  instead of raw file line indices, and `LineBatch.lines` becomes
  `Vec<LineContent>` (`{ line_index, content }`, the existing
  `commands::types::LineContent`) so each returned row still carries its
  **actual file line index** for highlight/selection/search-match lookups
  (data-model.md "Displayed Log View").
- **Rationale**:
  - Computing the filter is an O(total_lines) pass over data already resident
    in memory (`effective_timestamps`, §1.3) — cheap as a one-shot operation
    triggered on range *commit* (not on every scroll), but too much to redo
    on every `stream_lines` call for multi-million-line files (Principle VI).
    Caching on `FileRuntime` amortizes it to "once per committed range
    change".
  - Keeping `LineBatch` rows self-describing (`line_index` per row) lets
    `LogViewer` continue to key highlights/selection/search-match maps by
    **file** line index (spec Assumptions: "Highlighted lines, search match
    indices, and line-selection state continue to refer to line indices in
    the underlying file") while the virtualizer itself operates over
    **view-row** indices (1..=visible_line_count).
  - No new dependencies; reuses the existing `LineContent` DTO already used
    by `search`/`search_with_context`.
- **Alternatives considered**:
  - Sending the full `Vec<u32>` of visible line indices to the frontend so it
    can do the mapping — rejected: for a 10M-line file this is a 40MB
    payload, violating Principle VI's "streamed payloads under ~100KB".
  - Recomputing the filter inside every `stream_lines` call (no cache) —
    rejected: an O(n) scan over up to 10M entries on every scroll-driven
    `loadRange` would risk visible jank (Principle VI, "never block the Tauri
    main thread" for CPU-heavy work triggered this often).
  - Per-line `get_line` IPC calls for a non-contiguous visible set — rejected:
    re-introduces the many-small-round-trips problem `stream_lines`'s
    `Channel`/`LineBatch` design was built to avoid.

### 1.3 Decision: FR-004 inheritance via a precomputed `effective_timestamps`

- **Decision**: during `timestamp::detect_and_parse` (after `line_timestamps`
  is computed), compute `effective_timestamps: Vec<Option<i64>>` — for each
  line, its own timestamp if `Some`, else the **nearest preceding** line's
  timestamp (carry-forward; remains `None` for any line before the first
  timestamped line). Store it on `FileIndex`. Both `set_view_time_range`
  (new, main view) and `filter_by_time_range`'s callers in `commands::search`,
  `commands::search_with_context`, and `mcp::tools` switch from
  `index.line_timestamps` to `index.effective_timestamps`.
- **Rationale**: FR-004 says inheritance for lines without their own
  timestamp must be "consistent with existing time-range handling for search
  results" — but `filter_by_time_range` as written has **no** inheritance; it
  excludes any line whose own `line_timestamps[i-1]` is `None`. Reading the
  spec's Edge Cases bullet and Assumptions together, this is the behavior the
  spec *wants* to be true everywhere, not an existing guarantee — so this
  feature both introduces main-view filtering **and** retrofits inheritance
  into the shared `filter_by_time_range` call sites, making FR-004 actually
  hold for search results too (closing the gap rather than leaving it only
  half-true). `filter_by_time_range`'s signature/semantics
  (`Vec<usize> -> Vec<usize>`, inclusive bounds, no-op when both bounds
  `None`) are unchanged — only the timestamps slice passed to it changes.
- **Memory tradeoff**: this doubles the per-line timestamp memory footprint
  (`Vec<Option<i64>>` ~16 bytes/line, so +~160MB for a 10M-line file on top of
  the existing `line_timestamps`). Accepted as consistent with
  `line_timestamps`'s pre-existing scaling characteristics (computed once at
  detection time, not per-search); recomputing it on demand inside every
  `search`/`set_view_time_range` call was rejected as repeated O(n) work for
  an interactive feature (search-as-you-type, range edits).
- **Alternatives considered**: computing `effective_timestamps` lazily inside
  `set_view_time_range`/`search` and caching it there — rejected, two
  near-identical caches (one per feature) vs. one shared `FileIndex` field is
  more complex for no benefit.

### 1.4 Decision: FR-005 "default span excludes nothing" as a special case

- **Decision**: `set_view_time_range` treats the request as "no filtering" —
  `view_filter = None` (identity, all `total_lines` visible, including any
  line with `effective_timestamps[i] == None`, e.g. a file header before the
  first timestamped line) — when **either** both bounds are `None`, **or**
  `time_from <= first_timestamp && time_to >= last_timestamp` (the requested
  range fully covers the file's timestamped span, i.e. it *is* the
  FR-007/FR-011-from-009 pre-filled default, possibly widened). Otherwise it
  computes `visible_line_indices = filter_by_time_range((1..=total_lines),
  effective_timestamps, time_from, time_to)` (which, per §1.3, drops any line
  with no effective timestamp).
- **Rationale**: 009's `initializeTimeRange` pre-fills `timeFrom`/`timeTo` to
  `Some(first_timestamp)`/`Some(last_timestamp)` as soon as detection
  completes — they are essentially never both `None` once a format is
  detected. Without this special case, a file with leading lines that have no
  timestamp and no preceding timestamped line to inherit from (`effective_
  timestamps[i] == None`) would have those lines excluded even at the
  "default span, nothing changed" state, violating the spec's Edge Cases
  bullet ("the main log view shows all lines, same as before this feature")
  and Acceptance Scenario 5's "no visible change" guarantee from 009.
- **Alternatives considered**: making `effective_timestamps[i] == None` lines
  *always* visible regardless of range (never filtered) — rejected: FR-004
  says such lines participate in filtering via inheritance; a line with *no*
  basis at all (no preceding timestamp) genuinely has no defined position in
  the timeline, and excluding it once the user has *intentionally* narrowed
  the range is more consistent with "showing only lines whose timestamp falls
  within range" (FR-001) than always-show.

### 1.5 Decision: `useLogStream`/`LogViewer` integration

- **Decision**: `useLogStream(alias, timeFrom, timeTo, hasTimestampFormat)`
  gains two new parameters. Whenever `(timeFrom, timeTo)` changes (and
  `hasTimestampFormat` is true), it calls `setViewTimeRange(alias, timeFrom,
  timeTo)`, sets `totalLines` from the returned count, and clears its cached
  `lines` map (the view-row → content mapping is now stale). When
  `hasTimestampFormat` is false, `setViewTimeRange` is never called and
  `totalLines` continues to come from `IndexProgress.indexed_lines`
  (file-wide), exactly as today — `view_filter` stays `None` server-side too,
  so `stream_lines`'s behavior is byte-for-byte unchanged for files without a
  detected format.
- `lines` becomes `Map<number, LineContent>` (view-row → `{line_index,
  content}`). `LogViewer` reads `lines.get(viewRow)?.line_index` for the
  `LogLine` `lineIndex` prop (highlight lookup, `isSelected`,
  `isSearchMatch`, `onToggleHighlight`/`onSelect` callbacks) and
  `lines.get(viewRow)?.content` for the text — preserving "selection/
  highlight/search-match state refers to file line indices" while the
  virtualizer itself only ever sees view-row indices `1..=totalLines`
  (data-model.md "Displayed Log View").
- `LogViewer` reads `timeFrom`/`timeTo` from `useSearchUiStore` (alongside its
  existing `searchMatchLines`/`scrollToLine` reads) and receives
  `hasTimestampFormat` as a new prop from `WorkspacePage` (which already
  computes it).
- **`useLineSelectionKeyboard`/`moveSelection` are unchanged**: their
  `totalLines` parameter continues to mean *file*-wide total lines (needed to
  clamp a `selectedLine` that is a file line index), sourced from
  `IndexProgress.indexed_lines` as today — `LogViewer` now has two distinct
  totals (`viewTotalLines` for the virtualizer, `fileTotalLines` for keyboard
  clamping) and passes the right one to each consumer.
- **Scrolling to a hidden `selectedLine`**: the existing `navNonce` effect
  (`virtualizer.scrollToIndex(selectedLine - 1, ...)`) assumed `selectedLine`
  (a file line index) *is* a view-row index — true only when unfiltered. With
  filtering active, `LogViewer` instead does a reverse lookup over its
  currently-*loaded* `lines` entries for one whose `line_index ===
  selectedLine`, and scrolls to that view-row; if `selectedLine` isn't
  currently loaded/visible (likely hidden by the filter), the scroll is a
  no-op. This matches the spec Assumptions verbatim ("currently-selected or
  highlighted lines that fall outside the range are simply not rendered...
  consistent with how the existing 'Highlighted only' filter already
  behaves") — arrow-key navigation across a run of hidden lines may show no
  visible movement until `selectedLine` re-enters the visible set, which is an
  accepted consequence of that Assumption, not a new requirement to solve
  (no FR calls for "skip hidden lines" navigation).
- **Alternatives considered**: re-deriving `selectedLine` itself into
  view-row space — rejected, would require the full `visible_lines` mapping
  client-side (§1.2's rejected alternative) and contradicts the Assumption
  that selection state stays in file-line-index space.

---

## 2. US2 — Time range fields appear without restart (FR-006/FR-007)

### 2.1 Root cause (two independent staleness bugs)

Reproduced via static trace of `add_file` → `index_and_detect_timestamps` →
`get_file_properties` → `WorkspacePage`:

1. **Backend race**: `index_and_detect_timestamps` calls
   `mmap_index::build_line_index` (sets `index.state = Ready`, i.e.
   `IndexProgress.complete = true` / `FileProperties.indexing_complete =
   true` today) **before** `timestamp::detect_and_parse` (which sets
   `timestamp_profile`/`line_timestamps` and triggers the `has_timestamp_
   format` DB write). `useFileProperties`'s `refetchInterval` (research.md
   from 008, `filePropertiesRefetchInterval`) stops polling as soon as
   `indexing_complete` is `true`. If that poll lands in the window between
   the two steps, `indexing_complete` is already `true` but `has_timestamp_
   format`/`first_timestamp`/`last_timestamp` are still `false`/`null` —
   permanently, since polling has stopped.
2. **Stale data source**: `WorkspacePage.hasTimestampFormat` is read from
   `workspace.files.find(f => f.alias === selectedAlias)?.has_timestamp_
   format`, where `workspace` comes from `useActiveWorkspace()` — a one-shot
   `useQuery` with **no** `refetchInterval`. Even once `useFileProperties`
   correctly reports `has_timestamp_format: true`, `WorkspacePage` never
   looks at it for this flag, so `LogViewToolbar`/`SearchBar` never receive
   `hasTimestampFormat = true` until something else refetches `["workspace"]`
   (e.g. a remount / app restart, matching the reported symptom).

Both must be fixed together: fixing only #1 doesn't help because
`WorkspacePage` doesn't consume `useFileProperties().has_timestamp_format`;
fixing only #2 leaves the race in #1 that can still freeze `useFileProperties`
in a stale `has_timestamp_format: false` state.

### 2.2 Decision: split "line index ready" from "timestamp detection ready"

- **Decision**: add `FileIndex.timestamp_detection_complete: bool` (default
  `false`), set to `true` by `index_and_detect_timestamps` immediately after
  `timestamp::detect_and_parse` returns (regardless of whether a format was
  detected) — i.e. *after* the `has_timestamp_format` DB write. Redefine
  `FileProperties.indexing_complete` (the field `useFileProperties`'s
  `filePropertiesRefetchInterval` keys off) as `index.state ==
  IndexState::Ready && index.timestamp_detection_complete`. `IndexProgress`/
  `subscribe_index_progress` (which gates `stream_lines` availability, FR-014
  from earlier features) is **unchanged** — line content is available as soon
  as line offsets are indexed, independent of timestamp detection.
- **Rationale**: this closes the race precisely — `useFileProperties` keeps
  polling until *both* the line index and timestamp detection (incl. the
  `has_timestamp_format` DB write and `first_timestamp`/`last_timestamp`
  availability) are settled, so the values it returns when polling stops are
  always final. It's a one-field, additive change with no effect on the
  unrelated `stream_lines`/`subscribe_index_progress` contract.
- **Alternatives considered**: making `index.state` itself only flip to
  `Ready` after `detect_and_parse` — rejected, would delay `stream_lines`
  availability (and the existing FR-014 "incremental viewing while indexing"
  guarantee) on detection, which is unrelated to line-content streaming.

### 2.3 Decision: `WorkspacePage` reads `hasTimestampFormat` from `useFileProperties`

- **Decision**: `WorkspacePage` derives `hasTimestampFormat` from
  `fileProperties?.has_timestamp_format ?? false` (the same
  `useFileProperties(selectedAlias)` call it already makes for
  `first_timestamp`/`last_timestamp`), instead of `workspace.files.find(...).
  has_timestamp_format`.
- **Rationale**: `useFileProperties` already polls (research.md from 008)
  specifically so `first_timestamp`/`last_timestamp` become available without
  a restart; `has_timestamp_format` is computed by the same backend call from
  the same up-to-date DB read (`commands::files::file_properties`), so reusing
  it for `hasTimestampFormat` is both correct and "free" (no new query). Once
  §2.2's race is fixed, this value flips to `true` and stays `true` as soon as
  detection genuinely completes, triggering the FR-006 re-render that shows
  `TimeRangeField`s (already conditionally rendered on `hasTimestampFormat` in
  `LogViewToolbar`/`SearchBar`).
- **Scope note**: `WorkspaceSidebar`'s per-file "Indexing…" badge (from the
  same stale `workspace.files[...].indexing_complete`) has the analogous
  staleness issue, but no FR in this spec covers the sidebar — left as-is
  (flagging per Principle's "consistency vs. theoretical best practice" only
  applies to *areas this feature touches*; the sidebar is untouched).

---

## 3. US3 — Time range fields use the log's own timezone (FR-008/FR-009)

### 3.1 Current behavior

`src/lib/timeRange.ts`'s `formatLocal`/`parseLocal`/`combine` (009) use
`Date`'s **local** getters/setters (`getFullYear`, `setHours`, etc.) — i.e.
the *browser's* timezone. `extract_timestamp`/`parse_iso8601` (backend) parse
ISO-8601-with-offset correctly to epoch-ms (the offset is *applied*, just not
*recorded*); naive ISO-8601/epoch/space-separated formats are parsed as UTC.
No offset information reaches the frontend today.

### 3.2 Decision: detect and expose `timestamp_offset_minutes`

- **Decision**: add `FileIndex.utc_offset_minutes: i32` (default `0`). During
  `detect_and_parse`, if the detected format is `Iso8601`, scan the same
  sample lines used for format detection with `DateTime::parse_from_rfc3339`
  and take the **first** line that parses with an explicit offset; store
  `offset.local_minus_utc() / 60` (minutes). If no sampled line has an
  explicit offset (or the format isn't `Iso8601`), leave it `0` (UTC). Add
  `FileProperties.timestamp_offset_minutes: i32`, populated from this field
  (only meaningful — and only read — when `has_timestamp_format` is true; `0`
  otherwise per FR-008's "UTC for formats that do not [carry an offset]").
- **Rationale**: matches the spec's Key Entity "Log Timestamp Timezone" and
  Assumptions ("a single file has one consistent log timestamp timezone... the
  offset embedded in offset-bearing formats, or UTC for naive formats").
  Reusing the format-detection sample avoids a second file scan.
- **Alternatives considered**: per-line offsets (a file could theoretically
  mix offsets) — explicitly out of scope per the spec's Assumptions ("Files
  that mix inconsistent explicit offsets across lines are out of scope for
  special-casing beyond this rule").

### 3.3 Decision: offset-aware formatting/parsing without new dependencies

- **Decision**: replace `formatLocal`/`parseLocal`/`combine` in
  `src/lib/timeRange.ts` with `formatInOffset(epochMs, offsetMinutes)`,
  `parseInOffset(text, offsetMinutes)`, and `combineInOffset(date, hour,
  minute, offsetMinutes)`:
  - `formatInOffset`: read Y/M/D/H/M via `new Date(epochMs + offsetMinutes *
    60_000)`'s **UTC** getters (`getUTCFullYear`, etc. — these are
    timezone-independent, so adding the offset first and reading as UTC
    yields exactly the wall-clock time in that offset).
  - `parseInOffset`: parse Y/M/D/H/M from text, compute `Date.UTC(y, m-1, d,
    h, min)` (timezone-independent), then `epochMs = utcMs - offsetMinutes *
    60_000`.
  - For the `TimeRangeField` picker (`DayPicker` + hour/minute `<input>`s,
    which render using the `Date`'s **local** getters): construct `pickerDate`
    via the `new Date(year, month, day, hour, minute)` **constructor** using
    the Y/M/D/H/M values from `formatInOffset`'s UTC-getter read. Because the
    constructor and `DayPicker`'s local getters are self-consistent (both
    "local" in whatever timezone the runtime has), the displayed calendar
    day/time always equals the Y/M/D/H/M we fed in, *regardless of the
    browser's actual timezone* — the picker becomes a pure "wall-clock fields"
    widget. `combineInOffset` reads `pickerDate`'s local Y/M/D back out, combines
    with `pickerHour`/`pickerMinute`, and converts via `Date.UTC(...) -
    offsetMinutes * 60_000`.
- **Rationale**: this is the same `Date`-constructor/getter self-consistency
  trick 009's `formatLocal`/`parseLocal`/`combine` already relied on (implicitly,
  for offset 0 = "browser local") — generalizing it to an explicit
  `offsetMinutes` parameter requires no new dependencies (Principle III) and
  keeps `TimeRangeField`'s `DayPicker`/Radix Popover usage unchanged
  (Principle V). When `offsetMinutes === 0` (the common case — UTC-only
  formats), this now formats/parses in **UTC**, not the browser's local
  timezone — this *is* the FR-008 Scenario 2 fix, not a regression.
- **Alternatives considered**: `date-fns-tz`/`luxon`/`Intl` with explicit
  offset timezones — rejected as an avoidable new dependency (Principle III)
  for arithmetic that's ~10 lines of `Date.UTC`/`getUTC*` calls.

### 3.4 Decision: threading `offsetMinutes` through the component tree

- **Decision**: `TimeRangeField` gains a required `offsetMinutes: number`
  prop, used in place of the removed `formatLocal`/`parseLocal`/`combine`
  calls. `LogViewToolbar` passes `fileProperties?.timestamp_offset_minutes ??
  0` (from its existing `useFileProperties(alias)` call) to both `TimeRangeField`s.
- **Rationale**: `LogViewToolbar` already fetches `FileProperties` for
  `first_timestamp`/`last_timestamp` (009's Clear fix) — `timestamp_offset_
  minutes` is one more field from the same response, no new query
  (consistent with 009 research.md §3's "TanStack Query dedupes" reasoning).

---

## 4. File-size management (Principle III: ≤200 lines TS/TSX, ≤300 Rust)

- New Rust module `src-tauri/src/logfile/view_filter.rs`: houses
  `effective_timestamps` (§1.3) and `visible_line_indices` (§1.2/§1.4, wraps
  `query::filter_by_time_range` with the FR-005 special case). Keeps
  `logfile/query.rs` (currently 301 lines) from growing further.
- New Rust module `src-tauri/src/logfile/offset.rs`: houses
  `detect_utc_offset_minutes` (§3.2) as a small, independently-testable unit.
  `logfile/timestamp.rs` (currently 356 lines, already over the 300-line
  guideline pre-existing this feature) gains only ~10 lines (two field writes
  + two calls into the new modules) — flagged in Complexity Tracking rather
  than undertaking an unrelated full split of `timestamp.rs` as part of this
  fix (Development Workflow: "flag the inconsistency... rather than silently
  fixing it").
- `commands/viewing.rs` (118 lines) absorbs `set_view_time_range` and the
  `stream_lines` changes — estimated ~210 lines, within budget.
- `src/lib/timeRange.ts` (47 lines) and `src/components/TimeRangeField.tsx`
  (175 lines) both grow modestly (an `offsetMinutes` parameter/prop threaded
  through existing functions) — estimated ~70 and ~190 lines respectively,
  within budget. No further extraction needed.
- `src/hooks/useLogStream.ts` (66 lines) gains `setViewTimeRange` wiring —
  estimated ~110 lines, within budget.
