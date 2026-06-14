# Tasks: Streamlined Log Viewer Header

**Input**: Design documents from `/specs/008-improve-log-view-header/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/file-properties.md, quickstart.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each task that touches a testable unit adds/updates its Vitest+RTL or `cargo test` cases first, confirmed failing, before the corresponding implementation task.

**Organization**: Tasks are grouped by user story (US1–US4, per spec.md priorities P1/P1/P1/P2). Because `LogViewToolbar` (US1) is the component that *composes* `TimeRangeField` (US3) per plan.md's Project Structure and data-model.md's component contracts, **Phase 3 implements US3 before US1** — see "User Story Dependencies" below for the full rationale. Phase numbers therefore do not match spec.md's US1→US4 listing order, but every task is still labeled with its owning story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another task in flight)
- **[Story]**: Maps the task to a user story (US1–US4) for traceability
- All file paths are relative to the repository root

## Path Conventions (from plan.md)

- Frontend: `src/components/`, `src/hooks/`, `src/pages/`, `src/bindings/index.ts`
- Backend: `src-tauri/src/commands/{types,files}.rs`, `src-tauri/tests/files_test.rs`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the two new frontend dependencies research.md selected for `TimeRangeField` (US3).

- [X] T001 Run `npm install @radix-ui/react-popover@^1.1.16 react-day-picker@^10` at the repository root, then confirm `package.json`/`package-lock.json` list both under `dependencies` (research.md §2/§3 — same `@radix-ui/react-*` version line as `@radix-ui/react-dialog`, no `date-fns` peer dependency pulled in by `react-day-picker@^10`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the shared per-alias view-state store (`useLogViewToolbarStore`) that both US1 (`highlightedOnly`, `wrap`) and US2 (`highlightsVisible`) read/write, mirroring `useLineSelectionStore`'s pattern (data-model.md §"Frontend-only state").

**⚠️ CRITICAL**: US1 and US2 cannot be implemented until this phase is complete. (US3 and US4 do not depend on it and could in principle proceed in parallel with this phase, but are sequenced after it below for clarity.)

- [X] T002 [P] In `src/hooks/useLogViewToolbarStore.test.ts` (new), write failing tests mirroring `src/hooks/useLineSelectionStore.test.ts`'s structure: (1) an alias never touched returns the defaults `{ highlightedOnly: false, highlightsVisible: false, wrap: false }`; (2) `setHighlightedOnly(alias, true)` updates only that alias's `highlightedOnly`, leaving `highlightsVisible`/`wrap` and other aliases' slices untouched; (3) `toggleHighlightsVisible(alias)` flips `highlightsVisible` from `false`→`true`→`false` without changing `highlightedOnly` or `wrap` (FR-005); (4) `setWrap(alias, true)` updates only that alias's `wrap`; (5) a non-reactive `getLogViewToolbarSlice(alias)` helper (mirroring `getLineSelectionSlice`) returns the same defaults for an unseen alias

- [X] T003 Implement `src/hooks/useLogViewToolbarStore.ts` (new) per data-model.md "`useLogViewToolbarStore` (NEW Zustand store)": a Zustand store with `slices: Record<string, LogViewToolbarState>` where `LogViewToolbarState = { highlightedOnly: boolean; highlightsVisible: boolean; wrap: boolean }`, `DEFAULT_LOG_VIEW_TOOLBAR_STATE = { highlightedOnly: false, highlightsVisible: false, wrap: false }`, actions `setHighlightedOnly(alias, value)`, `toggleHighlightsVisible(alias)`, `setWrap(alias, value)`, and an exported non-reactive `getLogViewToolbarSlice(alias)` helper — follow `src/hooks/useLineSelectionStore.ts`'s `getSlice`/`set`/export shape exactly (depends on T002)

**Checkpoint**: `useLogViewToolbarStore` exists and is tested — US1 and US2 implementation can now begin.

---

## Phase 3: User Story 3 - Type a precise time range (Priority: P1)

**Goal**: Replace the broken `<input type="datetime-local">` time-range fields with a `TimeRangeField` component that accepts fully-typed `YYYY-MM-DD HH:mm` input (FR-007), offers a calendar+hour/minute popover that closes itself on selection (FR-008/FR-009), and marks invalid typed input without discarding the last committed value (FR-010).

**Independent Test**: Render `TimeRangeField` standalone with a known `value`/`onChange`. Type a full date+time via keyboard and confirm `onChange` fires with the parsed epoch-ms on blur/Enter; type an invalid value and confirm `aria-invalid="true"` is set and `onChange` is not called; open the picker, pick a day and a time, and confirm the popover closes and `onChange` fires with the combined value.

> **Why this phase comes before US1**: `LogViewToolbar` (US1, Phase 4) renders two `TimeRangeField` instances as part of FR-001's combined row. Building `TimeRangeField` as a standalone, independently-testable component first lets Phase 4 compose it without forward references.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation (T005)**

- [X] T004 [P] [US3] In `src/components/TimeRangeField.test.tsx` (new), write failing tests for the `TimeRangeFieldProps` interface from data-model.md (`label: "From" | "To"`, `value: number | null`, `onChange: (value: number | null) => void`, `disabled?: boolean`):
  1. Renders a text `<input>` with `aria-label="Time range from"` (or `"Time range to"` for `label="To"`), pre-filled via the `YYYY-MM-DD HH:mm` formatter when `value` is non-null, and empty when `value` is `null` (FR-007)
  2. Typing a full `YYYY-MM-DD HH:mm` value and blurring (or pressing Enter) calls `onChange` with the corresponding epoch-ms and does not set `aria-invalid` (FR-007/FR-013)
  3. Typing an unparseable value (e.g. `"not-a-date"`) and blurring sets `aria-invalid="true"`, applies an invalid-state style (e.g. a `border-destructive`-equivalent class), and does **not** call `onChange` — re-rendering with the same `value` prop afterward restores the field to its last-committed display value (FR-010)
  4. A button (e.g. `aria-label="Open {label} date picker"`) opens a `@radix-ui/react-popover` containing a `react-day-picker` calendar grid plus hour and minute `<input type="number">` steppers, seeded from `value` (or the current date/time when `value` is `null`) (FR-008)
  5. Selecting a day in the calendar calls `onChange` with the combined date+existing-time value and closes the popover (the popover content is no longer in the document) (FR-009)
  6. Changing the hour or minute stepper calls `onChange` with the combined value and closes the popover (FR-008/FR-009)
  7. `disabled={true}` disables the text input and the picker-trigger button

### Implementation for User Story 3

- [X] T005 [US3] Implement `src/components/TimeRangeField.tsx` (new) per data-model.md "`TimeRangeField` (NEW)" and research.md §1–4:
  - Local helpers `formatLocal(epochMs: number): string` (→ `YYYY-MM-DD HH:mm`, zero-padded) and `parseLocal(text: string): number | null` (splits on the fixed `YYYY-MM-DD HH:mm` shape, builds `new Date(year, monthIndex, day, hour, minute)`, returns `null` if the shape doesn't match or the resulting `Date` is invalid) — adapted from `SearchBar.tsx`'s current `toDatetimeLocalValue`/`fromDatetimeLocalValue` (research.md §4)
  - Internal state: `text` (initialized/reset from `value` via `formatLocal`), `invalid: boolean`, `open: boolean` (popover), `pickerHour`/`pickerMinute` (seeded from `value` or `new Date()`)
  - Text `<input type="text">` with `aria-label="Time range {label.toLowerCase()}"`, `aria-invalid={invalid}`, invalid-state styling (red outline) when `invalid`; `onBlur`/`onKeyDown` (Enter) calls `parseLocal`; on success calls `onChange(parsed)` and clears `invalid`; on failure sets `invalid = true` without calling `onChange` (FR-007/FR-010)
  - A trigger `<button>` (calendar icon from `lucide-react`, `aria-label="Open {label} date picker"`) opens a `@radix-ui/react-popover` `Root`/`Trigger`/`Portal`/`Content` containing a `react-day-picker` `<DayPicker mode="single" />` seeded from `value` (or "now") plus hour/minute `<input type="number">` steppers (FR-008)
  - Selecting a day, or changing hour/minute, immediately combines the new date with the current hour/minute (or vice versa), calls `onChange` with the resulting epoch-ms, and sets `open = false` (FR-009)
  - `disabled` prop disables both the text input and the trigger button
  - Confirm T004 passes; run `npm run tsc --noEmit` to confirm no type errors from the new `react-day-picker`/`@radix-ui/react-popover` usage (depends on T001, T004)

**Checkpoint**: `TimeRangeField` is implemented, tested, and ready to be composed into `LogViewToolbar`.

---

## Phase 4: User Story 1 - Compact, single-row view toolbar (Priority: P1) 🎯 MVP

**Goal**: Collapse the three stacked rows (`SearchBar`'s time-range block, `HighlightPanel`'s "Highlighted only" checkbox, `LogViewer`'s "Wrap lines" checkbox) into one new `LogViewToolbar` row above the log content (FR-001/FR-002/FR-006/FR-015).

**Independent Test**: Open a log file with a detected timestamp format and at least one highlighted line. Confirm the time range filter (via `TimeRangeField`), "Highlighted only" toggle, and "Wrap lines" toggle all appear in a single horizontal row above the log content, and that the log content area is taller than before. Narrow the window and confirm the row's controls wrap onto additional rows without becoming inaccessible (FR-015).

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation (T010–T014)**

- [X] T006 [P] [US1] In `src/components/LogViewToolbar.test.tsx` (new), write failing tests for the `LogViewToolbarProps` interface from data-model.md (`alias: string`, `hasTimestampFormat: boolean`):
  1. With `hasTimestampFormat={true}`, renders two `TimeRangeField`s (`aria-label="Time range from"`/`"Time range to"`) and a "Clear" button only when `useSearchUiStore`'s `timeFrom`/`timeTo` for `alias` are non-null; clicking "Clear" calls `useSearchUiStore.getState().setTimeRange(alias, null, null)`
  2. With `hasTimestampFormat={false}`, no `TimeRangeField`/"Clear" button is rendered, but the "Highlighted only" checkbox, the show/hide highlights button, and the "Wrap lines" checkbox are (FR-002)
  3. All controls render within one container carrying `flex flex-wrap items-center gap-2` (or equivalent wrap-enabling classes) (FR-001/FR-015)
  4. The "Highlighted only" checkbox reflects and updates `useLogViewToolbarStore`'s `highlightedOnly` for `alias` via `setHighlightedOnly` (FR-006), independent of the show/hide button
  5. A show/hide button beside "Highlighted only" has `aria-expanded` reflecting `useLogViewToolbarStore`'s `highlightsVisible` for `alias` and `aria-controls="highlighted-lines-panel"`; clicking it calls `toggleHighlightsVisible(alias)` and does **not** change `highlightedOnly` (FR-003/FR-005)
  6. The "Wrap lines" checkbox reflects and updates `useLogViewToolbarStore`'s `wrap` for `alias` via `setWrap`

- [X] T007 [P] [US1] In `src/components/SearchBar.test.tsx`, remove the time-range-specific tests (the `hasTimestampFormat={true}` time-range submission test and any "Time range from"/"Time range to"/"Clear" assertions) — `SearchBar` no longer renders a time-range block (data-model.md "`SearchBar` (CHANGED)"). Keep `hasTimestampFormat` in `SearchBarProps` only if still used for the search submission's time-range args (it is — `useSearch`'s `runSearch` still receives `timeFrom`/`timeTo` from `useSearchUiStore` when `hasTimestampFormat`); update the remaining tests' `render(<SearchBar .../>)` calls only if prop changes require it

- [X] T008 [P] [US1] In `src/components/HighlightPanel.test.tsx`, remove `highlightedOnly`/`onHighlightedOnlyChange` from every `render(<HighlightPanel .../>)` call (props dropped per data-model.md "`HighlightPanel` (CHANGED)") and delete any test that asserted on the "Highlighted only" checkbox's presence/behavior; keep the empty-state, list-rendering, label-edit, and remove-highlight tests unchanged

- [X] T009 [P] [US1] In `src/components/LogViewer.test.tsx`, change the "toggles line wrap, defaulting to off" test (around line 100) to instead assert that `LogViewer` renders lines with `whiteSpace: "pre-wrap"` when a new required `wrap` prop is `true` and `whiteSpace: "normal"` (or unset) when `wrap` is `false` — remove the `getByRole("checkbox", { name: /wrap/i })` interaction (the checkbox moves to `LogViewToolbar`, data-model.md "`LogViewer` (CHANGED)"); update every other `render(<LogViewer .../>)` call in this file to pass `wrap={false}` (or `true` where relevant) since `wrap` is no longer optional

### Implementation for User Story 1

- [X] T010 [US1] Implement `src/components/LogViewToolbar.tsx` (new) per data-model.md "`LogViewToolbar` (NEW)": a `flex flex-wrap items-center gap-2` row that, given `{ alias, hasTimestampFormat }`:
  1. If `hasTimestampFormat`, renders `<TimeRangeField label="From" value={timeFrom} onChange={(v) => useSearchUiStore.getState().setTimeRange(alias, v, timeTo)} />`, the same for "To", and a "Clear" button (shown when `timeFrom !== null || timeTo !== null`) calling `setTimeRange(alias, null, null)` — reading `timeFrom`/`timeTo` from `useSearchUiStore`'s slice for `alias` (FR-001, FR-007–FR-013)
  2. A "Highlighted only" `<label><input type="checkbox" .../></label>` bound to `useLogViewToolbarStore`'s `highlightedOnly`/`setHighlightedOnly` (FR-001/FR-002/FR-006)
  3. A show/hide button beside it (e.g. `lucide-react`'s `List`/`ListX` icon with text "Show highlights"/"Hide highlights"), `aria-expanded={highlightsVisible}`, `aria-controls="highlighted-lines-panel"`, calling `useLogViewToolbarStore.getState().toggleHighlightsVisible(alias)` (FR-003/FR-005)
  4. A "Wrap lines" `<label><input type="checkbox" .../></label>` bound to `useLogViewToolbarStore`'s `wrap`/`setWrap` (FR-001/FR-002, moved from `LogViewer`)
  Run T006 to confirm it passes (depends on T003, T005, T006)

- [X] T011 [US1] Modify `src/components/SearchBar.tsx`: remove the entire `hasTimestampFormat && (...)` time-range block (lines ~162-216) and the now-unused `toDatetimeLocalValue`/`fromDatetimeLocalValue` helper functions (lines ~17-37) — both are superseded by `TimeRangeField`/`LogViewToolbar` (data-model.md "`SearchBar` (CHANGED)", research.md §4). Keep `hasTimestampFormat` in `SearchBarProps` and `handleSubmit`'s use of `timeFrom`/`timeTo` from `useSearchUiStore` unchanged — only the rendered time-range inputs and helpers are removed. Confirm `src/components/SearchBar.tsx` is now comfortably under 200 lines (plan.md Constraints: was 228 lines) (depends on T007)

- [X] T012 [US1] Modify `src/components/HighlightPanel.tsx`: remove the `highlightedOnly`/`onHighlightedOnlyChange` fields from `HighlightPanelProps` and the `<label><input type="checkbox" checked={highlightedOnly} .../>Highlighted only</label>` block (lines ~58-65) (data-model.md "`HighlightPanel` (CHANGED)"). Add `id="highlighted-lines-panel"` to the component's root `<div>` so `LogViewToolbar`'s show/hide button's `aria-controls` (T010) resolves to it. Leave `highlights`/`isLoading`/`error`/`onUpdateLabel`/`onRemove` and all list/empty-state rendering unchanged (US2 Scenario 4) (depends on T008)

- [X] T013 [US1] Modify `src/components/LogViewer.tsx`: remove the local `const [wrap, setWrap] = useState(false)` (line 51) and the `<label className="flex items-center gap-2 border-b p-2 text-sm">...Wrap lines</label>` block (lines ~141-148); add `wrap: boolean` to `LogViewerProps` (data-model.md "`LogViewer` (CHANGED)") and use the prop wherever the local `wrap` state was used (both the `highlightedOnly` and virtualized branches' `<LogLine wrap={wrap} .../>`). No other behavior changes (depends on T009)

- [X] T014 [US1] Modify `src/pages/WorkspacePage.tsx`:
  1. Remove the local `const [highlightedOnly, setHighlightedOnly] = useState(false)` (line 34); read it via `useLogViewToolbarStore((state) => state.slices[selectedAlias ?? ""]?.highlightedOnly ?? false)` and write it via `useLogViewToolbarStore.getState().setHighlightedOnly`
  2. Read `wrap` the same way (`...?.wrap ?? false`) and pass it to `<LogViewer wrap={wrap} .../>` (T013's new required prop)
  3. Render `<LogViewToolbar alias={selectedAlias} hasTimestampFormat={...has_timestamp_format ?? false} />` (same lookup expression currently passed to `SearchBar`'s `hasTimestampFormat`) inside a `FeatureErrorBoundary`, positioned between `SearchBar`/`SearchResultsPanel` and `HighlightPanel` (per plan.md's Project Structure)
  4. Pass `highlightedOnly={highlightedOnly}` (from step 1) to `<HighlightPanel>` is **removed** — `HighlightPanel` no longer takes that prop (T012); remove `onHighlightedOnlyChange={setHighlightedOnly}` too
  5. `<LogViewer highlightedOnly={highlightedOnly} ...>` keeps using the store-backed value from step 1 (`LogViewer`'s `highlightedOnly` prop is unchanged by this feature — only `wrap` is new)
  (depends on T003, T010, T011, T012, T013)

- [X] T015 [P] [US1] Update `src/pages/WorkspacePage.test.tsx`: adjust any assertions/mocks that referenced the removed local `highlightedOnly` `useState` or `HighlightPanel`'s `highlightedOnly`/`onHighlightedOnlyChange` props (now sourced from `useLogViewToolbarStore`), and add/update assertions that `LogViewToolbar` is rendered for the selected file and that `LogViewer` receives a `wrap` prop. Mock `useLogViewToolbarStore`/`useSearchUiStore` as needed following this file's existing hook-mocking conventions (depends on T014)

**Checkpoint**: User Story 1 is fully functional and independently testable — the combined toolbar row renders, wraps on narrow widths, and "Highlighted only"/"Wrap lines" work via the new store.

---

## Phase 5: User Story 2 - Hidden-by-default highlighted lines list (Priority: P1)

**Goal**: The highlighted-lines list (`HighlightPanel`'s list, sans its now-removed checkbox) is hidden by default and toggled solely by `LogViewToolbar`'s show/hide button (built in Phase 4), independent of "Highlighted only" (FR-003–FR-006).

**Independent Test**: Open a file with highlighted lines. Confirm the list is hidden on load, that the show/hide button reveals/hides it without affecting "Highlighted only" or the underlying highlight set, that switching files resets visibility to hidden, and that the empty state ("No highlighted lines yet.") still appears for files with no highlights when shown.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

> **NOTE: Write this test FIRST, ensure it FAILS before implementation (T017)**

- [X] T016 [US2] In `src/pages/WorkspacePage.test.tsx`, add failing tests: (1) with `useLogViewToolbarStore`'s `highlightsVisible` slice value `false` (default) for the selected alias, the rendered output does not include `HighlightPanel`'s content (e.g. "No highlighted lines yet." or a listed highlight); (2) with `highlightsVisible: true`, `HighlightPanel` (and its `id="highlighted-lines-panel"` container, T012) is rendered; (3) toggling `highlightsVisible` via `useLogViewToolbarStore.getState().toggleHighlightsVisible(alias)` does not change `highlightedOnly` or the `highlights` data passed to `LogViewer` (US2 Scenarios 1–3, 5)

- [X] T017 [US2] Modify `src/pages/WorkspacePage.tsx`: wrap the existing `<FeatureErrorBoundary key={`highlights-${selectedAlias}`} label="Highlights"><HighlightPanel .../></FeatureErrorBoundary>` block in a condition on `useLogViewToolbarStore`'s `highlightsVisible` for `selectedAlias` (read via the same selector pattern as T014's `highlightedOnly`/`wrap`) — render it only when `highlightsVisible` is `true` (FR-004). Because `useLogViewToolbarStore` returns the documented defaults (`highlightsVisible: false`) for any alias not yet present in `slices`, switching to a new file automatically starts with the list hidden (US2 Scenario 5) — no extra reset logic is needed. Run T016 to confirm it passes (depends on T014, T016)

**Checkpoint**: User Stories 1 AND 2 both work independently — the combined toolbar row is in place, and the highlighted-lines list is hidden-by-default with its own show/hide control.

---

## Phase 6: User Story 4 - Time range pre-filled with the file's actual span (Priority: P2)

**Goal**: `FileProperties` gains `first_timestamp`/`last_timestamp` (epoch-ms, derived from `FileIndex.line_timestamps`); a new `useFileProperties` hook surfaces them to the frontend, and `useSearchUiStore` pre-fills `timeFrom`/`timeTo` from them exactly once per file, unless the user has already set a value (FR-011–FR-013).

**Independent Test**: Open a file with a detected timestamp format and a known time span. After indexing completes, confirm "From"/"To" show the first/last line timestamps without hiding any lines. Edit "From" and confirm the typed value (not the pre-fill) is used for subsequent searches. Open a file with no detected timestamp format and confirm the time-range row is absent; open one with a detected format but no parseable timestamps and confirm the fields stay empty.

### Tests for User Story 4 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation (T021–T026)**

- [X] T018 [P] [US4] In `src-tauri/tests/files_test.rs`, add a local `add_ready_file_with_timestamps` helper (copy of `search_test.rs`'s helper of the same name: builds the line index, runs `timestamp::detect_and_parse`, and additionally calls `log_file_entry::set_has_timestamp_format(&db, file_id, true)` so `file_properties`'s `entry.has_timestamp_format` is `true`), plus failing tests for `commands::files::file_properties`:
  1. `file_properties_reports_first_and_last_timestamps`: given a file added via `add_ready_file_with_timestamps` with lines `"2026-06-12T10:00:00Z connecting to db\n2026-06-12T10:01:00Z an error talking to db\n2026-06-12T10:02:00Z recovered\n"`, `file_properties(&state, "app").unwrap()` returns `first_timestamp: Some(...)` equal to the epoch-ms of the first line's timestamp and `last_timestamp: Some(...)` equal to the epoch-ms of the last line's timestamp
  2. `file_properties_timestamps_null_without_detected_format`: a file added via `add_ready_file` (no timestamp detection, `has_timestamp_format` stays `false`) returns `first_timestamp: None` and `last_timestamp: None`
  3. `file_properties_timestamps_null_when_indexing_incomplete`: a `FileRuntime` whose `index.state` is `IndexState::Indexing` (not `Ready`) returns `first_timestamp: None`/`last_timestamp: None` regardless of `line_timestamps`
  (contracts/file-properties.md)

- [X] T019 [P] [US4] In `src/hooks/useSearchUiStore.test.ts`, add failing tests: (1) a freshly-seen alias's slice has `timeRangeInitialized: false`; (2) `initializeTimeRange(alias, 1000, 2000)` on a slice with `timeRangeInitialized: false` sets `timeFrom: 1000, timeTo: 2000, timeRangeInitialized: true`; (3) calling `initializeTimeRange` again afterward (e.g. with `3000, 4000`) is a no-op — `timeFrom`/`timeTo` remain `1000`/`2000`; (4) calling `setTimeRange(alias, ...)` on a slice with `timeRangeInitialized: false` also sets `timeRangeInitialized: true`, so a subsequent `initializeTimeRange` call is then a no-op (data-model.md "`useSearchUiStore` (CHANGED)")

- [X] T020 [P] [US4] In `src/hooks/useFileProperties.test.ts` (new), write failing tests mirroring `src/hooks/useHighlights.ts`'s TanStack Query test conventions: `useFileProperties(alias)` calls `getFileProperties(alias)` (mocked from `@/ipc/files`) and returns its resolved `FileProperties` (including `first_timestamp`/`last_timestamp`); `useFileProperties(null)` does not call `getFileProperties` (`enabled: false`); when the resolved data has `indexing_complete: false`, the query is configured to refetch (e.g. assert `refetchInterval` resolves to a truthy value via the query's options/`queryFn` being called again after the interval in a `vi.useFakeTimers` test, or — if simpler — assert the hook exposes the raw `indexing_complete`/`first_timestamp`/`last_timestamp` fields verbatim and a separate unit test for the `refetchInterval` callback function itself: returns `false` when `data.indexing_complete` is `true`, a positive number otherwise) (research.md §6)

### Implementation for User Story 4

- [X] T021 [US4] Modify `src-tauri/src/commands/types.rs`: add `pub first_timestamp: Option<f64>` and `pub last_timestamp: Option<f64>` fields to `FileProperties` (after `indexing_complete`), per contracts/file-properties.md and data-model.md ("`f64`, not `i64`, per the existing `SearchHistoryEntry.time_from`/`time_to` convention"). Run T018 to confirm it now fails to compile (missing fields), expected at this step (depends on T018)

- [X] T022 [US4] Modify `src-tauri/src/commands/files.rs`'s `file_properties` function: after computing `available`/`indexing_complete`/`total_lines`, compute `first_timestamp`/`last_timestamp` as the epoch-ms (`as f64`) of the first and last `Some` entries of `index.line_timestamps` (`Vec<Option<i64>>`), in line order — `None` if `has_timestamp_format` is `false`, `indexing_complete` is `false`, `line_timestamps` is `None`, or it has no `Some` entries (research.md §5). Add both fields to the `FileProperties { ... }` literal. Run `cargo test commands::files` / `cargo test --test files_test` to confirm T018 passes (depends on T021, T018)

- [X] T023 [US4] From `src-tauri/`, run `cargo test export_bindings` to regenerate `src/bindings/index.ts`'s `FileProperties` type with the two new `number | null` fields (contracts/file-properties.md). Confirm `src/ipc/files.ts`'s `getFileProperties` (which re-exports `FileProperties`) requires no manual changes — the type flows through automatically (depends on T022)

- [X] T024 [US4] Modify `src/hooks/useSearchUiStore.ts` per data-model.md "`useSearchUiStore` (CHANGED)": add `timeRangeInitialized: boolean` to `SearchUiState` (default `false` in `DEFAULT_SEARCH_UI_STATE`); add a new action `initializeTimeRange(alias, timeFrom, timeTo)` that, only if the slice's `timeRangeInitialized` is `false`, sets `timeFrom`/`timeTo` to the given values and `timeRangeInitialized` to `true` (otherwise a no-op); modify the existing `setTimeRange(alias, timeFrom, timeTo)` to also set `timeRangeInitialized: true`. Run T019 to confirm it passes (depends on T019)

- [X] T025 [US4] Implement `src/hooks/useFileProperties.ts` (new) per research.md §6, following `src/hooks/useHighlights.ts`'s `useQuery` conventions: `useFileProperties(alias: string | null)` wraps `getFileProperties` from `@/ipc/files` with `queryKey: ["fileProperties", alias]`, `enabled: alias !== null`, and `refetchInterval: (query) => query.state.data?.indexing_complete ? false : 1000` (so `first_timestamp`/`last_timestamp` — `null` while indexing — become available once indexing completes, without the caller managing polling, research.md §6). Export a `filePropertiesQueryKey(alias)` helper for consistency with `useHighlights`'s `highlightsQueryKey`. Run T020 to confirm it passes (depends on T020, T023)

- [X] T026 [US4] Modify `src/pages/WorkspacePage.tsx`: call `useFileProperties(selectedAlias)`; add a `useEffect` that, whenever `selectedAlias`, `data?.first_timestamp`, or `data?.last_timestamp` change and both are non-null, calls `useSearchUiStore.getState().initializeTimeRange(selectedAlias, data.first_timestamp, data.last_timestamp)` (FR-011–FR-013, research.md §6). Because `initializeTimeRange` is a no-op once `timeRangeInitialized` is `true` for that alias (T024), this safely runs on every relevant data change without overwriting a user-edited range or re-firing after the first successful pre-fill (depends on T014, T024, T025)

**Checkpoint**: All four user stories are independently functional. `npm run dev`/`npm run tauri dev` shows the combined toolbar with working typed/picker time-range fields pre-filled from each file's actual span, and a hidden-by-default highlighted-lines list.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final repo-wide verification per quickstart.md.

- [X] T027 [P] From `src-tauri/`, run `cargo fmt --check` and `cargo clippy -- -D warnings`
- [X] T028 [P] From the repository root, run `npm run tsc --noEmit` and `npm run eslint .`
- [X] T029 Run `npm test` (full Vitest suite, including all new/updated component and hook tests from T002–T020) and `cargo test` (from `src-tauri/`, full suite including T018) to confirm everything passes
- [ ] T030 Run the quickstart.md manual verification steps for User Stories 1–4 against `npm run tauri dev`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS US1 (Phase 4) and US2 (Phase 5)
- **Phase 3 (US3 — `TimeRangeField`)**: Depends on Setup (T001, for `react-day-picker`/`@radix-ui/react-popover`). Independent of Phase 2
- **Phase 4 (US1 — `LogViewToolbar`)**: Depends on Phase 2 (`useLogViewToolbarStore`) AND Phase 3 (`TimeRangeField`, composed into `LogViewToolbar`)
- **Phase 5 (US2 — hidden highlights list)**: Depends on Phase 2 (`highlightsVisible` in `useLogViewToolbarStore`) AND Phase 4 (the show/hide button is built as part of `LogViewToolbar`, T010)
- **Phase 6 (US4 — pre-filled time range)**: Depends on Phase 4 (T014's `WorkspacePage` wiring, which T026 extends) for its frontend half; its backend half (T018/T021–T023) has no dependency on any other phase and could start anytime after Phase 1
- **Polish (Phase 7)**: Depends on all of Phases 2–6

### User Story Dependencies

- **US3 (P1, Phase 3)**: No dependency on other stories — `TimeRangeField` is a standalone component
- **US1 (P1, Phase 4)**: Depends on US3 (Phase 3) for `TimeRangeField` and on the Foundational store (Phase 2)
- **US2 (P1, Phase 5)**: Depends on US1 (Phase 4) — the show/hide button it gates `HighlightPanel` on is created as part of `LogViewToolbar`
- **US4 (P2, Phase 6)**: Depends on US1 (Phase 4) only for the `WorkspacePage` wiring point (T026); its `FileProperties`/backend/store/hook tasks (T018–T025) are independent of US1–US3 and may be implemented in parallel with Phases 3–5 if staffed separately

### Within Each Phase

- Tests MUST be written and FAIL before implementation
- `[P]`-marked tasks touch different files and have no unresolved same-phase dependencies

### Parallel Opportunities

- T002 (Phase 2) and T004/T001 (Phase 3) can proceed in parallel — different files, no shared dependency
- T006, T007, T008, T009 (Phase 4 tests) can all run in parallel — four different test files
- T018, T019, T020 (Phase 6 tests) can all run in parallel — backend test file vs. two independent frontend hook test files
- T027 and T028 (Phase 7) can run in parallel — backend vs. frontend toolchains

---

## Parallel Example: Phase 4 (User Story 1) test tasks

```bash
# Launch all four Phase 4 test-writing tasks together (different files):
Task: "Write failing tests for LogViewToolbar in src/components/LogViewToolbar.test.tsx (T006)"
Task: "Remove time-range tests from src/components/SearchBar.test.tsx (T007)"
Task: "Remove highlightedOnly prop tests from src/components/HighlightPanel.test.tsx (T008)"
Task: "Update wrap-prop tests in src/components/LogViewer.test.tsx (T009)"
```

---

## Implementation Strategy

### MVP First (Setup → Foundational → US3 → US1)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational — `useLogViewToolbarStore`)
2. Complete Phase 3 (US3 — `TimeRangeField`), since Phase 4 composes it
3. Complete Phase 4 (US1 — `LogViewToolbar`, the combined row)
4. **STOP and VALIDATE**: run the quickstart.md "User Story 1" and "User Story 3" manual checks — the combined row, typed time-range entry, and self-closing picker are all visible and working (MVP!)

### Incremental Delivery

1. Setup + Foundational + US3 + US1 → combined toolbar row with working `TimeRangeField`s (MVP)
2. Add US2 (Phase 5) → highlighted-lines list hidden-by-default with its own show/hide control
3. Add US4 (Phase 6) → time-range fields pre-fill from the file's actual span
4. Each increment is independently demoable via its quickstart.md section

### Parallel Team Strategy

With multiple developers, after Phase 1 + Phase 2:

- Developer A: Phase 3 (US3 `TimeRangeField`) → then Phase 4 (US1 `LogViewToolbar`) → then Phase 5 (US2)
- Developer B: Phase 6's backend half (T018, T021–T023) and frontend store/hook half (T019, T020, T024, T025) in parallel with Developer A — only T026 (the final `WorkspacePage` wiring) needs to wait for Developer A's T014

---

## Notes

- `[P]` tasks = different files, no dependencies
- `[Story]` label maps task to specific user story for traceability
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
