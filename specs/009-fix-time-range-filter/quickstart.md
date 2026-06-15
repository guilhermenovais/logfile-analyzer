# Quickstart: Verifying the Time Range Filter Fixes

## Automated

```bash
# Frontend
npx tsc --noEmit
npx eslint .
npx vitest run src/components/TimeRangeField.test.tsx src/components/LogViewToolbar.test.tsx \
  src/components/SearchBar.test.tsx src/pages/WorkspacePage.test.tsx src/hooks/useSearch.test.ts \
  src/hooks/useSearchUiStore.test.ts src/lib/timeRange.test.ts

# Backend
cd src-tauri
cargo test --test search_test
cargo clippy -- -D warnings
cargo fmt --check
```

Expect:
- New `src-tauri/tests/search_test.rs` case: real `add_file` → poll
  `get_file_properties` until `indexing_complete && has_timestamp_format` →
  `search` with a narrowed `[time_from, time_to]` returns fewer matches than
  an unfiltered search of the same query; `search` with
  `[first_timestamp, last_timestamp]` returns the *same* matches as no time
  filter (FR-001–FR-003).
- New frontend test wiring `LogViewToolbar` + `SearchBar` (real
  `useSearchUiStore`, mocked `invoke`) asserting the `search` invoke payload's
  `timeFrom`/`timeTo` reflect values set via the toolbar (US1, research.md
  §1).
- `TimeRangeField.test.tsx`: selecting a day, then changing hour, then
  changing minute, leaves the popover open and updates its display without
  calling `onChange` (FR-004/FR-005); activating the confirm button calls
  `onChange` once with the combined value and closes the popover (FR-006);
  simulating an outside interaction does the same (FR-007); opening/closing
  with no change calls `onChange` with the unchanged `value` (Scenario 5).
- `LogViewToolbar.test.tsx`: with `useFileProperties` returning
  `first_timestamp`/`last_timestamp`, activating "Clear" after editing the
  fields resets `timeFrom`/`timeTo` to those values (not `null`/`null`); with
  both `null`, Clear empties the fields (unchanged).
- New `src/lib/timeRange.test.ts` (or folded into `TimeRangeField.test.tsx`):
  `formatLocal`/`parseLocal`/`combine` round-trip, moved verbatim from
  `TimeRangeField.test.tsx`'s existing cases if any reference them directly.

## Manual (app) — User Story 1: time range actually filters (P1)

1. `npm run tauri dev`. Open a log file with a detected timestamp format and
   a search term that matches lines spread across the file's whole time span.
2. Run the search with the "From"/"To" fields at their pre-filled default
   span: confirm **all** matches appear (Acceptance Scenario 5).
3. Narrow "To" to roughly the midpoint of the file (via typing or the picker,
   see User Story 2 below) and re-run the search: confirm only matches at or
   before that time are returned (Acceptance Scenario 3).
4. Narrow "From" to roughly the same midpoint (so "From" > the original "To"
   you just set, or set both to a window with no matches): re-run the search
   and confirm **zero** results — not all matches (Acceptance Scenario 4).
5. Reset both back toward the full span and confirm matches reappear
   (Acceptance Scenario 1/2).

## Manual (app) — User Story 2: picker confirm/click-away (P2)

1. Open the "From" picker (calendar button). Select a different day: confirm
   the popover **stays open** and the calendar reflects the new day.
2. Change the hour, then the minute, via the number inputs: confirm the
   popover **stays open** after each change (FR-004/FR-005).
3. Click the new confirm button: confirm the popover closes and the "From"
   field's text now shows the day/hour/minute you selected (FR-006).
4. Repeat steps 1–2, then click outside the popover (e.g. on the log view):
   confirm the same result as step 3 — value applied, popover closed
   (FR-007).
5. Open the "From" picker again without changing anything, then click outside:
   confirm the field's value is unchanged (Acceptance Scenario 5).
6. Open the "From" picker, change something, then click the "To" field's
   picker button without confirming "From": confirm "From"'s popover closes
   with its change applied, and "To"'s popover opens (Edge Cases).

## Manual (app) — User Story 3: Clear resets to file span (P3)

1. With a file open whose "From"/"To" show the pre-filled default span, edit
   both to a narrower window.
2. Click "Clear": confirm both fields now show the file's **first and last
   line timestamps** again (not empty) — matching what they showed on first
   load (FR-009, Acceptance Scenario 1).
3. Click "Clear" again (now at the default span, no edits): confirm no visible
   change (Acceptance Scenario 2).
4. Run a search: confirm results match the full-file behavior from User Story
   1 step 2 (Acceptance Scenario 3).
5. (If available) open a file with a detected format but no line that parses
   as a timestamp: confirm the time range fields start empty and "Clear" (if
   shown) leaves them empty (Edge Cases bullet 1).
