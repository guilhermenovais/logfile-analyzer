# Feature Specification: Expand Supported Log Timestamp Formats

**Feature Branch**: `007-expand-timestamp-formats`
**Created**: 2026-06-14
**Status**: Draft
**Input**: User description: "The timestamp loading is not working correctly. For example, timestamps in this format 2026-05-21 18:14:06.043 are not being recognized. You can use the logfile-analyzer mcp to see an example of a file that didn't have the timestamps loaded. I want to fix this, enabling all of the most common timestamp formats to be loaded properly"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a log file with space-separated timestamps (Priority: P1)

A user opens a log file whose lines start with a timestamp written as a date and time separated by a space and including milliseconds (for example, `2026-05-21 18:14:06.043 [main] INFO ...`, the default format produced by many Java logging frameworks). Today the application does not recognize this as a timestamp at all, so the file is treated as having no timestamps.

**Why this priority**: This is the format reported as broken and is one of the most widely used log timestamp conventions (default output of common logging libraries). Without it, time-based filtering and search are unavailable for a large share of real-world log files.

**Independent Test**: Open a log file whose lines begin with `YYYY-MM-DD HH:MM:SS.mmm` timestamps. Verify the file is reported as having a recognized timestamp format, and that searching/filtering by a time range returns only matches within that range.

**Acceptance Scenarios**:

1. **Given** a log file where the large majority of lines begin with timestamps like `2026-05-21 18:14:06.043`, **When** the file is opened and indexed, **Then** the file is reported as having a recognized timestamp format.
2. **Given** such a file has been opened and indexed, **When** a user searches with a start and/or end time, **Then** only lines whose timestamp falls within that range are returned, and lines outside the range are excluded.
3. **Given** such a file has been opened and indexed, **When** a user requests the parsed time for an individual line, **Then** the time matches the timestamp shown at the start of that line, converted consistently with other supported formats.

---

### User Story 2 - Open a log file with comma-decimal or no-fraction timestamps (Priority: P2)

A user opens a log file using a closely related but slightly different convention: the date and time are separated by a space, and the fractional seconds (if present) are separated by a comma instead of a period (for example, `2026-05-21 18:14:06,043`), or there is no fractional-seconds portion at all (for example, `2026-05-21 18:14:06`). Both conventions are common outputs of other widely used logging frameworks and tools.

**Why this priority**: These are minor variations of the primary format and are also very common. Supporting them closes most of the remaining gap for everyday log files without requiring a separate effort.

**Independent Test**: Open log files using `YYYY-MM-DD HH:MM:SS,mmm` and `YYYY-MM-DD HH:MM:SS` (no fraction) timestamps respectively. Verify each file is reported as having a recognized timestamp format and that time-range filtering works correctly for each.

**Acceptance Scenarios**:

1. **Given** a log file where lines begin with timestamps like `2026-05-21 18:14:06,043`, **When** the file is opened and indexed, **Then** the file is reported as having a recognized timestamp format and time-range filtering works as in User Story 1.
2. **Given** a log file where lines begin with timestamps like `2026-05-21 18:14:06` (no fractional seconds), **When** the file is opened and indexed, **Then** the file is reported as having a recognized timestamp format and time-range filtering works as in User Story 1.

---

### User Story 3 - Existing timestamp formats continue to work (Priority: P3)

A user opens log files that use the timestamp formats already supported today (ISO-8601 timestamps with a `T` separator, and raw epoch-second or epoch-millisecond numbers). These files must continue to be recognized and behave exactly as before.

**Why this priority**: Protects existing functionality from regressions while the set of recognized formats is expanded. Lower priority only because it is a "no change expected" verification rather than new capability.

**Independent Test**: Open log files using each of the previously supported formats (ISO-8601 with and without timezone offset, epoch seconds, epoch milliseconds) and confirm detection and time-range filtering behave the same as before this change.

**Acceptance Scenarios**:

1. **Given** a log file using ISO-8601 timestamps (with or without a timezone offset), **When** the file is opened and indexed, **Then** it is reported as having a recognized timestamp format and time-range filtering behaves as it did before this change.
2. **Given** a log file using epoch-second or epoch-millisecond numeric timestamps, **When** the file is opened and indexed, **Then** it is reported as having a recognized timestamp format and time-range filtering behaves as it did before this change.

---

### Edge Cases

- A file where most lines start with a recognizable timestamp but some lines (e.g., multi-line stack traces or continuation lines) do not: the file's format must still be detected as long as the proportion of recognizable lines meets the existing detection threshold, and non-matching lines are simply treated as having no timestamp (unchanged from current behavior).
- A line that superficially resembles a timestamp but contains invalid values (e.g., a month of `13` or an out-of-range time) must not be treated as a match.
- A file whose lines use a year-less, syslog-style timestamp (e.g., `Jun 14 18:14:06`) is out of scope for this feature (see Assumptions) and is treated as today: no timestamp format is detected for it.
- A file mixing more than one of the newly and previously supported formats across different lines (not expected in real log files, but possible in malformed ones): detection picks the single best-matching format for the file as a whole, consistent with the existing single-format-per-file detection model.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect and parse timestamps written as a date and time separated by a single space, in the form `YYYY-MM-DD HH:MM:SS`, followed by an optional fractional-seconds component introduced by a period (`.`), e.g., `2026-05-21 18:14:06.043`.
- **FR-002**: System MUST detect and parse the same space-separated date/time form when the fractional-seconds component is introduced by a comma (`,`) instead of a period, e.g., `2026-05-21 18:14:06,043`.
- **FR-003**: System MUST detect and parse the same space-separated date/time form when no fractional-seconds component is present, e.g., `2026-05-21 18:14:06`.
- **FR-004**: System MUST continue to detect and parse the previously supported ISO-8601 timestamp formats (date and time separated by `T`, with optional fractional seconds and an optional UTC `Z` or numeric timezone offset) without any change in behavior.
- **FR-005**: System MUST continue to detect and parse the previously supported epoch-seconds and epoch-millisecond numeric timestamp formats without any change in behavior.
- **FR-006**: When a recognized timestamp does not include timezone information, system MUST interpret it as UTC, consistent with how timestamps without timezone information are already handled today.
- **FR-007**: Format detection MUST evaluate the newly supported formats alongside the previously supported formats when sampling a file, and select the format whose match ratio meets or exceeds the existing detection threshold, exactly as today's detection process does for the formats it already supports.
- **FR-008**: For a file whose format has been detected as one of the newly supported formats, every line MUST have its leading timestamp parsed using that format, so that time-range based search and filtering work the same way as they do today for previously supported formats.
- **FR-009**: A line that does not begin with a timestamp matching the file's detected format MUST be treated as having no timestamp for that line, without affecting detection or parsing of other lines, consistent with current behavior.
- **FR-010**: If a file's lines do not predominantly match any supported format (new or previously supported) at or above the existing detection threshold, the file MUST be reported as not having a recognized timestamp format, consistent with current behavior.

### Key Entities

- **Timestamp Format Profile**: The single timestamp format detected for a file (now drawn from an expanded set of recognized formats) together with how confidently it matches the sampled lines. Determines whether the file supports time-based search and filtering.
- **Line Timestamp**: The point in time associated with an individual log line, derived from that line's leading timestamp using the file's detected format. Used to include or exclude lines when a user searches or filters by time range.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A log file whose lines begin with `YYYY-MM-DD HH:MM:SS.mmm`-style timestamps (the example reported as broken) is recognized as having a timestamp format immediately after opening, where previously it was not.
- **SC-002**: Users can successfully filter and search by time range in log files using any of the newly supported timestamp formats (space-separated with period-decimal milliseconds, comma-decimal milliseconds, or no fractional seconds), with results matching what would be expected from the timestamps shown in the file.
- **SC-003**: Log files using any of the previously supported timestamp formats (ISO-8601, epoch seconds, epoch milliseconds) continue to be recognized and behave exactly as they did before this change, with no regressions.
- **SC-004**: Across a representative set of sample log files covering all newly and previously supported formats, the correct format is detected for each file.

## Assumptions

- The space-separated date/time formats (FR-001 to FR-003) cover the most common conventions seen in everyday application and server log files (e.g., default output of widely used Java, Python, and .NET logging frameworks), in addition to the ISO-8601 and epoch formats already supported.
- Timestamps without an explicit timezone are assumed to represent UTC, matching the existing assumption already applied to ISO-8601 timestamps without an offset. This keeps behavior consistent across all supported formats.
- Year-less timestamp formats (such as traditional syslog's `Mon DD HH:MM:SS`, which omits the year) are out of scope for this feature, since determining the correct year would require additional assumptions (e.g., file modification time or current date) beyond simply parsing the text. Files using such formats will continue to be reported as not having a recognized timestamp format, as they are today.
- Each file continues to use exactly one detected timestamp format for all of its lines, consistent with the current single-format-per-file detection model; this feature only expands the set of formats considered, not the detection model itself.
- The existing sampling size and match-ratio threshold used for format detection remain unchanged; only the set of candidate formats evaluated against the sample is expanded.
