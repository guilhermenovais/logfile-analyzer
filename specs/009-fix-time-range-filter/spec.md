# Feature Specification: Time Range Filter Fixes

**Feature Branch**: `009-fix-time-range-filter`
**Created**: 2026-06-14
**Status**: Draft
**Input**: User description: "I want to change the behavior of the time range filter feature. Currently, the filter isn't working at all, at least on the desktop interface. Whatever time is selected, the lines never get filtered. Also, when using the date picker, the picker is closed whenever the hour or minute is changed. There should be a button to confirm (clicking outside the picker should also work). Finally, the clear button currently is just erasing the contents of the time range fields. Instead, it should go back to the default range (time of the first line and time of the last line)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Time range actually filters results (Priority: P1)

A user opens a log file, sets a "From" and/or "To" time on the time range filter, and runs a search. They expect only log lines whose timestamp falls within the selected range to be returned, but today every line is returned regardless of the selected range.

**Why this priority**: This is the core function of the feature. Without it, the time range filter is decorative — nothing else in this spec matters if the underlying filtering still has no effect.

**Independent Test**: Open a log file with a detected timestamp format spanning a known time period. Set "From" and "To" to a sub-range that excludes some lines containing the search term. Run the search and confirm only matches with timestamps inside the selected range are returned. Repeat with only "From" set, and again with only "To" set.

**Acceptance Scenarios**:

1. **Given** both "From" and "To" are set, **When** the user runs a search, **Then** only matching lines with a timestamp within the inclusive ["From", "To"] range are shown.
2. **Given** only "From" is set, **When** the user runs a search, **Then** only matching lines with a timestamp at or after "From" are shown.
3. **Given** only "To" is set, **When** the user runs a search, **Then** only matching lines with a timestamp at or before "To" are shown.
4. **Given** "From" and "To" are set to a window that contains no matching lines, **When** the user runs a search, **Then** no results are shown (rather than all matches).
5. **Given** "From" and "To" still hold the file's full default span (first/last line timestamps, unedited), **When** the user runs a search, **Then** all matches within the file are shown, since the default span covers the entire file.

---

### User Story 2 - Confirm a date/time selection without losing the picker (Priority: P2)

A user opens the date/time picker for "From" or "To" and wants to pick a day and then adjust the hour and/or minute before applying the change. Today, changing the hour or minute immediately closes the picker, forcing the user to reopen it repeatedly to finish a single selection.

**Why this priority**: This makes the picker usable for precise time entry. It's a significant usability blocker but the filter can still be operated (with difficulty, or via typing) without this fix, so it ranks below the core filtering bug.

**Independent Test**: Open the "From" picker, select a date, then change the hour, then change the minute, all without the picker closing. Confirm the selection via the confirm control and verify the field shows the chosen date, hour, and minute. Repeat, but dismiss by clicking outside the picker instead of using the confirm control, and confirm the same result.

**Acceptance Scenarios**:

1. **Given** the time range picker is open, **When** the user selects a date from the calendar, **Then** the picker remains open and reflects the selected date.
2. **Given** the time range picker is open, **When** the user changes the hour and/or minute, **Then** the picker remains open and reflects the new hour/minute.
3. **Given** the picker is open with an in-progress date/hour/minute selection, **When** the user activates the picker's confirm control, **Then** the field's value is updated to the selected date, hour, and minute, and the picker closes.
4. **Given** the picker is open with an in-progress date/hour/minute selection, **When** the user clicks or interacts outside the picker, **Then** the field's value is updated to the selected date, hour, and minute (same as confirming), and the picker closes.
5. **Given** the picker is open and the user has not changed anything, **When** the user confirms or clicks outside, **Then** the field's value is unchanged and the picker closes.

---

### User Story 3 - Clear resets to the file's full time span (Priority: P3)

A user has narrowed the time range to investigate a specific window and now wants to go back to viewing/searching the whole file. Today, clicking "Clear" empties both fields, removing the helpful default values entirely. Instead, "Clear" should restore the "From" and "To" fields to the file's first and last line timestamps.

**Why this priority**: This is a refinement of an existing convenience (the pre-filled default span from a prior feature). It improves the workflow but the user can still manually re-type or re-pick a wide range without it.

**Independent Test**: Open a file with a detected timestamp format and known first/last line timestamps. Edit "From" and/or "To" away from the defaults. Click "Clear" and confirm both fields now show the file's first and last line timestamps (not empty).

**Acceptance Scenarios**:

1. **Given** "From" and/or "To" have been edited away from the file's default span, **When** the user activates "Clear", **Then** "From" is set to the file's first line timestamp and "To" is set to the file's last line timestamp.
2. **Given** "From" and "To" already show the file's default span, **When** the user activates "Clear", **Then** the fields remain at the default span (no visible change).
3. **Given** the result of activating "Clear" (the default span), **When** the user runs a search, **Then** results are filtered as described in User Story 1 using the default span as the active range.

---

### Edge Cases

- A file has no lines with a recognizable timestamp, so no default span exists: activating "Clear" leaves both fields empty (there is no default to revert to), matching the pre-existing behavior for files without a computable span.
- "From" is set later than "To": filtering produces no results, since no line's timestamp can satisfy both bounds — this is a direct consequence of the inclusive-range filtering and does not require special-case handling.
- The user opens the picker for "From", makes changes, and then opens the picker for "To" without confirming "From" first: opening the "To" picker counts as interacting outside the "From" picker, so the "From" selection is committed and its picker closes.
- A file without a detected timestamp format: the time range controls remain hidden, as today; none of the above changes apply.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When both "From" and "To" bounds are set, the system MUST restrict search results to lines whose timestamp falls within the inclusive ["From", "To"] range.
- **FR-002**: When only "From" is set, the system MUST restrict search results to lines whose timestamp is at or after "From"; when only "To" is set, the system MUST restrict results to lines whose timestamp is at or before "To".
- **FR-003**: When the time range fields hold the file's full default span (the first and last line timestamps), search results MUST include all matches in the file, i.e. the default span MUST NOT exclude any line that actually falls within it.
- **FR-004**: Within an open time range picker, selecting a calendar date MUST update the picker's in-progress selection without closing the picker.
- **FR-005**: Within an open time range picker, changing the hour or the minute MUST update the picker's in-progress selection without closing the picker.
- **FR-006**: The picker MUST provide an explicit confirm control that, when activated, applies the in-progress date/hour/minute selection to the field's value and closes the picker.
- **FR-007**: Clicking or otherwise interacting outside an open picker MUST apply the in-progress selection to the field's value and close the picker, with the same result as activating the confirm control (FR-006).
- **FR-008**: Once a picker is closed via FR-006 or FR-007, the field's displayed text MUST reflect the newly committed value, and that value MUST become the active bound used for filtering (FR-001/FR-002).
- **FR-009**: Activating "Clear" on a file whose first and last line timestamps are known MUST set "From" to the first line's timestamp and "To" to the last line's timestamp.
- **FR-010**: Activating "Clear" on a file with no known first/last line timestamps MUST leave "From" and "To" empty.

### Key Entities

- **Time Range Filter**: The "From" and "To" bounds (timestamps) used to restrict search results to lines within the selected window, per file.
- **File Time Span**: The timestamps of a file's first and last lines containing a recognizable timestamp; used both as the initial pre-filled values and as the target of the "Clear" reset.
- **Picker In-Progress Selection**: The date, hour, and minute currently chosen within an open picker, prior to being committed to the field's value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After setting a time range and running a search, 100% of returned matches have timestamps within the selected range.
- **SC-002**: A user can select a date and adjust both the hour and minute for a single field within one picker session, needing only one confirming action (button or click-away) to apply all three changes together.
- **SC-003**: After activating "Clear" on a file with a known time span, both fields immediately show the file's first and last line timestamps rather than being empty.
- **SC-004**: Users no longer experience the picker closing as a side effect of changing the hour or minute — every hour/minute change during a picker session keeps the picker open until the user explicitly confirms or clicks away.

## Assumptions

- The time range filter applies to search results, consistent with its existing role established in prior features (it restricts which matching lines are returned by a search); this spec fixes that restriction so it actually takes effect, without introducing a separate filter on the unfiltered log view.
- "Confirm" covers the combined date, hour, and minute selection as a single unit — partial edits (e.g., changing just the hour) do not take effect until the picker is confirmed or dismissed via an outside interaction.
- Clicking outside the picker is treated identically to activating the confirm control, per the user's explicit request.
- The inclusive-range semantics and per-file independence of time range state established by prior features are unchanged by this spec.
