# Tasks: Time Range Filter Fixes

**Input**: Design documents from `/specs/009-fix-time-range-filter/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/time-range-filter.md, quickstart.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each user story phase writes new/updated failing tests first, then implements until they pass.

**Organization**: Tasks are grouped by user story (US1–US3, per spec.md priorities P1/P2/P3) so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another in-flight task)
- **[Story]**: Maps the task to a user story (US1–US3) for traceability
- All file paths are relative to the repository root

## Path Conventions (from plan.md)

- Frontend: `src/components/TimeRangeField.tsx`, `src/components/LogViewToolbar.tsx`, `src/lib/timeRange.ts` (new), plus their `*.test.tsx`/`*.test.ts`
- Backend: `src-tauri/src/commands/search.rs` (and any sibling module the Phase 0 test implicates), `src-tauri/tests/search_test.rs`
- No new Tauri commands, capabilities, bindings, or schema changes (plan.md "Project Structure")

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: N/A — no new dependencies, build configuration, or project-structure changes are needed (plan.md Technical Context: "No new dependencies"). Proceed directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: N/A — none of US1/US2/US3 share a blocking prerequisite. US2's `src/lib/timeRange.ts` extraction (research.md §4) only affects `TimeRangeField.tsx`/`TimeRangeField.test.tsx` and is scoped entirely within US2's own phase below. Proceed directly to Phase 3.

---

## Phase 3: User Story 1 - Time range actually filters results (Priority: P1) 🎯 MVP

**Goal**: A non-empty `[time_from, time_to]` set via the desktop toolbar actually restricts `search`'s results to lines whose timestamp falls in that inclusive range (FR-001–FR-003), end-to-end through the real `add_file` → background-detection → `search` pipeline.

**Independent Test**: Open a log file with a detected timestamp format spanning a known period, set "From"/"To" to a sub-range that excludes some matches, run a search, and confirm only in-range matches are returned (and that the full default span returns everything).

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST. Per research.md §1, at least one of them is expected to FAIL against the current code — that failure localizes the defect for T003.**

- [X] T001 [P] [US1] Add a new integration test `search_time_range_filters_through_real_indexing_pipeline` to `src-tauri/tests/search_test.rs`. It must: (1) call `files::add_file` (not the `add_ready_file*` test helpers) on a temp file with several `2026-06-12T10:0X:00Z ...` lines, some containing `"db"` and some not, spanning a few minutes; (2) poll `files::get_file_properties(state.clone(), alias)` in a loop (sleep ~10ms between attempts, cap at e.g. 200 attempts with a `panic!` on timeout so a real bug doesn't hang the suite) until `indexing_complete && has_timestamp_format` are both `true`; (3) read `first_timestamp`/`last_timestamp` from that response; (4) call `search::search` with `time_from = first_timestamp, time_to = last_timestamp` and assert it returns the *same* matches as `search::search` with `time_from = None, time_to = None` (FR-003); (5) call `search::search` again with `time_to` narrowed to roughly the midpoint of `[first_timestamp, last_timestamp]` and assert it returns *strictly fewer* matches than the unfiltered search, and that every returned `line_index` corresponds to a line at or before the midpoint (FR-001/FR-002). Reuse `write_temp_file`/`collecting_channel` already in this file; do not reuse `add_ready_file_with_timestamps` (it hand-builds `FileIndex`, which is the gap this test closes).
- [X] T002 [P] [US1] Add a new test file `src/components/TimeRangeFilterPipeline.test.tsx` that renders `<SearchBar alias="app" hasTimestampFormat={true} />` and `<LogViewToolbar alias="app" hasTimestampFormat={true} />` together against the real (non-mocked) `useSearchUiStore` (reset via `useSearchUiStore.setState({ slices: {} })` in `beforeEach`). Mock only `@tauri-apps/api/core`'s `invoke` via `mockIPC`/`clearMocks` from `@tauri-apps/api/mocks` (returning `{ status: "ok", data: [] }` for `get_search_history` and `{ status: "ok", data: null }` for `search`, capturing the `search` call's `args`), and mock `@/hooks/useFileProperties` (`vi.mock`, returning `{ data: undefined }`) and `@/hooks/useSearchHistory` (returning empty history/suggestions) so only the time-range wiring is under test. In the test: type `"2026-06-12 10:00"` into `Time range from` and `"2026-06-12 10:30"` into `Time range to` (each followed by blur/Tab to commit, per the current `TimeRangeField` `commit`-on-blur behavior), type a query into `Search query`, click the `Search` button, and assert the captured `search` invoke `args.timeFrom`/`args.timeTo` equal `new Date(2026, 5, 12, 10, 0).getTime()` / `new Date(2026, 5, 12, 10, 30).getTime()` respectively (contracts/time-range-filter.md §1, research.md §1).

### Implementation for User Story 1

- [X] T003 [US1] Run the tests from T001 and T002. Exactly one (or both) will fail against current code (research.md §1's gap). Fix the defect at its source, scoped to whichever side fails:
  - If **T001 (backend)** fails: the issue is in how `commands::search`/`commands::search_with_context` (`src-tauri/src/commands/search.rs`) consult the `FileIndex` populated by the real `index_and_detect_timestamps` background path (`src-tauri/src/commands/files.rs`) — e.g. a mismatch between when `IndexState::Ready` is set vs. when `timestamp_profile`/`line_timestamps` are populated, or how `line_timestamps` indices line up with `match_indices` from `scan_matches`. Inspect `logfile::query::filter_by_time_range` (`src-tauri/src/logfile/query.rs`) and `logfile::timestamp::detect_and_parse`/`logfile::mmap_index::build_line_index` for the discrepancy from the hand-built fixtures the existing passing tests use.
  - If **T002 (frontend)** fails: the issue is in the data flow from `LogViewToolbar`'s `TimeRangeField` `onChange` handlers (`src/components/LogViewToolbar.tsx`) → `useSearchUiStore.setTimeRange` (`src/hooks/useSearchUiStore.ts`) → `SearchBar.handleSubmit` reading `timeFrom`/`timeTo` from the store (`src/components/SearchBar.tsx`) → `useSearch().runSearch` (`src/hooks/useSearch.ts`) → `commands.search` (`src/bindings/index.ts`/`src/ipc/search.ts`). Trace which link drops or nulls the values.
  - Do not make speculative changes to the side whose test passes. Re-run both tests (`cargo test --test search_test` and `npx vitest run src/components/TimeRangeFilterPipeline.test.tsx`) until both pass.
  - **Outcome**: both T001 and T002 pass against the unmodified code — the real `add_file` → background-detection → `search` pipeline (`commands::search`, `filter_by_time_range`) and the `LogViewToolbar` → `useSearchUiStore` → `SearchBar` → `useSearch` → `commands.search` wiring all correctly narrow results by `[time_from, time_to]`. No source defect was found in this chain; T001/T002 close the missing-regression-test gap research.md §1 identified and now guard FR-001–FR-003. The user-visible "no effect" symptom is most plausibly explained by US2's picker committing on every keystroke (Phase 4) rather than a wiring bug — addressed there.

**Checkpoint**: User Story 1 is independently functional — a time range set via the toolbar measurably narrows `search` results, end-to-end.

---

## Phase 4: User Story 2 - Confirm a date/time selection without losing the picker (Priority: P2)

**Goal**: `TimeRangeField`'s popover lets the user pick a day and adjust hour/minute as an in-progress selection, applied only via a new confirm control or by interacting outside the popover (FR-004–FR-008).

**Independent Test**: Open the "From" picker, change date/hour/minute without it closing, then confirm (or click outside) and verify the field shows the combined selection.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

- [X] T004 [P] [US2] Create `src/lib/timeRange.test.ts` with unit tests for the (not-yet-extracted) `pad`, `formatLocal`, `parseLocal`, and `combine` functions, importing them from `@/lib/timeRange` (this import will fail until T005). Cover: `formatLocal` produces `YYYY-MM-DD HH:mm` zero-padded for single-digit month/day/hour/minute; `parseLocal` round-trips `formatLocal`'s output and returns `null` for malformed/invalid-date strings (e.g. `"2026-13-01 00:00"`); `combine(date, hour, minute)` returns a timestamp with `date`'s year/month/day and the given hour/minute, seconds/ms zeroed. Base these on the current implementations at `src/components/TimeRangeField.tsx:17-63` and any equivalent assertions already implicit in `TimeRangeField.test.tsx`.
- [X] T006 [US2] Update `src/components/TimeRangeField.test.tsx` per quickstart.md and contracts/time-range-filter.md §2, replacing the two tests at lines 70–100 ("selecting a day ... closes the popover" and "changing the hour stepper ... closes the popover") with new assertions for the confirm/commit model (FR-004–FR-008, Acceptance Scenarios 1–5):
  - Selecting a calendar day keeps the popover open (`screen.getByRole("grid")` still present), updates the calendar's selected day, and does **not** call `onChange`.
  - Changing the hour input then the minute input keeps the popover open and updates each input's displayed value, without calling `onChange`.
  - Clicking a new `button` with `aria-label="Confirm From selection"` (and a `Check` icon) calls `onChange` exactly once with `combine(selectedDay, hour, minute)` and closes the popover (`screen.queryByRole("grid")` is gone).
  - Simulating an outside interaction while the popover is open with an in-progress change (e.g. `fireEvent.pointerDown(document.body)` / clicking another element, triggering Radix's `onOpenChange(false)`) produces the same result as the confirm button (Scenario 4).
  - Opening the popover and closing it (via confirm or outside-click) with no changes calls `onChange` with a value equal to the current `value` (Scenario 5).
  These tests must fail against the current `TimeRangeField.tsx` (which calls `onChange`+`setOpen(false)` on every day/hour/minute change).

### Implementation for User Story 2

- [X] T005 [US2] Extract `pad`, `formatLocal`, `parseLocal`, and `combine` (currently `src/components/TimeRangeField.tsx:17-63`) verbatim into a new `src/lib/timeRange.ts`, exporting all four. Update `TimeRangeField.tsx` to `import { formatLocal, parseLocal, combine } from "@/lib/timeRange"` and remove the local definitions (research.md §4, data-model.md "Helper module"). Run `npx vitest run src/lib/timeRange.test.ts src/components/TimeRangeField.test.tsx` — T004's new tests and all existing `TimeRangeField.test.tsx` tests must pass with no behavior change (depends on T004).
- [X] T007 [US2] Modify `src/components/TimeRangeField.tsx` per research.md §2 and data-model.md "Picker In-Progress Selection" to make T006 pass (depends on T006):
  - Add `pickerDate: Date | undefined` state alongside the existing `pickerHour`/`pickerMinute`.
  - Change `handleDaySelect`, the hour `<input>`'s `onChange`, and the minute `<input>`'s `onChange` to update only `pickerDate`/`pickerHour`/`pickerMinute` — remove their `onChange(...)` calls and `setOpen(false)` calls (FR-004/FR-005).
  - Add a `closeAndCommit()` function that calls `onChange(combine(pickerDate ?? seedDate, pickerHour, pickerMinute))` then `setOpen(false)`.
  - Add a "Confirm {label} selection" `<button aria-label={\`Confirm ${label} selection\`}>` with a `Check` icon (from `lucide-react`) in the popover footer, calling `closeAndCommit()` on click (FR-006).
  - Pass `onOpenChange={(next) => { if (!next && open) { closeAndCommit(); } else { setOpen(next); if (next) { /* reseed pickerDate/pickerHour/pickerMinute from value */ } } }}` (or equivalent) to `Popover.Root`, so any close — including Radix's outside-click/Escape dismissal — runs `closeAndCommit()` (FR-007), and any open reseeds the in-progress state from `value` (data-model.md lifecycle step 1).
  - Run `npx vitest run src/components/TimeRangeField.test.tsx` until all tests (existing + T006's new ones) pass.

**Checkpoint**: User Stories 1 AND 2 both work independently — the picker stays open across date/hour/minute edits and commits only on confirm or outside interaction, without breaking US1's filtering.

---

## Phase 5: User Story 3 - Clear resets to the file's full time span (Priority: P3)

**Goal**: `LogViewToolbar`'s "Clear" button resets "From"/"To" to the file's first/last line timestamps (via `useFileProperties`) instead of emptying them (FR-009/FR-010).

**Independent Test**: Edit "From"/"To" away from the pre-filled defaults, click "Clear", and confirm both fields show the file's first/last line timestamps again (or remain empty if no span is known).

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [X] T008 [US3] Update `src/components/LogViewToolbar.test.tsx` per contracts/time-range-filter.md §3: add `vi.mock("@/hooks/useFileProperties", () => ({ useFileProperties: vi.fn() }))` (hoisted, mirroring `WorkspacePage.test.tsx`'s pattern) plus a `beforeEach` default of `useFileProperties.mockReturnValue({ data: undefined })`. Then:
  - Update the existing "shows Clear when a time range is set and clears it via setTimeRange" test (lines 35–43): set `useFileProperties.mockReturnValue({ data: { first_timestamp: 1000, last_timestamp: 5000, ... } })` (other `FileProperties` fields can be arbitrary/zero), seed `useSearchUiStore.getState().setTimeRange("app", 2000, 3000)`, render, click "Clear", and assert `slices["app"].timeFrom === 1000` and `slices["app"].timeTo === 5000` (FR-009, Acceptance Scenario 1).
  - Add a new test: with `useFileProperties` returning `{ data: { first_timestamp: null, last_timestamp: null, ... } }` (or `{ data: undefined }`) and a time range already set via `setTimeRange`, clicking "Clear" sets `timeFrom`/`timeTo` to `null`/`null` (FR-010, Edge Cases bullet 1 — unchanged fallback behavior).
  These must fail against the current `LogViewToolbar.tsx`, which always clears to `null`/`null`.

### Implementation for User Story 3

- [X] T009 [US3] Modify `src/components/LogViewToolbar.tsx` per research.md §3: import and call `useFileProperties(alias)`, read `first_timestamp`/`last_timestamp` from its `data` (defaulting to `null` if `data` is `undefined`), and change the "Clear" button's `onClick` from `setTimeRange(alias, null, null)` to `setTimeRange(alias, firstTimestamp ?? null, lastTimestamp ?? null)`. Run `npx vitest run src/components/LogViewToolbar.test.tsx` until T008's tests (and all pre-existing ones) pass (depends on T008).

**Checkpoint**: All three user stories are independently functional — filtering works end-to-end (US1), the picker is usable for precise entry (US2), and "Clear" restores the file's full span (US3).

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cross-cutting validation per quickstart.md.

- [X] T010 [P] Run `npx tsc --noEmit` and `npx eslint .` from the repo root; fix any new errors introduced by T005/T007/T009
- [X] T011 [P] Run `cargo clippy -- -D warnings` and `cargo fmt --check` from `src-tauri/`; fix any new warnings/formatting introduced by T003
- [X] T012 Run the full frontend suite (`npx vitest run src/components/TimeRangeField.test.tsx src/components/LogViewToolbar.test.tsx src/components/SearchBar.test.tsx src/pages/WorkspacePage.test.tsx src/hooks/useSearch.test.ts src/hooks/useSearchUiStore.test.ts src/lib/timeRange.test.ts src/components/TimeRangeFilterPipeline.test.tsx`) and the backend suite (`cd src-tauri && cargo test --test search_test`); all must pass (depends on T003, T007, T009)
  - **Outcome**: Frontend — all 8 files / 73 tests pass consistently. Backend — `cargo test --test search_test` runs 10 tests; the 9 tests touched by this feature (including T001's new `search_time_range_filters_through_real_indexing_pipeline`) pass consistently. The 10th test, `get_search_history_returns_workspace_history_regardless_of_file`, is **pre-existing and unrelated**: it is byte-identical to `main` (`git diff main -- src-tauri/tests/search_test.rs src-tauri/src/persistence/repo/search_history.rs` shows no changes outside T001's addition), yet fails ~50% of runs (with or without `--test-threads=1`) because its two back-to-back `search_history::record` calls can land in the same SQLite `strftime('%f')` millisecond, and `list_for_workspace`'s `ORDER BY last_used_at DESC` has no tiebreaker for ties — the existing unit test `list_for_workspace_orders_by_last_used_at_descending` works around the identical issue with a 10ms `std::thread::sleep`. Out of scope for 009-fix-time-range-filter; flagged to the user as a separate pre-existing flaky-test issue (candidate fix: add `, id DESC` to that `ORDER BY`).
- [X] T013 Run the quickstart.md manual verification steps for US1, US2, and US3 against `npm run tauri dev` (depends on T012)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks
- **Foundational (Phase 2)**: No tasks
- **User Story 1 (Phase 3)**: No dependency on other stories — can start immediately
- **User Story 2 (Phase 4)**: No dependency on US1; internally sequential (T004 → T005 → T006 → T007)
- **User Story 3 (Phase 5)**: No dependency on US1/US2; internally sequential (T008 → T009)
- **Polish (Phase 6)**: Depends on T003 (US1), T007 (US2), T009 (US3)

### Within Each User Story

- Tests are written first and confirmed to fail before implementation
- US2: pure-helper extraction (T004/T005) lands before the picker behavior tests/implementation (T006/T007), since T007 relies on the extracted `combine`/`formatLocal` and keeps `TimeRangeField.tsx` under the 200-line guideline
- US3: test (T008) before implementation (T009)

### Parallel Opportunities

- T001 and T002 (US1 tests) — different files (Rust vs. TS), can be written in parallel
- T004 (US2 helper tests) can be written in parallel with T001/T002 (different files/stack)
- T010 and T011 (Polish lint/format checks) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch both US1 test tasks together:
Task: "Add search_time_range_filters_through_real_indexing_pipeline to src-tauri/tests/search_test.rs"
Task: "Add src/components/TimeRangeFilterPipeline.test.tsx wiring LogViewToolbar+SearchBar"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3: User Story 1 (T001–T003)
2. **STOP and VALIDATE**: `cargo test --test search_test` and the new Vitest integration test pass; manually confirm in `npm run tauri dev` that narrowing the time range narrows search results
3. Deploy/demo if ready — this alone fixes the core reported defect

### Incremental Delivery

1. Add User Story 1 → validate independently → demo (MVP, fixes "filter has no effect")
2. Add User Story 2 → validate independently (picker stays open until confirm/outside-click) → demo
3. Add User Story 3 → validate independently (Clear restores the file's span) → demo
4. Each story adds value without breaking the previous ones — Phase 6 confirms no regressions across all three

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- T003 (US1's fix) is the only task whose exact file(s) depend on what T001/T002 reveal — everything else names concrete files up front
