# Data Model: Extended Timestamp Format Parsing

## §1 — TimestampFormat Enum (state.rs)

The `TimestampFormat` enum gains four new variants. No variants are removed or renamed.

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum TimestampFormat {
    // Existing
    Iso8601,
    EpochSeconds,
    EpochMillis,
    SpaceSeparated,
    // New
    DayFirst,       // DD-MM-YYYY HH:MM:SS[.fff] or DD/MM/YYYY HH:MM:SS[.fff]
    Syslog,         // MMM DD HH:MM:SS (no year)
    ApacheCombined, // [DD/Mon/YYYY:HH:MM:SS ±ZZZZ]
    MonthFirst,     // MM/DD/YYYY HH:MM:SS[.fff]
}
```

**Serialization**: `serde(rename_all = "snake_case")` produces `"day_first"`, `"syslog"`, `"apache_combined"`, `"month_first"`. The frontend does not consume these values directly (it only uses `has_timestamp_format: bool`), so the serialized names have no compatibility impact.

**specta/TypeScript binding**: The `specta::Type` derive will generate updated TS types, but since the frontend never pattern-matches on `TimestampFormat`, no frontend code changes are needed. The bindings file should be regenerated.

## §2 — CANDIDATE_FORMATS Array (timestamp.rs)

Updated preference order (research.md §4):

```rust
const CANDIDATE_FORMATS: &[TimestampFormat] = &[
    TimestampFormat::Iso8601,
    TimestampFormat::SpaceSeparated,
    TimestampFormat::ApacheCombined,
    TimestampFormat::Syslog,
    TimestampFormat::EpochMillis,
    TimestampFormat::EpochSeconds,
    TimestampFormat::DayFirst,
    TimestampFormat::MonthFirst,
];
```

## §3 — Parser Functions (timestamp.rs)

### parse_day_first(line: &str) -> Option<i64>

Extracts the first two whitespace-delimited tokens (`DD-MM-YYYY` and `HH:MM:SS[.fff]`), joins them, normalizes `,` → `.` in the time portion, and parses with `%d-%m-%Y %H:%M:%S%.f` (trying `-` separator) or `%d/%m/%Y %H:%M:%S%.f` (trying `/` separator). Returns epoch-ms (UTC).

Validation: chrono rejects invalid dates (month>12, day>31-for-month), so no additional validation is needed.

### parse_month_first(line: &str) -> Option<i64>

Same approach as `parse_day_first` but uses `%m/%d/%Y %H:%M:%S%.f` (slash separator only, per spec assumption). Returns epoch-ms (UTC).

### parse_syslog(line: &str, file_mtime: Option<SystemTime>) -> Option<i64>

1. Normalize leading double-space (`"MMM  D"`) to single-space.
2. Extract three whitespace-delimited tokens: month abbreviation, day, time.
3. Parse with `%b %-d %H:%M:%S` to get month, day, hour, minute, second.
4. Infer year from `file_mtime` (research.md §1): if parsed month > mtime month, use mtime year − 1; otherwise use mtime year. If `file_mtime` is `None`, use current year.
5. Construct `NaiveDateTime`, return epoch-ms (UTC).

### parse_apache_combined(line: &str) -> Option<i64>

1. Search line with compiled regex: `\[(\d{2}/[A-Z][a-z]{2}/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\]`
2. Parse captured group with `%d/%b/%Y:%H:%M:%S %z` → `DateTime<FixedOffset>`.
3. Return `timestamp_millis()` (offset automatically applied).

The regex is compiled once via `std::sync::OnceLock<regex::Regex>`.

## §4 — extract_timestamp Signature Change

Current: `pub fn extract_timestamp(line: &str, format: TimestampFormat) -> Option<i64>`

New: `pub fn extract_timestamp(line: &str, format: TimestampFormat, file_mtime: Option<SystemTime>) -> Option<i64>`

The `file_mtime` parameter is only used by the `Syslog` branch. All other branches ignore it. This keeps the function signature uniform and avoids splitting extraction into multiple functions.

All callers of `extract_timestamp` are updated to pass `file_mtime`:
- `detect_format` — receives it as a new parameter
- `parse_line_timestamps` — receives it as a new parameter
- `detect_and_parse` — receives it from `index_and_detect_timestamps`
- Tests — pass `None` for non-syslog tests, a specific `SystemTime` for syslog tests

## §5 — detect_and_parse Signature Change

Current: `pub fn detect_and_parse(mmap: &Mmap, index: &RwLock<FileIndex>)`

New: `pub fn detect_and_parse(mmap: &Mmap, index: &RwLock<FileIndex>, file_mtime: Option<SystemTime>)`

The caller (`index_and_detect_timestamps` in `commands/files.rs`) obtains the mtime:

```rust
let file_mtime = std::fs::metadata(&path_str)
    .and_then(|m| m.modified())
    .ok();
timestamp::detect_and_parse(&runtime.mmap, &runtime.index, file_mtime);
```

The file path (`path_str`) is looked up from the SQLite database via `runtime.file_id` before calling `detect_and_parse`.

## §6 — UTC Offset Detection for Apache Format

The existing `offset::detect_utc_offset_minutes` only handles ISO-8601 offsets. For Apache combined format, the offset is embedded in the timestamp itself and is applied during parsing (the `%z` specifier returns a `DateTime<FixedOffset>`). Therefore, `utc_offset_minutes` for Apache files should be set to `0` (all timestamps are already converted to UTC epoch-ms during parsing), consistent with how epoch formats work.

No change to `offset.rs` is needed.

## §7 — Validation Rules

All validation is handled by `chrono`'s parsers, which reject:
- Invalid month values (>12 or <1)
- Invalid day values (>31 or >28/29/30 for the specific month)
- Invalid time values (hour>23, minute>59, second>59)
- Malformed strings that don't match the format pattern

No additional validation code is needed. Invalid timestamps produce `None` from the parser functions, which is the existing convention.

## §8 — State Transitions

No new state transitions. The existing flow is unchanged:
1. File opened → `FileRuntime` created with empty `FileIndex`
2. Background thread runs `index_and_detect_timestamps`:
   a. `build_line_index` populates `line_offsets`
   b. `detect_and_parse` samples lines, detects format, parses all timestamps
   c. `timestamp_detection_complete` set to `true`
3. Frontend polls `get_file_properties` → sees `has_timestamp_format: true`

The only change is that step 2b now recognizes four additional formats.
