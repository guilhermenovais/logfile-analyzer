# Phase 0 Research: Time Range Filter Fixes

## 1. Localizing the US1 "filter has no effect" defect (FR-001–FR-003)

- **Findings so far** (static analysis + existing test runs, all passing):
  - `logfile::query::filter_by_time_range` and its unit tests
    (`src-tauri/src/logfile/query.rs`) correctly apply inclusive
    `[time_from, time_to]` bounds and are a no-op when both are `None`.
  - `commands::search`/`commands::search_with_context`
    (`src-tauri/src/commands/search.rs`) call `filter_by_time_range` when
    either bound is set, and `tests/search_test.rs::
    search_time_range_filters_matches_by_timestamp` /
    `search_with_context_time_range_filters_matches_by_timestamp` pass.
  - `SearchBar.handleSubmit` passes `hasTimestampFormat ? timeFrom : null`
    (etc.) from `useSearchUiStore` into `useSearch().runSearch`, which calls
    the `search` IPC wrapper with those values — verified directly with a
    scratch Vitest case (`hasTimestampFormat=true`, store pre-seeded via
    `setTimeRange`, asserting `runSearch` receives the non-null bounds).
  - `LogViewToolbar`'s `TimeRangeField` `onChange` handlers call
    `useSearchUiStore.getState().setTimeRange(alias, ...)` correctly.
- **Gap identified**: every test above either (a) hand-builds a `FileIndex`
  with `timestamp_profile`/`line_timestamps` already populated
  (`search_test.rs`), bypassing the real `add_file` →
  `index_and_detect_timestamps` (`spawn_blocking`) background-detection path,
  or (b) mocks `useSearch`/`commands.search` at the React layer, never
  reaching the actual `invoke("search", {...})` payload. **No test exercises
  the real desktop pipeline end-to-end**: add a file, let background
  detection populate `timestamp_profile`/`line_timestamps`, let the UI
  pre-fill/let the user set a time range via `LogViewToolbar`, then run
  `search` and confirm the *Rust* result set is actually narrowed.
- **Decision**: Phase 0 adds two new failing-first tests that close this gap,
  per Principle IV:
  1. **Backend** (`src-tauri/tests/search_test.rs`): a new case that calls the
     real `add_file` command, polls `get_file_properties` until
     `indexing_complete && has_timestamp_format`, then calls `search` with
     `time_from`/`time_to` derived from `get_file_properties`'
     `first_timestamp`/`last_timestamp` narrowed to a sub-range — and asserts
     the returned matches are narrowed accordingly (FR-001/FR-002), and that
     using the *unmodified* `first_timestamp`/`last_timestamp` as
     `time_from`/`time_to` returns the same matches as no time filter at all
     (FR-003).
  2. **Frontend**: a test that renders `LogViewToolbar` + `SearchBar` together
     against a real (non-mocked) `useSearchUiStore`, with only
     `@tauri-apps/api/core`'s `invoke` mocked (via `@tauri-apps/api/mocks`'
     `mockIPC`, the same mechanism `WorkspacePage.test.tsx` already uses for
     its IPC-backed hooks) — set a time range via the toolbar's
     `TimeRangeField`s, submit a search, and assert the captured
     `invoke("search", {...})` payload's `timeFrom`/`timeTo` match.
- **Fix scope**: whichever of these two tests fails first identifies whether
  the defect is in `commands::search`'s interaction with `FileRuntime`/
  `FileIndex` populated via the real background-detection path, or in the
  React wiring once it's driven through `invoke` rather than mocked
  `useSearch`. The fix is then scoped to that single location — no
  speculative changes to the other side.
- **Alternatives considered**: rewriting `filter_by_time_range` or
  `commands::search` "defensively" without a reproducing test — rejected,
  Principle IV requires the failing test first, and without one any change
  risks fixing a symptom that isn't the actual reported defect.

## 2. Picker confirm/commit model (FR-004–FR-008, US2)

- **Decision**: `TimeRangeField`'s popover keeps its existing local state
  (`pickerHour`, `pickerMinute`) and adds `pickerDate: Date | undefined`. Day
  selection (`onSelect`), hour change, and minute change all update only this
  in-progress local state — **no `onChange` call, no `setOpen(false)`**
  (FR-004/FR-005). A single `closeAndCommit()` function computes
  `combine(pickerDate ?? seedDate, pickerHour, pickerMinute)`, calls
  `onChange` with it, and sets `open = false`; it is invoked from:
  - a new "Confirm" `<button>` in the popover footer (FR-006), and
  - `Popover.Root`'s `onOpenChange` callback, when `open` transitions from
    `true` to `false` for *any* reason — including Radix's built-in
    outside-click/Escape dismissal (FR-007).
  When the popover *opens* (`open` transitions `false` → `true`), `pickerDate`/
  `pickerHour`/`pickerMinute` are (re-)seeded from the current `value`, so a
  reopened picker starts from the committed value, not a stale in-progress
  one.
- **Rationale**: a single commit path (`closeAndCommit`) covers both FR-006
  and FR-007 identically, satisfying Acceptance Scenario 4 ("clicking outside
  ... same result as activating the confirm control"). Seeding on open (not
  just on mount/value-change) makes Scenario 5 ("nothing changed → value
  unchanged") hold trivially: `combine(seedDate, seedHour, seedMinute) ===
  value` when nothing was touched, since `value` itself was always produced by
  `combine`/`parseLocal` (seconds/ms already zeroed).
- **Outside-interaction-as-commit for a second picker** (Edge Cases: opening
  the "To" picker while "From"'s is open and uncommitted): Radix's
  `Popover.Root` dismiss layer treats a pointer-down on another popover's
  trigger as "outside" the first popover, so `onOpenChange(false)` fires for
  "From" before "To" opens — `closeAndCommit()` runs for "From" with no extra
  wiring needed. Verified against `@radix-ui/react-popover`'s documented
  dismiss-layer behavior (already relied upon for the existing
  outside-click-closes-popover behavior in 008).
- **Alternatives considered**:
  - Committing on every keystroke/change as today, just without closing —
    rejected: FR-008/Scenario 3 require the commit to be a single action tied
    to confirm/outside-interaction, not continuous.
  - A hand-rolled `document` click listener for "outside" detection —
    rejected, duplicates Radix's existing dismiss layer (Principle V).

## 3. "Clear" resets to file time span (FR-009/FR-010, US3)

- **Decision**: `LogViewToolbar` calls `useFileProperties(alias)` (already
  used by `WorkspacePage` for the FR-011 pre-fill, 008) to read
  `first_timestamp`/`last_timestamp`, and the "Clear" button calls
  `useSearchUiStore.getState().setTimeRange(alias, firstTimestamp ?? null,
  lastTimestamp ?? null)` instead of `setTimeRange(alias, null, null)`.
- **Rationale**: `first_timestamp`/`last_timestamp` are exactly "the file's
  first and last line timestamps" (FR-009's wording), already computed
  server-side from the same `line_timestamps` Vec that backs the FR-011
  pre-fill and the US1 filter — using them for Clear guarantees Clear's result
  is identical to the FR-011 pre-fill state (Acceptance Scenario 2: "fields
  already show the default span → no visible change"). When
  `has_timestamp_format` is `false` or no line has a recognizable timestamp,
  both are `null` (existing `file_properties` behavior), so Clear naturally
  falls back to emptying the fields (Edge Cases bullet 1, FR-010) — no new
  branch needed.
- **`LogViewToolbar` already receives `alias`**: calling `useFileProperties`
  there (rather than prop-drilling `firstTimestamp`/`lastTimestamp` from
  `WorkspacePage`, which already calls the same hook for the same `alias`)
  duplicates one TanStack Query call per toolbar render, but TanStack Query
  dedupes identical in-flight/cached queries by key — no extra IPC traffic,
  and avoids adding two more props to `LogViewToolbarProps` purely to thread
  values the toolbar can fetch itself.
- **Alternatives considered**: a new `defaultTimeFrom`/`defaultTimeTo` prop on
  `LogViewToolbar` populated by `WorkspacePage` — rejected as unnecessary
  prop-drilling once `useFileProperties(alias)` is confirmed to be cheap
  (cached) when called from two components for the same `alias`.

## 4. Keeping `TimeRangeField.tsx` under the 200-line guideline

- **Decision**: extract `pad`, `formatLocal`, `parseLocal`, and `combine`
  (currently lines 17–63 of `TimeRangeField.tsx`, pure functions with no
  component dependencies) into a new `src/lib/timeRange.ts`. `TimeRangeField`
  imports them; `formatLocal`/`parseLocal` keep their existing exported names
  and signatures (re-exported from `TimeRangeField.tsx` is **not** needed —
  `TimeRangeField.test.tsx` and any new `LogViewToolbar`/Clear test import
  them directly from `src/lib/timeRange.ts`).
- **Rationale**: `TimeRangeField.tsx` is already at the 200-line limit before
  US2's confirm-button/`pickerDate`/`closeAndCommit` additions. Moving ~45
  lines of pure, already-self-contained helpers out is the smallest change
  that brings the file back under the limit without restructuring the
  component itself (Principle III: "splitting by responsibility when
  exceeded" — formatting/parsing is a distinct responsibility from the
  controlled-component/picker logic).
- **Alternatives considered**: splitting the popover into its own
  `TimeRangePicker.tsx` subcomponent — viable but a larger structural change
  than the line-count overage warrants; revisit only if `TimeRangeField.tsx`
  is still over 200 lines after the helper extraction.
