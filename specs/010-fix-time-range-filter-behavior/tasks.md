---

description: "Task list for Time Range Filter Behavior Fixes"
---

# Tasks: Time Range Filter Behavior Fixes

**Input**: Design documents from `/specs/010-fix-time-range-filter-behavior/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/main-view-time-filter.md, contracts/file-properties-and-timezone.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Each user story phase below writes failing tests before its implementation tasks.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P2, US3 = P3) so each can be implemented and validated independently, in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps the task to US1/US2/US3
- All file paths are relative to the repository root

---

## Phase 1: Setup

- [X] T001 Confirm a clean baseline before changes: run `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check` and `npx tsc --noEmit && npx eslint . && npx vitest run` from the repo root. Fix or note any pre-existing failures unrelated to this feature before proceeding (do not fix them as part of this feature unless they block later tasks).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the new per-file state fields that US1 (`effective_timestamps`, `view_filter`), US2 (`timestamp_detection_complete`), and US3 (`utc_offset_minutes`) all build on, without breaking any existing construction site.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — adding fields to `FileIndex`/`FileRuntime` breaks every exhaustive struct literal that constructs them.

- [X] T002 In `src-tauri/src/state.rs`, add to `FileIndex` (data-model.md §1): `pub effective_timestamps: Option<Vec<Option<i64>>>` (default `None`), `pub utc_offset_minutes: i32` (default `0`), `pub timestamp_detection_complete: bool` (default `false`). Add to `FileRuntime` (data-model.md §2): `pub view_filter: RwLock<Option<Vec<u32>>>` (default `None`, not part of `FileIndex`/its `RwLock` — its own lock per data-model.md §2's rationale). `FileIndex` keeps `#[derive(Default)]` (all three new types implement `Default`); `FileRuntime` has no `Default` derive, so every construction site needs updating (T003).

- [X] T003 Update every exhaustive `FileIndex { ... }` and `FileRuntime { ... }` struct literal to include the three new `FileIndex` fields (`effective_timestamps: None`, `utc_offset_minutes: 0`, `timestamp_detection_complete: false`) and the new `FileRuntime` field (`view_filter: RwLock::new(None)`), so the workspace continues to compile:
  - `src-tauri/src/commands/files.rs` (`add_file`'s `FileRuntime { ..., index: RwLock::new(FileIndex::default()) }` — add `view_filter: RwLock::new(None)`; `FileIndex::default()` already covers the new fields)
  - `src-tauri/src/commands/workspace.rs` (`load_workspace_files`'s `FileRuntime { ... }` — same: add `view_filter: RwLock::new(None)`)
  - `src-tauri/tests/viewing_test.rs` (3 `FileIndex { ... }` / `FileRuntime { ... }` literals)
  - `src-tauri/tests/files_test.rs` (3 literals, including the one with `line_timestamps: Some(vec![...])`)
  - `src-tauri/tests/search_test.rs` (2 literals)
  - `src-tauri/tests/mcp_tools_test.rs` (2 literals)
  - `src-tauri/tests/highlights_test.rs` (1 literal)
  - `src-tauri/tests/mcp_highlights_test.rs` (1 literal)
  - `src-tauri/tests/mcp_server_test.rs` (1 literal)

  Run `cd src-tauri && cargo build && cargo test` after this task to confirm the workspace compiles and all pre-existing tests still pass before starting US1.

**Checkpoint**: Foundation ready — `cargo build`/`cargo test` pass with the new (unused) fields present.

---

## Phase 3: User Story 1 - Time range filter restricts the main log view (Priority: P1) 🎯 MVP

**Goal**: Setting/clearing "From"/"To" immediately narrows (or restores) the lines shown in the main log view, including FR-004's "inherit nearest preceding timestamp" rule, while highlight/selection/search-match state continues to key off file line indices.

**Independent Test**: Open a file with a detected timestamp format and a known time span; narrow "From"/"To" and confirm the main log view immediately shows only in-range lines (including continuation lines via inheritance); widen/Clear restores the full set; a fully-excluding range shows zero lines distinctly from the empty-file state.

### Tests for User Story 1 (MANDATORY — write first, confirm they fail) ⚠️

- [X] T004 [P] [US1] In `src-tauri/src/logfile/view_filter.rs` (new file, `#[cfg(test)] mod tests`), write unit tests for the not-yet-implemented `effective_timestamps`, `timestamp_bounds`, and `visible_line_indices` (data-model.md §4): `effective_timestamps` carry-forward including the "no preceding timestamp" `None` case (FR-004); `visible_line_indices` returns `None` for `(None, None)` and for the file's exact `[first_timestamp, last_timestamp]` span (FR-005), and `Some(_)` with the expected ordered subset for narrower ranges, including a range that excludes everything (`Some(vec![])`, Acceptance Scenario 5). Add empty `pub fn` stubs (e.g. `unimplemented!()`) so the file compiles but the tests fail.

- [X] T005 [US1] In `src-tauri/tests/viewing_test.rs`, add `set_view_time_range` + `stream_lines` test cases per contracts/main-view-time-filter.md §1-2: narrowing the range via `viewing::set_view_time_range` changes a subsequent `stream_lines` call's `LineBatch.lines` (now `Vec<LineContent>`) to only in-range `line_index`es in file order, addressed by view-row `start_index`; widening back to `(None, None)` or the file's exact `[first_timestamp, last_timestamp]` span restores the full `1..=total_lines` sequence with `line_index == start_index + offset` for every row (identity). These will fail to compile until T011/T012/T014/T015 land.

- [X] T006 [P] [US1] In `src-tauri/tests/search_test.rs`, add a case: a line with no own timestamp but a preceding timestamped line is now included/excluded by `search`'s `time_from`/`time_to` filtering based on the *preceding* line's timestamp (FR-004 inheritance via `effective_timestamps`, previously always excluded). Confirm it fails against current `line_timestamps`-based filtering.

- [X] T007 [P] [US1] In `src-tauri/tests/mcp_tools_test.rs`, add the equivalent FR-004 inheritance case for the MCP `search_with_context` tool (`run_search_with_context`).

- [X] T008 [P] [US1] In `src/hooks/useLogStream.test.ts`, update/add tests for the new `useLogStream(alias, timeFrom, timeTo, hasTimestampFormat)` signature (data-model.md §10): `loadRange` maps each `LineBatch.lines[i].line_index` to the correct file line index in the returned `lines: Map<number, LineContent>`; `totalLines` updates (and `lines` is cleared) after `setViewTimeRange` resolves when `(timeFrom, timeTo)` changes and `hasTimestampFormat` is `true`; when `hasTimestampFormat` is `false`, `setViewTimeRange` is never called and `totalLines === fileTotalLines` (from `IndexProgress.indexed_lines`).

- [X] T009 [P] [US1] In `src/components/LogViewer.test.tsx`, add/update tests for the new required `hasTimestampFormat` prop and `timeFrom`/`timeTo` reads from `useSearchUiStore`: narrowing `timeFrom`/`timeTo` reduces the virtualizer row count and renders only in-range `LogLine`s with their correct file `lineIndex` (for highlight/selection/search-match props); a `selectedLine` hidden by the active filter does not trigger a scroll (no-op reverse lookup).

### Implementation for User Story 1

- [X] T010 [US1] Create `src-tauri/src/logfile/view_filter.rs` implementing (data-model.md §4, research.md §1.2-1.4) `pub fn effective_timestamps(line_timestamps: &[Option<i64>]) -> Vec<Option<i64>>` (carry-forward from the nearest preceding `Some`, FR-004), `pub fn timestamp_bounds(timestamps: &[Option<i64>]) -> (Option<i64>, Option<i64>)` (first/last `Some` entry in order), and `pub fn visible_line_indices(total_lines: usize, effective_timestamps: &[Option<i64>], first_ts: Option<i64>, last_ts: Option<i64>, time_from: Option<i64>, time_to: Option<i64>) -> Option<Vec<u32>>` (FR-001-FR-005: `None` for `(None,None)` or when the requested range fully covers `[first_ts, last_ts]`; otherwise `Some(filter_by_time_range((1..=total_lines), effective_timestamps, time_from, time_to))` cast to `u32`, reusing `logfile::query::filter_by_time_range`). Add `pub mod view_filter;` to `src-tauri/src/logfile/mod.rs`. Make the T004 tests pass; run `cargo test logfile::view_filter`.

- [X] T011 [US1] In `src-tauri/src/logfile/timestamp.rs`'s `detect_and_parse`, after `line_timestamps` is computed and `guard.line_timestamps = Some(line_timestamps)` is set, also compute `guard.effective_timestamps = Some(view_filter::effective_timestamps(&line_timestamps))` (research.md §1.3). Import `crate::logfile::view_filter`.

- [X] T012 [US1] In `src-tauri/src/commands/files.rs`, change `line_timestamp_bounds` to a thin wrapper: `fn line_timestamp_bounds(line_timestamps: &Option<Vec<Option<i64>>>) -> (Option<f64>, Option<f64>)` calls `crate::logfile::view_filter::timestamp_bounds(timestamps)` and maps the `(Option<i64>, Option<i64>)` result to `(Option<f64>, Option<f64>)` via `as f64` (data-model.md §4, generalizing the existing first/last-`Some` logic). No behavior change for existing callers.

- [X] T013 [US1] In `src-tauri/src/commands/types.rs`, change `LineBatch` (data-model.md §7 / contracts/main-view-time-filter.md §2) from `pub lines: Vec<String>` to `pub lines: Vec<LineContent>` (the existing `LineContent { line_index: u32, content: String }` DTO, already `Deserialize`).

- [X] T014 [US1] In `src-tauri/src/commands/viewing.rs` (contracts/main-view-time-filter.md §1-2, data-model.md §3/§8):
  - Add `pub async fn set_view_time_range(state: State<'_, Arc<AppState>>, alias: String, time_from: Option<f64>, time_to: Option<f64>) -> Result<u32>` (`#[tauri::command] #[specta::specta]`), run via `spawn_blocking`: resolve the runtime, read `index.effective_timestamps` (treat `None` as `&[]`) and compute `(first_ts, last_ts)` via `view_filter::timestamp_bounds`, call `view_filter::visible_line_indices(index.total_lines, ..., time_from.map(|v| v as i64), time_to.map(|v| v as i64))`, store the result in `runtime.view_filter`, and return `view_filter.as_ref().map_or(index.total_lines as u32, |v| v.len() as u32)`.
  - Rewrite `stream_lines` so `start_index`/`count` address the **view-row** range `1..=total_visible` where `total_visible = view_filter.as_ref().map_or(available, Vec::len)`; for each `view_row` in range, resolve `line_index = view_filter.as_ref().map_or(view_row, |v| v[view_row - 1] as usize)`, fetch its bytes via the existing `line_bytes`, and push `LineContent { line_index: line_index as u32, content }` instead of a bare `String`. `LineBatch.start_index` remains the batch's first **view-row** index.
  - Import `crate::logfile::view_filter` and `crate::commands::types::LineContent`.

- [X] T015 [US1] In `src-tauri/src/lib.rs`, add `viewing::set_view_time_range` to the `collect_commands!` list in `specta_builder()`.

- [X] T016 [US1] In `src-tauri/src/commands/search.rs`, change both `search` and `search_with_context`'s `filter_by_time_range`/`search_with_context` calls from `index.line_timestamps.as_deref().unwrap_or(&[])` to `index.effective_timestamps.as_deref().unwrap_or(&[])` (contracts/main-view-time-filter.md §3, FR-004/FR-010). No signature changes.

- [X] T017 [US1] In `src-tauri/src/mcp/tools.rs`'s `run_search_with_context`, make the same change: `index.line_timestamps.as_deref().unwrap_or(&[])` → `index.effective_timestamps.as_deref().unwrap_or(&[])` (line ~328).

- [X] T018 [US1] Regenerate TS bindings: `cd src-tauri && cargo test --test export_bindings`. Confirm `src/bindings/index.ts` now declares `setViewTimeRange` and `LineBatch.lines: LineContent[]`.

- [X] T019 [US1] In `src/ipc/viewing.ts`, add `export async function setViewTimeRange(alias: string, timeFrom: number | null, timeTo: number | null): Promise<number>` wrapping `commands.setViewTimeRange` + `unwrapResult` (mirrors `streamLines`'s pattern). The re-exported `LineBatch` type now has `lines: LineContent[]`; export `LineContent` alongside it.

- [X] T020 [US1] Rewrite `src/hooks/useLogStream.ts` per data-model.md §10: signature becomes `useLogStream(alias: string | null, timeFrom: number | null, timeTo: number | null, hasTimestampFormat: boolean): UseLogStreamResult` where `UseLogStreamResult` is `{ lines: Map<number, LineContent>; totalLines: number; fileTotalLines: number; indexingComplete: boolean; loadRange: (startIndex: number, count: number) => void }`. `fileTotalLines`/`indexingComplete` continue to come from `subscribeIndexProgress` as today. Add an effect: whenever `(timeFrom, timeTo)` changes (by value) and `hasTimestampFormat` is `true`, call `setViewTimeRange(alias, timeFrom, timeTo)`, set `totalLines` from the returned count, and clear `lines`. When `hasTimestampFormat` is `false`, never call `setViewTimeRange` and keep `totalLines === fileTotalLines`. Update `loadRange`'s `streamLines` callback to store `LineContent` objects keyed by view-row (`batch.start_index + offset`) instead of bare strings.

- [X] T021 [US1] Update `src/components/LogViewer.tsx` (data-model.md §11, contracts/main-view-time-filter.md §4):
  - Add required prop `hasTimestampFormat: boolean`.
  - Read `timeFrom`/`timeTo` from `useSearchUiStore`'s slice for `alias` (alongside the existing `searchMatchLines`/`scrollToLine` reads) and pass them plus `hasTimestampFormat` into `useLogStream`.
  - `useVirtualizer({ count: totalLines, ... })` uses the **view** total from `useLogStream`; pass `fileTotalLines` (not `totalLines`) as `useLineSelectionKeyboard`'s `totalLines` clamp param.
  - For each rendered row, resolve `lineIndex`/`content` from `lines.get(viewRow)?.line_index` / `lines.get(viewRow)?.content` (defaulting to `""`/skipping if not loaded) instead of treating `viewRow` as the file line index.
  - Change the `navNonce` scroll-to-`selectedLine` effect from `virtualizer.scrollToIndex(selectedLine - 1, ...)` to a reverse lookup over the currently-loaded `lines` entries for the `viewRow` whose `.line_index === selectedLine`, scrolling to that `viewRow` if found and no-op otherwise (spec Assumptions: hidden lines "are simply not rendered"). Apply the same `line_index`-keyed reverse-lookup to the existing `scrollToLine` (search-match) effect, since that prop's `lineIndex` is also a file line index being used to drive `virtualizer.scrollToIndex`.

- [X] T022 [US1] In `src/pages/WorkspacePage.tsx`, pass `hasTimestampFormat={hasTimestampFormat}` to `<LogViewer ... />` (the existing `hasTimestampFormat` variable, already passed to `SearchBar`/`LogViewToolbar`; its data source is corrected in US2/T026).

**Checkpoint**: Run `cd src-tauri && cargo test --test viewing_test --test search_test --test mcp_tools_test && cargo test logfile::view_filter && cargo clippy -- -D warnings && cargo fmt --check` and `npx tsc --noEmit && npx eslint . && npx vitest run src/hooks/useLogStream.test.ts src/components/LogViewer.test.tsx`. Then manually verify quickstart.md's "User Story 1" steps 1-9 in `npm run tauri dev`. US1 is independently shippable as the MVP.

---

## Phase 4: User Story 2 - Time range fields appear as soon as the file is ready (Priority: P2)

**Goal**: Close the two staleness bugs so `TimeRangeField`s appear (pre-filled) as soon as timestamp detection completes, without an app restart.

**Independent Test**: Add a new file with a detectable timestamp format and select it immediately; confirm the time range fields appear pre-filled as soon as detection completes, without closing/reopening the app. A re-selected already-detected file shows them immediately; a file without a detectable format never shows them.

### Tests for User Story 2 (MANDATORY — write first, confirm they fail) ⚠️

- [X] T023 [P] [US2] In `src-tauri/tests/files_test.rs`, add a test reproducing the US2 race (research.md §2.1, contracts/file-properties-and-timezone.md §1): after `add_file`-equivalent setup, poll `file_properties` immediately once `index.state == IndexState::Ready` but before `timestamp_detection_complete` is set, and assert `indexing_complete` is still `false` in that intermediate state; once `timestamp_detection_complete` is also `true`, assert `indexing_complete: true` is returned together with final `has_timestamp_format`/`first_timestamp`/`last_timestamp`/`timestamp_offset_minutes` values (no later change). This should fail against the current `indexing_complete = (state == Ready)` definition.

- [X] T024 [P] [US2] In `src/pages/WorkspacePage.test.tsx`, add/update a test where `useFileProperties`'s mock returns `has_timestamp_format: false` then transitions to `has_timestamp_format: true` (simulating detection completing after the file is already selected): confirm `TimeRangeField`s (rendered inside `LogViewToolbar`/`SearchBar`) appear after the transition without remounting `WorkspacePage` (US2 Acceptance Scenario 1). This should fail while `hasTimestampFormat` is sourced from `useActiveWorkspace()`.

### Implementation for User Story 2

- [X] T025 [US2] In `src-tauri/src/commands/files.rs`'s `index_and_detect_timestamps`, after `timestamp::detect_and_parse(&runtime.mmap, &runtime.index)` returns (and after the existing `has_timestamp_format` DB write), set `runtime.index.write().unwrap().timestamp_detection_complete = true` — unconditionally, regardless of whether a format was detected (research.md §2.2).

- [X] T026 [US2] In `src-tauri/src/commands/files.rs`'s `file_properties`, redefine `indexing_complete` from `index.state == IndexState::Ready` to `index.state == IndexState::Ready && index.timestamp_detection_complete` (contracts/file-properties-and-timezone.md §1). Keep the existing gating of `first_timestamp`/`last_timestamp` on `entry.has_timestamp_format && indexing_complete` (now using the redefined value).

- [X] T027 [US2] In `src/pages/WorkspacePage.tsx`, change `hasTimestampFormat`'s source from `files.find((file) => file.alias === selectedAlias)?.has_timestamp_format ?? false` (from `useActiveWorkspace()`) to `fileProperties?.has_timestamp_format ?? false` (from the existing `useFileProperties(selectedAlias)` call already used for `firstTimestamp`/`lastTimestamp`) (contracts/file-properties-and-timezone.md §2).

**Checkpoint**: Run `cd src-tauri && cargo test --test files_test && cargo clippy -- -D warnings && cargo fmt --check` and `npx vitest run src/pages/WorkspacePage.test.tsx`. Then manually verify quickstart.md's "User Story 2" steps 1-5. US1 + US2 are both independently functional.

---

## Phase 5: User Story 3 - Time range reflects the log's own timezone (Priority: P3)

**Goal**: The "From"/"To" fields display and accept values in the file's detected log-timestamp timezone (an explicit UTC offset, or UTC for naive formats) instead of the browser's local timezone.

**Independent Test**: Open a file whose timestamps carry an explicit UTC offset different from the browser's local timezone; confirm the pre-filled "From"/"To" values (and the picker's calendar/hour/minute) match the wall-clock time printed in the log lines, and that a typed value equal to a visible line's timestamp includes that line at the boundary. A file with naive (no-offset) timestamps shows/accepts values in UTC. A file without a detected format shows no time range fields at all.

### Tests for User Story 3 (MANDATORY — write first, confirm they fail) ⚠️

- [X] T028 [P] [US3] In `src-tauri/src/logfile/offset.rs` (new file, `#[cfg(test)] mod tests`), write unit tests for the not-yet-implemented `detect_utc_offset_minutes` (data-model.md §5, research.md §3.2): returns the first sampled line's explicit offset in minutes for `Iso8601` samples with an explicit offset (e.g. `+02:00` → `120`, `-05:00` → `-300`), and `0` for naive ISO-8601/epoch/space-separated samples or when no sampled line has an explicit offset. Add an `unimplemented!()` stub so the file compiles but tests fail.

- [X] T029 [P] [US3] In `src-tauri/tests/files_test.rs`, add a case: for a file whose sampled lines are `Iso8601` with an explicit UTC offset (e.g. `+02:00`), `file_properties`'s `timestamp_offset_minutes` equals that offset in minutes (e.g. `120`); for a file with naive/epoch/space-separated timestamps, `timestamp_offset_minutes` is `0`.

- [X] T030 [P] [US3] In `src/lib/timeRange.test.ts`, replace the `formatLocal`/`parseLocal`/`combine` tests with tests for `formatInOffset(epochMs, offsetMinutes)`, `parseInOffset(text, offsetMinutes)`, and `combineInOffset(date, hour, minute, offsetMinutes)` (contracts/file-properties-and-timezone.md §3): round-trip `parseInOffset(formatInOffset(epochMs, offsetMinutes), offsetMinutes) === epochMs` for `offsetMinutes = 0` (asserting **UTC**, not the test runner's local `TZ`) and for a non-zero offset (e.g. `+120`, `-300`).

- [X] T031 [P] [US3] In `src/components/TimeRangeField.test.tsx`, update tests for the new required `offsetMinutes: number` prop (contracts/file-properties-and-timezone.md §4): the displayed text and the picker's calendar day/hour/minute both show the wall-clock value of `value` in `UTC+offsetMinutes`, regardless of the test environment's `TZ`, for both `offsetMinutes = 0` and a non-zero offset.

- [X] T032 [P] [US3] In `src/components/LogViewToolbar.test.tsx`, update tests asserting both `TimeRangeField` instances receive `offsetMinutes={fileProperties?.timestamp_offset_minutes ?? 0}` from the existing `useFileProperties(alias)` mock (contracts/file-properties-and-timezone.md §5).

- [X] T033 [US3] In `src/components/TimeRangeFilterPipeline.test.tsx`, update the existing "Time range filter pipeline (US1)" test for offset-aware parsing: with `useFileProperties` mocked to return `timestamp_offset_minutes: 0` (UTC), change the typed `"2026-06-12 10:00"`/`"2026-06-12 10:30"` values' expected `timeFrom`/`timeTo` in the `search` invoke payload from `new Date(2026, 5, 12, 10, 0).getTime()` (local) to `Date.UTC(2026, 5, 12, 10, 0)` (UTC, per `parseInOffset(..., 0)`'s new UTC behavior, FR-008 Scenario 2).

### Implementation for User Story 3

- [X] T034 [US3] Create `src-tauri/src/logfile/offset.rs` implementing `pub fn detect_utc_offset_minutes(sample: &[String]) -> i32` (data-model.md §5, research.md §3.2): returns the first sampled line whose leading token parses via `chrono::DateTime::parse_from_rfc3339` with an explicit offset → `offset().local_minus_utc() / 60`; else `0`. Add `pub mod offset;` to `src-tauri/src/logfile/mod.rs`. Make the T028 tests pass; run `cargo test logfile::offset`.

- [X] T035 [US3] In `src-tauri/src/logfile/timestamp.rs`'s `detect_and_parse`, when `profile.format == TimestampFormat::Iso8601`, call `offset::detect_utc_offset_minutes(&sample)` and store the result in `guard.utc_offset_minutes` (leave it at its default `0` for other formats). Import `crate::logfile::offset`.

- [X] T036 [US3] In `src-tauri/src/commands/types.rs`, add `pub timestamp_offset_minutes: i32` to `FileProperties` (data-model.md §6, contracts/file-properties-and-timezone.md §1).

- [X] T037 [US3] In `src-tauri/src/commands/files.rs`'s `file_properties`, populate `timestamp_offset_minutes` from `index.utc_offset_minutes` when the file is loaded (i.e. in the `Some(runtime)` branch alongside `total_lines`/`first_timestamp`/`last_timestamp`), else `0` (the `None` branch).

- [X] T038 [US3] Regenerate TS bindings: `cd src-tauri && cargo test --test export_bindings`. Confirm `src/bindings/index.ts`'s `FileProperties` now includes `timestamp_offset_minutes: number`.

- [X] T039 [US3] Rewrite `src/lib/timeRange.ts` (contracts/file-properties-and-timezone.md §3, research.md §3.3): remove `formatLocal`/`parseLocal`/`combine`; add `formatInOffset(epochMs: number, offsetMinutes: number): string` (read Y/M/D/H/M via `new Date(epochMs + offsetMinutes * 60_000)`'s **UTC** getters), `parseInOffset(text: string, offsetMinutes: number): number | null` (parse `YYYY-MM-DD HH:mm` via the same regex/round-trip validation as the old `parseLocal`, then `epochMs = Date.UTC(y, m-1, d, h, min) - offsetMinutes * 60_000`), and `combineInOffset(date: Date, hour: number, minute: number, offsetMinutes: number): number` (read `date`'s **local** Y/M/D, combine with `hour`/`minute` via `Date.UTC(...) - offsetMinutes * 60_000`). `pad` is unchanged.

- [X] T040 [US3] Update `src/components/TimeRangeField.tsx` (contracts/file-properties-and-timezone.md §4, research.md §3.3): add required prop `offsetMinutes: number`; replace all `formatLocal`/`parseLocal`/`combine` calls with `formatInOffset`/`parseInOffset`/`combineInOffset(..., offsetMinutes)`; seed `pickerDate`/`pickerHour`/`pickerMinute` via `new Date(year, month, day, hour, minute)` using the Y/M/D/H/M read from `formatInOffset(value, offsetMinutes)`'s UTC-getter computation (the "wall-clock fields" picker trick), so `DayPicker`/the hour/minute `<input>`s (which use local getters) display the offset-adjusted wall-clock value regardless of the browser's `TZ`.

- [X] T041 [US3] In `src/components/LogViewToolbar.tsx`, pass `offsetMinutes={fileProperties?.timestamp_offset_minutes ?? 0}` (from the existing `useFileProperties(alias)` call) to both `TimeRangeField` ("From" and "To") instances.

**Checkpoint**: Run `cd src-tauri && cargo test logfile::offset --test files_test && cargo clippy -- -D warnings && cargo fmt --check` and `npx tsc --noEmit && npx eslint . && npx vitest run src/lib/timeRange.test.ts src/components/TimeRangeField.test.tsx src/components/LogViewToolbar.test.tsx src/components/TimeRangeFilterPipeline.test.tsx`. Then manually verify quickstart.md's "User Story 3" steps 1-7. All three user stories are now independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T042 Run the full quickstart.md "Automated" validation from the repo root: `npx tsc --noEmit && npx eslint . && npx vitest run` (full suite) and `cd src-tauri && cargo test && cargo clippy -- -D warnings && cargo fmt --check`. Confirm `src-tauri/src/logfile/timestamp.rs` is the only file newly over the 300-line Rust guideline (Complexity Tracking in plan.md — pre-existing, marginally increased, not a new violation) and that `src-tauri/src/commands/viewing.rs` stays within its ~210-line estimate (plan.md "File-size management").

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run first.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories (T002/T003 touch shared structs every story's tests construct).
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational. Independent of US1/US3 (touches `files.rs`'s `file_properties`/`index_and_detect_timestamps` and `WorkspacePage.tsx`, distinct functions/lines from US1's and US3's edits to the same files).
- **User Story 3 (Phase 5)**: Depends on Foundational. Independent of US1/US2 (touches `timestamp.rs`/`types.rs`/`files.rs` in different functions/fields than US1/US2, and `timeRange.ts`/`TimeRangeField.tsx`/`LogViewToolbar.tsx` which US1/US2 don't touch).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests (marked "MANDATORY") are written first and confirmed to fail (or fail to compile against the new signatures) before implementation tasks begin.
- US1: T010 (view_filter.rs) before T011 (timestamp.rs uses it) and before T014 (viewing.rs uses it); T013 (LineBatch DTO) before T014 (stream_lines emits it); T014/T015 before T018 (bindings regen); T018 before T019-T021 (frontend consumes regenerated types); T019 before T020 (useLogStream uses the new `setViewTimeRange` wrapper); T020 before T021 (LogViewer uses the new hook signature); T021 before T022 (WorkspacePage passes the prop LogViewer now requires).
- US2: T025 before T026 (same function's two edits in `files.rs`, sequential); T026 before T027 (frontend consumes the corrected `indexing_complete`/`has_timestamp_format` semantics).
- US3: T034 before T035 (timestamp.rs calls the new offset module); T035 before T037 (file_properties reads `index.utc_offset_minutes`); T036 before T037 (DTO field exists before it's populated); T037 before T038 (bindings regen reflects the new field); T038 before T039-T041 (frontend consumes `timestamp_offset_minutes`); T039 before T040 (TimeRangeField uses the new timeRange functions); T040 before T041 (LogViewToolbar passes the prop TimeRangeField now requires); T040/T041 before T033 (pipeline test reflects the new offset-aware behavior).

### Parallel Opportunities

- T023 and T024 (US2 tests, different files/languages) can run in parallel.
- T028, T029, T030, T031, T032 (US3 tests, all different files) can run in parallel; T033 depends on the US3 implementation tasks so runs after.
- T004, T006, T007, T008, T009 (US1 tests, all different files) can run in parallel with each other.
- Once Foundational (T002-T003) is complete, US2 (Phase 4) and US3 (Phase 5) have no file overlap with each other and could be staffed in parallel; both are independent of US1 but, per priority order, US1 should be completed first for the MVP.

---

## Parallel Example: User Story 1 tests

```bash
# Different files — can be written in parallel before any US1 implementation:
# T004: src-tauri/src/logfile/view_filter.rs (new, with #[cfg(test)] mod tests)
# T006: src-tauri/tests/search_test.rs
# T007: src-tauri/tests/mcp_tools_test.rs
# T008: src/hooks/useLogStream.test.ts
# T009: src/components/LogViewer.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) — required for everything.
2. Phase 3 (US1) — this alone fixes the headline "nothing happens when I change the range" complaint.
3. **STOP and VALIDATE**: run US1's checkpoint commands and the quickstart.md US1 manual steps.
4. This is independently demoable: the time range filter now restricts the main log view.

### Incremental Delivery

1. Setup + Foundational → compiles, no behavior change yet.
2. Add US1 → main view filtering works (MVP).
3. Add US2 → time range fields no longer require a restart to appear.
4. Add US3 → time range fields use the log's own timezone instead of the browser's.
5. Polish → full quickstart validation across all three stories together.

Each story is additive and does not regress the previous one: US2 only changes *when* `hasTimestampFormat`/`TimeRangeField`s become visible (not US1's filtering logic), and US3 only changes *how* the fields format/parse values (not US1's filtering logic or US2's visibility timing).
