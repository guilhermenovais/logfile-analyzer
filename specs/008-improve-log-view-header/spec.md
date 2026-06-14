# Feature Specification: Streamlined Log Viewer Header

**Feature Branch**: `008-improve-log-view-header`
**Created**: 2026-06-14
**Status**: Draft
**Input**: User description: "I want to improve how the main section of the app works and looks. The main section is where the active log file is shown. First, I want to change it's header. Right now, we have the time range filter, the \"Highlighted only\" option (with the highlighted lines bellow) and the \"Wrap lines\" options, each in a separate row. I want all these options to be in the same row. The Highlighted lines section should be hidden by default, with a button to show it beside the \"Highlighted only\" option. I also want to fix the behavior of the time range fields. First, they don't allow you to type the time, you are forced to use the date pickers. Second, the date picker don't close after you select a date. Third, you are not able to pick the hours and minutes. Fourth, the fields should be prefilled with the timestamps of the first and last lines of the file"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compact, single-row view toolbar (Priority: P1)

A user opens a log file and wants to quickly find and adjust the time range filter, the "Highlighted only" view, and the "Wrap lines" option without scrolling through several stacked rows of controls above the log content.

**Why this priority**: This is the primary visual reorganization the user asked for. It reduces vertical clutter above the log content, making more of the file visible at once, and groups related "view" controls together so they're easier to find.

**Independent Test**: Open a log file with a detected timestamp format and at least one highlighted line. Confirm the time range filter, "Highlighted only" toggle, and "Wrap lines" toggle all appear in a single horizontal row above the log content, and that the log content area is taller than before because the previously separate rows are gone.

**Acceptance Scenarios**:

1. **Given** a file is open in the main view, **When** the header/toolbar area is displayed, **Then** the time range filter, the "Highlighted only" toggle, and the "Wrap lines" toggle all appear within the same horizontal row.
2. **Given** the combined toolbar row, **When** the window is wide enough to fit all controls, **Then** no control is hidden, cut off, or wraps onto a new line.
3. **Given** the combined toolbar row, **When** the window is narrowed below the width needed to fit every control on one line, **Then** controls wrap to additional rows while remaining grouped and usable (no control becomes inaccessible).

---

### User Story 2 - Hidden-by-default highlighted lines list (Priority: P1)

A user working with highlighted lines wants the "Highlighted only" toggle readily available, but does not want the list of highlighted lines to take up space in the main view unless they specifically ask to see it.

**Why this priority**: Directly requested by the user and works together with User Story 1 to declutter the main view; without it, the combined toolbar row would still be followed by an always-visible list.

**Independent Test**: Open a file that has highlighted lines. Confirm the highlighted lines list is not visible by default, that a button next to "Highlighted only" toggles the list's visibility, and that toggling "Highlighted only" itself does not implicitly reveal the list.

**Acceptance Scenarios**:

1. **Given** a file is opened in the main view, **When** the view first loads, **Then** the highlighted lines list is hidden, regardless of whether the file has any highlighted lines.
2. **Given** the highlighted lines list is hidden, **When** the user activates the "show highlighted lines" button located beside the "Highlighted only" toggle, **Then** the highlighted lines list becomes visible below the toolbar row.
3. **Given** the highlighted lines list is visible, **When** the user activates the same button again, **Then** the list is hidden again.
4. **Given** a file with no highlighted lines, **When** the user shows the highlighted lines list, **Then** the list area communicates that there are no highlighted lines yet (existing empty-state behavior is preserved).
5. **Given** the user switches to a different file in the workspace, **When** the new file's view loads, **Then** the highlighted lines list starts hidden for that file as well.

---

### User Story 3 - Type a precise time range (Priority: P1)

A user wants to restrict the log view / search to a specific time window by directly typing the start and end date and time, including the hour and minute, rather than being forced to use a mouse-driven date picker that doesn't support every part of the value.

**Why this priority**: The time range fields are currently effectively broken for precise use (no typing, no hour/minute selection), which undermines the time-range filtering feature entirely. This is a core functionality fix, not just polish.

**Independent Test**: Open a file with a detected timestamp format. Click into the "From" field and type a full date and time (including hour and minute) using the keyboard only. Confirm the typed value is accepted and reflected in the field, and repeat for the "To" field. Run a search and confirm results respect the typed range.

**Acceptance Scenarios**:

1. **Given** the time range "From" or "To" field is focused, **When** the user types a date and time directly (year, month, day, hour, and minute), **Then** the field accepts the typed value without requiring the picker to be opened.
2. **Given** the user has typed a valid date and time into a time range field, **When** the value is committed (e.g., on blur or picker confirmation), **Then** it is used as the corresponding bound for time-range filtering.
3. **Given** the user opens the date/time picker for a time range field, **When** the picker is displayed, **Then** the user can select an hour and a minute in addition to a date.
4. **Given** the user has selected a date (and optionally a time) from the picker, **When** the selection is complete, **Then** the picker closes automatically without requiring the user to click elsewhere.
5. **Given** the user types an invalid or incomplete date/time, **When** the value cannot be parsed, **Then** the field clearly indicates the value was not accepted and the previous valid bound (if any) remains in effect for filtering.

---

### User Story 4 - Time range pre-filled with the file's actual span (Priority: P2)

When a user opens a file with a detected timestamp format, they want the "From" and "To" fields to already show the timestamps of the file's first and last lines, so they immediately see the file's overall time span and can narrow it from there instead of starting from empty fields.

**Why this priority**: This is a convenience/defaults improvement that builds on User Story 3 (editable fields). It's valuable but the time range filter is usable without it, so it's slightly lower priority than fixing the broken input behavior.

**Independent Test**: Open a file with a detected timestamp format whose lines span a known time range. Confirm the "From" field shows the timestamp of the first line and the "To" field shows the timestamp of the last line, without the user entering anything. Switch to a different file and confirm the fields update to that file's own first/last timestamps.

**Acceptance Scenarios**:

1. **Given** a file with a detected timestamp format and at least one line containing a recognizable timestamp, **When** the file's view is opened for the first time, **Then** the "From" field is pre-filled with the timestamp of the first line that has a recognizable timestamp, and the "To" field is pre-filled with the timestamp of the last line that has a recognizable timestamp.
2. **Given** the time range fields are pre-filled per Scenario 1, **When** no search has been run yet, **Then** the log view shows the file's full contents (the pre-filled range does not itself hide any lines).
3. **Given** the pre-filled time range fields, **When** the user edits either field, **Then** the user's value replaces the pre-filled value and is used for subsequent filtering, exactly as with any manually entered value.
4. **Given** a file with no detected timestamp format, **When** its view is opened, **Then** the time range filter (and its pre-filled values) is not shown, consistent with existing behavior.
5. **Given** a file with a detected timestamp format but no line containing a recognizable timestamp, **When** its view is opened, **Then** the time range fields are left empty rather than pre-filled.

---

### Edge Cases

- A file is still loading/indexing when its view opens: the time range fields should not show stale or incorrect pre-filled values from a previously selected file, and should update once the first/last timestamps are available.
- The user types a "From" value that is later than the current "To" value (or vice versa): the system should not silently produce an unusable range; this should be flagged so the user can correct it.
- The combined toolbar row is shown for a file without a detected timestamp format: the row still shows "Highlighted only", the show/hide highlights button, and "Wrap lines", just without the time range controls.
- The user shows the highlighted lines list, then adds or removes a highlight: the list updates in place without the visibility state being reset to hidden.
- The user clears a pre-filled or typed time range value entirely: the corresponding bound becomes unset (no lower/upper limit), matching the existing "Clear" behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The main log view header MUST present the time range filter, the "Highlighted only" toggle, and the "Wrap lines" toggle within a single horizontal row (for files with a detected timestamp format; see FR-002 for files without one).
- **FR-002**: For files without a detected timestamp format, the same row MUST present the "Highlighted only" toggle, the show/hide highlighted-lines control, and the "Wrap lines" toggle, omitting only the time range controls.
- **FR-003**: The system MUST provide a control, positioned beside the "Highlighted only" toggle, that shows or hides the highlighted lines list.
- **FR-004**: The highlighted lines list MUST be hidden by default whenever a file's view is opened or switched to, regardless of whether the file has highlighted lines.
- **FR-005**: Activating the show/hide control MUST toggle the visibility of the highlighted lines list without changing the "Highlighted only" toggle's state, and without changing the underlying set of highlighted lines.
- **FR-006**: The "Highlighted only" toggle MUST continue to control whether the main log content shows all lines or only highlighted lines, independent of whether the highlighted lines list is shown.
- **FR-007**: Each "From" and "To" time range field MUST accept a fully typed date and time, including hour and minute, entered via the keyboard, without requiring the picker to be opened.
- **FR-008**: Each time range field's picker MUST allow the user to select an hour and a minute in addition to a date.
- **FR-009**: After the user completes a selection in a time range field's picker, the picker MUST close automatically.
- **FR-010**: If a user-entered time range value cannot be interpreted as a valid date and time, the system MUST indicate the value was not accepted and retain the previously committed value (if any) for filtering purposes.
- **FR-011**: When a file with a detected timestamp format and at least one line with a recognizable timestamp is opened, the system MUST pre-fill the "From" field with the timestamp of that file's first line containing a recognizable timestamp, and the "To" field with the timestamp of that file's last line containing a recognizable timestamp.
- **FR-012**: Pre-filled time range values MUST NOT cause any lines to be hidden from the log view on their own; they represent the file's full span until the user changes them or runs a filtered search.
- **FR-013**: A user editing a pre-filled time range field MUST be able to replace it with a typed or picker-selected value using the same input behavior described in FR-007–FR-009.
- **FR-014**: Each file's toolbar/highlight-visibility state (shown/hidden highlighted lines list, time range values) MUST be tracked independently per open file, consistent with existing per-file view state.
- **FR-015**: When the combined toolbar row does not fit within the available width, its controls MUST wrap to additional rows while remaining grouped and fully operable, rather than being clipped or hidden.

### Key Entities

- **Log View Toolbar State**: Per-file view-related state shown in the combined header row: "Highlighted only" flag, highlighted-lines-list visibility flag, "Wrap lines" flag, and the time range ("From"/"To") values. Exists alongside the existing per-file search/highlight state.
- **File Time Span**: The timestamps of the first and last lines of a file that contain a recognizable timestamp, used to pre-fill the time range fields. Derived from the file's content and its detected timestamp format.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When viewing any file, a user can see and operate the time range filter, "Highlighted only" toggle, "Wrap lines" toggle, and the highlighted-lines show/hide control without scrolling, all within one row of the header (or wrapped rows on narrow windows without losing access to any control).
- **SC-002**: A user can set both the start and end of a time range, including specific hours and minutes, using only the keyboard, in under 15 seconds combined.
- **SC-003**: 100% of date/time selections made via the picker result in the picker closing automatically, with no extra click needed to dismiss it.
- **SC-004**: For files with a detected timestamp format and at least one timestamped line, the time range fields show the file's first and last line timestamps immediately when the file is opened, with no user action required.
- **SC-005**: The highlighted lines list remains hidden until explicitly shown by the user for every file opened, and can be shown or hidden again with a single click.

## Assumptions

- "The main section" / "header" refers to the toolbar area of the log viewer pane that currently contains the time range filter, the "Highlighted only" toggle with its highlighted-lines list, and the "Wrap lines" toggle — not the search query/type input row, which is unaffected by this feature.
- The "Wrap lines" toggle continues to be a per-file, view-only preference with no change to its underlying behavior, only its placement.
- The time range filter continues to be shown only for files with a detected timestamp format, per existing behavior; this feature does not change when the filter is shown, only how it behaves and how it's laid out.
- Determining a file's first and last recognizable-timestamp lines is treated as data the system can derive from the file's existing timestamp-format detection and indexing; no new user-facing configuration is introduced for this.
- "Closes automatically" after a picker selection means the picker dismisses once the user has finished choosing a value (date, or date and time) for that field, without requiring a click outside the picker.
- Pre-filled time range values are suggestions reflecting the file's actual span; they do not need to be persisted beyond the session and are recomputed if the file's content changes (e.g., as new lines are appended).
