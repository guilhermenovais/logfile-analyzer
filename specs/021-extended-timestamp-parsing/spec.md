# Feature Specification: Extended Timestamp Format Parsing

**Feature Branch**: `021-extended-timestamp-parsing`  
**Created**: 2026-06-24  
**Status**: Draft  
**Input**: User description: "Some timestamp formats are still not recognized and parsed by the app, like 12-06-2026 00:00:00.007 and Dec 24 06:55:48. Make the app support it, and also do some research and add support to other common patterns that are still not supported."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a log file with day-first date timestamps (Priority: P1)

A user opens a log file whose lines begin with a timestamp written as `DD-MM-YYYY HH:MM:SS[.fff]` (or with `/` separators), a convention widely used in European-locale systems and many enterprise logging tools. For example, `12-06-2026 00:00:00.007` represents June 12, 2026. Today the application does not recognize this format, so the file is treated as having no timestamps.

**Why this priority**: This is one of the two formats the user explicitly reported as broken. It is also a very common format in logs from systems configured with European locale conventions.

**Independent Test**: Open a log file whose lines begin with `DD-MM-YYYY HH:MM:SS.fff` timestamps. Verify the file is reported as having a recognized timestamp format, and that searching/filtering by a time range returns only matches within that range.

**Acceptance Scenarios**:

1. **Given** a log file where the large majority of lines begin with timestamps like `12-06-2026 00:00:00.007`, **When** the file is opened and indexed, **Then** the file is reported as having a recognized timestamp format.
2. **Given** such a file has been opened and indexed, **When** a user searches with a start and/or end time, **Then** only lines whose timestamp falls within that range are returned.
3. **Given** a log file using slash separators like `12/06/2026 00:00:00.007`, **When** the file is opened and indexed, **Then** the file is recognized and parsed identically to the dash-separator variant.

---

### User Story 2 - Open a log file with syslog-style timestamps (Priority: P2)

A user opens a log file whose lines begin with the traditional BSD/syslog timestamp format: a three-letter abbreviated month name, day of month, and time of day, such as `Dec 24 06:55:48`. This format is the default output of syslog on most Unix/Linux systems and is extremely common in system-level log files. Today the application does not recognize this format.

**Why this priority**: This is the second format the user explicitly reported as broken. Syslog is one of the most widespread logging formats in the Unix/Linux ecosystem, and the application is a log file analyzer that should handle the most common system log formats.

**Independent Test**: Open a log file whose lines begin with `MMM DD HH:MM:SS` timestamps. Verify the file is reported as having a recognized timestamp format, and that time-range filtering works correctly.

**Acceptance Scenarios**:

1. **Given** a log file where the large majority of lines begin with timestamps like `Dec 24 06:55:48`, **When** the file is opened and indexed, **Then** the file is reported as having a recognized timestamp format.
2. **Given** such a file has been opened and indexed, **When** a user searches with a start and/or end time, **Then** only lines whose timestamp falls within that range are returned.
3. **Given** a log file with single-digit day values like `Dec  4 06:55:48` (padded with a space), **When** the file is opened and indexed, **Then** the timestamp is correctly parsed.

---

### User Story 3 - Open a log file with Apache/Nginx combined log format timestamps (Priority: P3)

A user opens a log file using the Apache or Nginx combined log format, where timestamps appear in brackets as `DD/Mon/YYYY:HH:MM:SS ±ZZZZ`, such as `[24/Dec/2026:06:55:48 +0000]`. This is the standard format for web server access logs and is one of the most common log formats on the internet.

**Why this priority**: While not explicitly reported by the user, this is one of the most prevalent log formats globally and is a natural extension of the requested work to support common patterns.

**Independent Test**: Open a web server access log file. Verify the file's timestamps are recognized and that time-range filtering works correctly.

**Acceptance Scenarios**:

1. **Given** a log file with Apache-style timestamps like `[24/Dec/2026:06:55:48 +0000]` within each line, **When** the file is opened and indexed, **Then** the file is reported as having a recognized timestamp format.
2. **Given** such a file has been opened and indexed, **When** a user searches with a start and/or end time, **Then** only lines whose timestamp falls within that range are returned.
3. **Given** a file with timezone offsets like `+0530` or `-0500`, **When** the timestamp is parsed, **Then** the offset is correctly applied when converting to the internal time representation.

---

### User Story 4 - Open a log file with US-style date timestamps (Priority: P4)

A user opens a log file whose lines begin with a timestamp written as `MM/DD/YYYY HH:MM:SS[.fff]`, a convention commonly used in US-locale systems and some Windows event logging tools. Today the application does not recognize this format.

**Why this priority**: Supports another common locale-specific date convention. Lower priority because it is less commonly the default in server/application logging than the European variant.

**Independent Test**: Open a log file whose lines begin with `MM/DD/YYYY HH:MM:SS` timestamps. Verify the file is reported as having a recognized timestamp format.

**Acceptance Scenarios**:

1. **Given** a log file where the large majority of lines begin with timestamps like `06/12/2026 00:00:00.007`, **When** the file is opened and indexed, **Then** the file is reported as having a recognized timestamp format with the month/day correctly distinguished.
2. **Given** such a file has been opened and indexed, **When** a user searches with a start and/or end time, **Then** only lines whose timestamp falls within that range are returned.

---

### User Story 5 - Existing timestamp formats continue to work (Priority: P5)

A user opens log files that use the timestamp formats already supported today (ISO-8601, space-separated `YYYY-MM-DD HH:MM:SS`, epoch seconds, epoch milliseconds). These files must continue to be recognized and behave exactly as before.

**Why this priority**: Protects existing functionality from regressions while the set of recognized formats is expanded.

**Independent Test**: Open log files using each of the previously supported formats and confirm detection and time-range filtering behave the same as before this change.

**Acceptance Scenarios**:

1. **Given** a log file using any of the previously supported timestamp formats, **When** the file is opened and indexed, **Then** it is reported as having a recognized timestamp format and time-range filtering behaves as it did before this change.

---

### Edge Cases

- A syslog file that spans a year boundary (e.g., lines from December and January): since syslog timestamps lack a year, the system must infer the year. Lines near a year boundary where the month rolls back from December to January should trigger a year rollover so timestamps remain monotonically increasing.
- A file where most lines start with a recognizable timestamp but some lines (e.g., multi-line stack traces or continuation lines) do not: the file's format must still be detected as long as the proportion of recognizable lines meets the existing detection threshold.
- A line that superficially resembles a timestamp but contains invalid values (e.g., `31-02-2026 00:00:00` or `Abc 99 25:00:00`) must not be treated as a match.
- Apache-style timestamps embedded within square brackets and not at the very start of the line (the IP address typically comes first in access logs): detection must look beyond just the first whitespace-delimited token for this format.
- Syslog timestamps with a single-digit day padded by a space (e.g., `Dec  4 06:55:48`) versus zero-padded (e.g., `Dec 04 06:55:48`): both must be recognized.
- A file mixing more than one of the supported formats across different lines: detection picks the single best-matching format for the file as a whole, consistent with the existing single-format-per-file detection model.
- DD-MM-YYYY versus MM-DD-YYYY ambiguity when both day and month values are 12 or less: since these are separate formats with separate detection, the system resolves this through the detection threshold (whichever format consistently matches across the majority of sampled lines wins).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect and parse timestamps written as `DD-MM-YYYY HH:MM:SS` with optional fractional seconds (`.fff` or `,fff`), using either dash (`-`) or slash (`/`) as date separators. Example: `12-06-2026 00:00:00.007`.
- **FR-002**: System MUST detect and parse timestamps written as `MM/DD/YYYY HH:MM:SS` with optional fractional seconds (`.fff` or `,fff`). Example: `06/12/2026 14:30:00`.
- **FR-003**: System MUST detect and parse the BSD/syslog timestamp format `MMM DD HH:MM:SS` (three-letter month abbreviation, space-padded or zero-padded day, time). Example: `Dec 24 06:55:48`.
- **FR-004**: For syslog timestamps that lack a year, the system MUST infer the year using the file's modification date. If a syslog timestamp's month is after the file modification month, the system MUST assign the previous year, handling year-boundary rollover for log files that span December–January.
- **FR-005**: System MUST detect and parse Apache/Nginx combined log format timestamps written as `DD/Mon/YYYY:HH:MM:SS ±ZZZZ`, optionally enclosed in square brackets. Example: `[24/Dec/2026:06:55:48 +0000]`.
- **FR-006**: For Apache-format timestamps with a timezone offset, the system MUST apply the offset when converting to the internal epoch-millisecond representation.
- **FR-007**: System MUST continue to detect and parse all previously supported timestamp formats (ISO-8601, space-separated `YYYY-MM-DD HH:MM:SS`, epoch seconds, epoch milliseconds) without any change in behavior.
- **FR-008**: When a recognized timestamp does not include timezone information, system MUST interpret it as UTC, consistent with the existing behavior for other formats without timezone data.
- **FR-009**: Format detection MUST evaluate all newly supported formats alongside the previously supported formats when sampling a file, selecting the format whose match ratio meets or exceeds the existing detection threshold.
- **FR-010**: For the Apache combined log format, detection MUST search beyond the first whitespace-delimited token since the timestamp typically appears after the client IP address and other fields in access log lines.
- **FR-011**: The set of candidate formats MUST be ordered so that more specific formats (e.g., ISO-8601) are preferred over more ambiguous formats (e.g., DD-MM-YYYY) when both could match.
- **FR-012**: A line that does not begin with (or contain, for Apache format) a timestamp matching the file's detected format MUST be treated as having no timestamp for that line, consistent with current behavior.
- **FR-013**: If a file's lines do not predominantly match any supported format at or above the existing detection threshold, the file MUST be reported as not having a recognized timestamp format, consistent with current behavior.

### Key Entities

- **Timestamp Format Profile**: The single timestamp format detected for a file (now drawn from an expanded set of recognized formats) together with how confidently it matches the sampled lines. Determines whether the file supports time-based search and filtering.
- **Line Timestamp**: The point in time associated with an individual log line, derived from that line's timestamp using the file's detected format. Used to include or exclude lines when a user searches or filters by time range.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A log file whose lines use `DD-MM-YYYY HH:MM:SS.fff`-style timestamps (one of the examples reported as broken) is recognized as having a timestamp format immediately after opening, where previously it was not.
- **SC-002**: A log file whose lines use the syslog `MMM DD HH:MM:SS` format (the other example reported as broken) is recognized as having a timestamp format immediately after opening, where previously it was not.
- **SC-003**: Users can successfully filter and search by time range in log files using any of the newly supported timestamp formats, with results matching what would be expected from the timestamps shown in the file.
- **SC-004**: Log files using any of the previously supported timestamp formats continue to be recognized and behave exactly as they did before this change, with no regressions.
- **SC-005**: Across a representative set of sample log files covering all newly and previously supported formats, the correct format is detected for each file.

## Assumptions

- The `12-06-2026` format from the user's example is interpreted as DD-MM-YYYY (day-first, European convention) based on context. Both DD-MM-YYYY and MM/DD/YYYY formats are supported as separate format types, distinguishable by their separator convention: dash or slash with day-first versus slash with month-first.
- For syslog timestamps that lack a year, the year is inferred from the log file's last-modification date. This is the most practical heuristic available without requiring user configuration, and matches the approach taken by widely used log analysis tools.
- The Apache/Nginx combined log format timestamp is the only newly supported format where the timestamp does not appear at the very beginning of the line. For this format, the parser searches for the bracketed timestamp pattern within the line.
- The existing sampling size and match-ratio threshold used for format detection remain unchanged; only the set of candidate formats evaluated against the sample is expanded.
- Each file continues to use exactly one detected timestamp format for all of its lines, consistent with the current single-format-per-file detection model.
- Month abbreviations in syslog and Apache formats are recognized in English only (Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec), consistent with the output of standard syslog implementations and web servers.
