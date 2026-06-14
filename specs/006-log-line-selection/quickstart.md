# Quickstart: Selectable Log Lines

Manual verification walkthrough, mirroring the spec's acceptance scenarios.
Run `npm run tauri dev`, open a workspace with at least one log file loaded
(enough lines to scroll), and run a search that returns several matches.

## US1 — Click to select (FR-001–FR-004)

1. Click any visible log line. It gets a blue border.
2. Click a different line. The border moves there; the first line's border
   disappears.
3. Click the same selected line again. It stays selected (no toggle-off).
4. Click-drag from partway through one line to partway through another.
   The dragged text highlights as normal text selection; the blue border
   does not move.

## US2 — Ctrl+C copies the selected line (FR-005–FR-007)

1. Click a line (no drag). Press Ctrl+C (Cmd+C on macOS). Paste into the
   search field or an external app — the full line text appears.
2. Click-drag to highlight a sub-string (possibly spanning lines). Press
   Ctrl+C. Paste — only the highlighted text appears, not the whole line.
3. Reload/restart so nothing is selected. Press Ctrl+C. Nothing is copied
   (paste shows previous clipboard contents or nothing changes).

## US3 — Search results sync (FR-008–FR-010)

1. Run a search with multiple matches; the results panel opens.
2. Click "Next match" (↓) repeatedly. Each step shows the same line with a
   blue border in both the main view and the results panel.
3. Click a main-view line that is also a search match. Its results-panel
   entry gets the blue-border indicator.
4. Click a main-view line that is NOT a match. No results-panel entry shows
   the indicator.

## US4 — Keyboard navigation (FR-011–FR-014)

1. Click a line, then press Down repeatedly. Selection (blue border) moves
   down one line at a time; the main view scrolls to keep it visible.
2. Press Up repeatedly; selection moves up, view scrolls as needed.
3. With the results panel open, press Down/Up until the selected line is one
   of the listed matches — the panel scrolls to reveal that entry and shows
   the indicator. Continue past it to a non-matching line — the panel's
   scroll position and indicator stay where they were.
4. Press Up while the first line is selected, and Down while the last line
   is selected — selection does not change either time.
5. Click into the search query field and press Up/Down — the text cursor
   moves in the field; the log selection does not change.

## Cross-cutting checks (Edge Cases)

- Toggle the "Highlighted only" view: click a line there to select it (blue
  border appears); behavior matches the normal view.
- Click a line's star (☆/★) button: the highlight toggles, but the selected
  line does not change.
- Select a line that also has a star highlight and is a search match
  (gray background): all three indicators (blue border, star, gray
  background) remain visible and distinguishable.
- Open a second file, select a different line there, then switch back to the
  first file — its original selection (blue border) is restored.
- Run a new search, or open/close the results panel — the current selection
  is unchanged; the results-panel indicator updates if the selected line
  becomes/stops being a match.
