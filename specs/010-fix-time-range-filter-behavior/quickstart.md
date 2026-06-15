# Quickstart: Verifying the Time Range Filter Behavior Fixes

## Automated

```bash
# Frontend
npx tsc --noEmit
npx eslint .
npx vitest run src/lib/timeRange.test.ts src/components/TimeRangeField.test.tsx \
  src/components/LogViewToolbar.test.tsx src/components/LogViewer.test.tsx \
  src/hooks/useLogStream.test.ts src/pages/WorkspacePage.test.tsx \
  src/components/TimeRangeFilterPipeline.test.tsx

# Backend
cd src-tauri
cargo test --test viewing_test
cargo test --test files_test
cargo test --test search_test
cargo test --test mcp_tools_test
cargo test logfile::view_filter
cargo test logfile::offset
cargo clippy -- -D warnings
cargo fmt --check
```

Expect:
- `logfile::view_filter` unit tests: `effective_timestamps` carry-forward
  (FR-004) including the "no preceding timestamp" `None` case; `visible_line_
  indices` returns `None` for `(None, None)` and for the file's exact
  `[first_timestamp, last_timestamp]` span (FR-005), and `Some(_)` with the
  expected subset/ordering for narrower ranges, including a range that
  excludes everything (`Some(vec![])`, Acceptance Scenario 5).
- `logfile::offset` unit tests: `detect_utc_offset_minutes` returns the first
  sampled line's offset for `Iso8601` with explicit offsets, and `0` for
  naive ISO-8601/epoch/space-separated samples.
- `viewing_test.rs`: new `set_view_time_range` + `stream_lines` cases —
  narrowing the range changes `stream_lines`'s returned `LineBatch.lines`
  (now `Vec<LineContent>`) to only in-range `line_index`es, in file order,
  addressed by view-row `start_index`; widening/`(None,None)`/the default
  span restores the full `1..=total_lines` sequence with `line_index ==
  start_index` for every row (identity).
- `files_test.rs`: new `get_file_properties` case reproducing the US2 race —
  poll immediately after `add_file` and assert that the first response with
  `indexing_complete: true` also has `has_timestamp_format`/`first_timestamp`/
  `last_timestamp`/`timestamp_offset_minutes` in their final state (no
  follow-up change); plus a case asserting `timestamp_offset_minutes` for a
  file with explicit-offset ISO-8601 timestamps.
- `search_test.rs`/`mcp_tools_test.rs`: a line with no own timestamp but a
  preceding timestamped line is now included/excluded by `search`/
  `search_with_context` per FR-004 inheritance (previously always excluded).
- `useLogStream.test.ts`: `loadRange` maps `LineBatch.lines[i].line_index` to
  the correct file line index in the returned `lines` map; `totalLines`
  updates after `setViewTimeRange` resolves and `lines` is cleared.
- `LogViewer.test.tsx`: narrowing `timeFrom`/`timeTo` reduces the virtualizer
  row count and renders only in-range `LogLine`s with their correct file
  `lineIndex` (for highlight/selection); a `selectedLine` hidden by the
  filter does not trigger a scroll.
- `WorkspacePage.test.tsx`: a file whose `useFileProperties` mock transitions
  `has_timestamp_format: false → true` (simulating detection completing after
  selection) causes `TimeRangeField`s to appear without remounting
  `WorkspacePage` (US2 Acceptance Scenario 1).
- `TimeRangeField.test.tsx`/`timeRange.test.ts`: `formatInOffset`/
  `parseInOffset`/`combineInOffset` round-trip for `offsetMinutes = 0`
  (UTC, not browser-local) and a non-zero offset (e.g. `+120`, `-300`); the
  picker's displayed day/hour/minute matches the offset-adjusted wall-clock
  value regardless of the test environment's `TZ`.

## Manual (app) — User Story 1: time range filters the main log view (P1)

1. `npm run tauri dev`. Open a log file with a detected timestamp format and
   a known time span (e.g. an hour of evenly-spaced log lines).
2. With "From"/"To" at their pre-filled default span, confirm the main log
   view shows **every** line, same as before this feature (Edge Cases:
   "default span MUST NOT exclude any line").
3. Narrow "To" to roughly the midpoint of the file (via typing or the
   picker): confirm the main log view **immediately** (no search/other
   action) shows only lines at or before that time (Acceptance Scenario 1/4).
4. Narrow "From" to a point after the new "To": confirm the main log view
   shows **zero lines**, with an indication distinct from the empty-file
   state (Acceptance Scenario 5).
5. Widen "From" back below "To": confirm the previously hidden lines reappear
   (Acceptance Scenario 2).
6. Click "Clear": confirm the full line set reappears (FR-005).
7. If the file has any wrapped/continuation lines without their own
   timestamp, narrow the range to a window that includes the timestamped line
   immediately preceding one: confirm the continuation line is shown/hidden
   together with the line it inherits from (Acceptance Scenario 6/FR-004).
8. While a narrowed range is active, select a line (click it) that's near the
   edge of the visible window, then use Arrow Up/Down to move selection past
   the boundary into hidden territory and back: confirm the view doesn't
   crash/jump unexpectedly, and selection becomes visible again once it
   re-enters the visible range (spec Assumptions).
9. Open the search panel and run a search spanning the same narrowed range:
   confirm search match highlighting in the main view only applies to
   currently-visible lines (Edge Cases: "search results panel open while a
   time range edit changes the main view's visible lines").

## Manual (app) — User Story 2: time range fields appear without restart (P2)

1. Quit the app if running, so no files are pre-indexed/cached.
2. `npm run tauri dev`. Add a **new** log file with a detectable timestamp
   format and select it immediately (before detection would normally have
   finished).
3. Confirm the time range fields are **initially hidden** (detection not yet
   complete), then — without closing/reopening the app — confirm they appear
   and are **pre-filled** with the file's first/last line timestamps as soon
   as detection completes (Acceptance Scenario 1, within ~1s per
   `useFileProperties`'s poll interval).
4. Select a different file already known to have a detected timestamp format
   (re-select a previously added file): confirm its time range fields are
   visible **immediately** on selection (Acceptance Scenario 2).
5. Add a file with no detectable timestamp format (e.g. free-form text):
   confirm its time range fields remain hidden, both immediately and after
   detection completes (Acceptance Scenario 3).

## Manual (app) — User Story 3: time range reflects the log's own timezone (P3)

1. Set the OS/browser timezone to something far from UTC (e.g. UTC-8 or
   UTC+9) for this test, or note the current offset.
2. Open a log file whose timestamps carry an explicit UTC offset different
   from the local timezone (e.g. `2026-06-15T10:00:00+02:00`).
3. Confirm the pre-filled "From"/"To" values show `10:00` (the file's own
   offset), **not** the local-timezone-shifted equivalent (Acceptance
   Scenario 1, SC-004).
4. Open the "From" picker: confirm the calendar day and hour/minute inputs
   also show `10:00` on the correct day (research.md §3.3 — picker shows
   wall-clock fields in the file's offset).
5. Type a "From" value exactly equal to a visible log line's printed
   timestamp (in the file's offset) and commit: confirm that line is now the
   first one shown in the main view (US1 + US3 combined, Acceptance
   Scenario 3).
6. Open a log file whose timestamps carry no explicit offset (naive
   ISO-8601, epoch, or space-separated — treated as UTC): confirm "From"/"To"
   show values matching the file's printed timestamps interpreted as UTC,
   not local time (Acceptance Scenario 2).
7. Open a log file with no detected timestamp format: confirm no time range
   fields are shown and nothing else changes (Acceptance Scenario 4).
