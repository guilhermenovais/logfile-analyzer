# Feature Specification: Time Range Filter Behavior Fixes

**Feature Branch**: `010-fix-time-range-filter-behavior`
**Created**: 2026-06-15
**Status**: Draft
**Input**: User description: "I want to fix the behaviour of the time range filtering of the logs. Currently, when I change the range, nothing happens. The same original logs keep getting shown. Also, when the file is first loaded, the time range filter fields are not displayed. I have to close the app and open it again for them to be shown. Another problem is that the timezone of the time range selector fields may be different of the timezone of the logs, which may be confusing."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Time range filter restricts the main log view (Priority: P1)

A user opens a log file with a detected timestamp format. The main log view shows every line in the file. The user sets a "From" and/or "To" time on the time range filter, expecting the displayed log lines to immediately narrow to only those within the selected window. Today, changing the range has no visible effect — the same full set of lines remains displayed.

**Why this priority**: This is the core complaint — "nothing happens" when the range is changed. Without this, the time range filter provides no value for the primary way users read logs (browsing the main view), regardless of any effect it may have on search results.

**Independent Test**: Open a file with a detected timestamp format and a known time span. Narrow "From" and/or "To" to a sub-window that excludes some lines. Confirm the main log view immediately shows only lines whose timestamp falls within the new window. Widen the range back to the full span (or click "Clear") and confirm the previously hidden lines reappear.

**Acceptance Scenarios**:

1. **Given** a file with a detected timestamp format showing its full default span, **When** the user narrows "From" and/or "To" and commits the change, **Then** the main log view immediately shows only lines whose timestamp falls within the inclusive ["From", "To"] range.
2. **Given** a narrowed range is active, **When** the user widens "From"/"To" back toward the full span or activates "Clear", **Then** previously hidden lines that now fall within the range reappear in the main log view.
3. **Given** only "From" is set (no "To"), **When** the change is committed, **Then** the main log view shows only lines with a timestamp at or after "From".
4. **Given** only "To" is set (no "From"), **When** the change is committed, **Then** the main log view shows only lines with a timestamp at or before "To".
5. **Given** the selected range excludes every line in the file, **When** the change is committed, **Then** the main log view shows no lines, while clearly indicating that the file itself is not empty (e.g. distinct from the empty-file state).
6. **Given** a line has no individually detected timestamp (e.g. a wrapped/continuation line), **When** time range filtering is active, **Then** that line's inclusion is determined by the timestamp of the nearest preceding line that has one, consistent with how such lines are already treated when filtering search results.

---

### User Story 2 - Time range fields appear as soon as the file is ready (Priority: P2)

A user adds or selects a log file. Its timestamp format and time span are detected asynchronously. Today, the time range fields stay hidden until the user closes and reopens the app — even after detection has completed — so the user may not discover the feature at all on first use.

**Why this priority**: This blocks discoverability of the feature on first use. It's independent of User Story 1: even once range changes correctly filter the view, the controls must actually be visible for the user to operate them without a workaround.

**Independent Test**: Add a new log file with a detectable timestamp format to the workspace and select it right away (before detection would normally have completed on a prior run). Confirm the time range fields appear, pre-filled with the file's first and last line timestamps, as soon as detection completes — without closing and reopening the app.

**Acceptance Scenarios**:

1. **Given** a newly added file whose timestamp-format detection completes while the file is already selected, **When** detection completes, **Then** the time range fields appear and are pre-filled with the file's first and last line timestamps, without requiring the application to be restarted.
2. **Given** a file already known to have a detected timestamp format, **When** the file is selected, **Then** the time range fields are visible immediately.
3. **Given** a file without a detectable timestamp format, **When** the file is selected, **Then** the time range fields remain hidden, unchanged from current behavior.

---

### User Story 3 - Time range reflects the log's own timezone (Priority: P3)

A user opens a log file whose timestamps are written in a different timezone than their computer's local timezone. Today, the "From"/"To" fields show and accept times in the browser's local timezone, while the log lines display their timestamps as written in the file's own timezone — so the same displayed value in the picker and in a log line can represent different instants, making it unclear which lines a given range actually selects.

**Why this priority**: Once User Story 1 makes the range filter functional, this ensures the values users see and type in the picker correspond directly to the timestamps they see in the log lines. It's a correctness/clarity refinement on top of a working filter, so it ranks below making the filter work at all.

**Independent Test**: Open a log file whose timestamps carry an explicit UTC offset (or are known to be treated as UTC) that differs from the browser's local timezone. Confirm the pre-filled "From"/"To" values match the wall-clock time printed on the file's first/last lines (not shifted by the local/UTC offset). Type a "From"/"To" value equal to a specific visible line's timestamp and confirm that line is included at the boundary.

**Acceptance Scenarios**:

1. **Given** a file whose detected timestamps carry an explicit UTC offset, **When** the time range fields are pre-filled or displayed, **Then** the displayed "From"/"To" values match the wall-clock time printed in the log lines (expressed in the log's offset, not the browser's local offset).
2. **Given** a file whose timestamps carry no explicit offset (treated as UTC per existing detection rules), **When** the time range fields are pre-filled or displayed, **Then** the displayed "From"/"To" values are expressed in UTC, matching the wall-clock values printed in the log lines.
3. **Given** the user types a "From"/"To" value, **When** the change is committed, **Then** the value is interpreted in the same timezone as the log's timestamps (per Scenarios 1-2) when computing the filtering boundary used by User Story 1.
4. **Given** a file without a detected timestamp format, **When** no time range fields are shown, **Then** no timezone behavior applies, unchanged from current behavior.

---

### Edge Cases

- A file has no lines with a recognizable timestamp (no detected timestamp format): time range controls remain hidden and the main log view is unaffected, matching existing behavior.
- "From" is set later than "To": the main log view shows no lines, consistent with the inclusive-range semantics already established for filtering search results.
- The time range fields hold the file's full default span (first/last line timestamps, unedited): the main log view shows all lines, same as before this feature.
- A file's timestamps mix formats with and without an explicit UTC offset: lines without an explicit offset are treated as UTC (consistent with existing timestamp-detection rules), and the time range fields for that file operate in UTC.
- The search results panel is open while a time range edit changes the main log view's visible lines: search match highlighting and navigation continue to apply to whichever results remain visible, consistent with the existing per-file time range filtering of search results.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For a file with a detected timestamp format, the main log view MUST display only lines whose timestamp falls within the inclusive ["From", "To"] range currently set for that file.
- **FR-002**: When only "From" is set, the main log view MUST show only lines with a timestamp at or after "From"; when only "To" is set, MUST show only lines with a timestamp at or before "To"; when neither is set, all lines MUST be shown.
- **FR-003**: Committing a change to "From" or "To" — including via "Clear" — MUST update the main log view's visible lines immediately, without requiring the user to run a search or take any other action.
- **FR-004**: A line without its own detected timestamp MUST be included or excluded based on the timestamp of the nearest preceding line that has one, consistent with existing time-range handling for search results.
- **FR-005**: When the time range fields hold the file's full default span (first/last line timestamps, unedited), the main log view MUST show all lines — the default span MUST NOT exclude any line.
- **FR-006**: For a file with a detected timestamp format, the time range fields MUST become visible as soon as that detection (and the file's first/last line timestamps) become available — including when this happens after the file has already been selected — without requiring the application to be restarted.
- **FR-007**: The time range fields MUST be pre-filled with the file's first and last line timestamps as soon as those become available.
- **FR-008**: The time range fields MUST display and accept values expressed in the same timezone as the file's detected log timestamps: the embedded UTC offset for formats that carry one, or UTC for formats that do not, consistent with existing timestamp-detection rules.
- **FR-009**: Values entered into the time range fields MUST be interpreted in the timezone determined by FR-008 when converting to the internal bound used for filtering (FR-001/FR-002).
- **FR-010**: The existing inclusive-range semantics, per-file independence, and search-result time range filtering established by prior features MUST continue to apply, operating consistently with the main-view filtering introduced by FR-001-FR-003.

### Key Entities

- **Time Range Filter**: The "From"/"To" bounds (timestamps), per file, now restricting both the main log view's visible lines and search results.
- **File Time Span**: The file's first and last line timestamps, used as default bounds and as the target of "Clear"; expressed in the file's detected log timestamp timezone (see below).
- **Log Timestamp Timezone**: The timezone — an explicit UTC offset, or UTC by default — in which a file's detected timestamps, and therefore its time range fields, are expressed.
- **Displayed Log View**: The set of lines shown to the user for a file, derived from the full line list narrowed by the active Time Range Filter when one is set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After committing a change to "From" and/or "To", the main log view updates to show only in-range lines with no further user action required.
- **SC-002**: For files with a detected timestamp format, 100% of lines visible in the main log view have a timestamp (own or inherited) within the active ["From", "To"] range.
- **SC-003**: Time range fields are visible and pre-filled within the same load time as the rest of the log view the first time a file is opened — no app restart is needed.
- **SC-004**: For a log file whose timestamps include an explicit UTC offset different from the user's local timezone, the values shown in "From"/"To" match the wall-clock time printed in the corresponding log lines, with zero discrepancy.

## Assumptions

- "Filtering the main log view" means narrowing which of the file's existing lines are displayed; it does not reorder, re-index, or modify the underlying file or its index.
- Lines without their own detected timestamp inherit the nearest preceding timestamped line's timestamp for range purposes, mirroring how prior features already treat such lines when filtering search results.
- A single file has one consistent log timestamp timezone for the purposes of FR-008/FR-009: the offset embedded in offset-bearing formats, or UTC for naive formats, consistent with existing per-format detection rules. Files that mix inconsistent explicit offsets across lines are out of scope for special-casing beyond this rule.
- The inclusive-range semantics, per-file independence, and pre-fill/"Clear" behavior established by feature 009 are preserved and now apply uniformly to both the main log view and search results.
- Highlighted lines, search match indices, and line-selection state continue to refer to line indices in the underlying file. When the main view's visible lines change due to a time range edit, currently-selected or highlighted lines that fall outside the range are simply not rendered (their state is preserved, not deleted), consistent with how the existing "Highlighted only" filter already behaves.
