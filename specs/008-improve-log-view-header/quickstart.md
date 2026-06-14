# Quickstart: Verifying the Streamlined Log Viewer Header

## Automated

```bash
# Frontend
npm run tsc --noEmit
npm run eslint .
npm test -- LogViewToolbar TimeRangeField HighlightPanel LogViewer SearchBar WorkspacePage useLogViewToolbarStore useSearchUiStore useFileProperties

# Backend
cd src-tauri
cargo test commands::files
cargo clippy -- -D warnings
cargo fmt --check

# Regenerate bindings after FileProperties changes
cargo test export_bindings
```

Expect:
- New `useLogViewToolbarStore` tests covering per-alias defaults (all
  `false`) and the `highlightedOnly`/`highlightsVisible`/`wrap` actions.
- New `useSearchUiStore` tests for `timeRangeInitialized` and
  `initializeTimeRange` (no-op once already initialized; `setTimeRange` also
  sets it).
- New `TimeRangeField` tests: typed entry commits a value (FR-007), invalid
  text sets `aria-invalid` without calling `onChange` (FR-010), picker
  selection closes the popover (FR-009).
- New `commands::files` test(s) asserting `first_timestamp`/`last_timestamp`
  are the first/last `Some` entries of `line_timestamps`, and `null` when
  `has_timestamp_format` is `false` or indexing is incomplete.
- Updated `SearchBar`/`HighlightPanel`/`LogViewer` tests reflecting their
  narrowed props (no time range, no "Highlighted only" checkbox, `wrap` as a
  prop).

## Manual (app) — User Story 1: combined toolbar row

1. `npm run tauri dev`. Open a log file with a detected timestamp format
   (e.g. one with `2026-05-21 18:14:06.043 ...` lines, per 007).
2. Confirm the time range fields, "Highlighted only" toggle, and "Wrap lines"
   toggle all appear in one horizontal row above the log content.
3. Resize the window narrower than the row's natural width: confirm controls
   wrap onto additional rows rather than being clipped or hidden (FR-015),
   and every control remains operable.

## Manual (app) — User Story 2: hidden-by-default highlighted lines

1. With the same file open, confirm the highlighted lines list is **not**
   visible on load, even after highlighting a line.
2. Highlight a couple of lines (existing highlight UI), then click the
   show/hide button beside "Highlighted only": confirm the list appears below
   the toolbar row with the highlighted lines.
3. Click the button again: confirm the list hides. Toggling "Highlighted
   only" itself must not show/hide the list, and must not be affected by the
   list's visibility.
4. Open a file with no highlights and show the list: confirm the existing "No
   highlighted lines yet." empty state still appears.
5. Switch to a different file: confirm the list starts hidden for that file
   too, and switching back to the first file's list visibility is
   independently hidden again (per-file state, FR-014).

## Manual (app) — User Story 3: typed and pickable time range

1. Click into the "From" field and, using only the keyboard, type a full date
   and time (e.g. `2026-05-21 18:00`). Confirm the value is accepted (no
   picker interaction needed) and tab to "To" to do the same with a later
   time.
2. Run a search and confirm results are limited to the typed range (SC-002).
3. Open the picker (calendar button) for "From": confirm you can pick a day
   **and** set hour/minute via the popover controls, and that the popover
   closes automatically once you finish (FR-008/FR-009) — no extra click
   needed.
4. Type an invalid value (e.g. `not-a-date`) into "To": confirm the field is
   visibly marked invalid and the previously committed "To" value remains in
   effect for filtering (FR-010).

## Manual (app) — User Story 4: pre-filled time range

1. Open a file with a detected timestamp format and a known time span.
   Immediately after it finishes indexing, confirm "From" shows the first
   line's timestamp and "To" shows the last line's timestamp, with no lines
   hidden from the log view (FR-011/FR-012).
2. Edit the "From" field to a later time and run a search: confirm the typed
   value (not the pre-filled one) is used (FR-013).
3. Switch to a file with no detected timestamp format: confirm the time range
   row is absent entirely (existing behavior, Assumptions).
4. (If available) open a file with a detected format but where no single line
   parses as a timestamp: confirm both fields are left empty rather than
   pre-filled (Acceptance Scenario 5).
