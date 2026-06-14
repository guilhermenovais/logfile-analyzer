# Data Model: Expand Supported Log Timestamp Formats

No new persisted entities, tables, or columns. This feature extends two
existing in-memory types in `src-tauri/src/state.rs` and the parsing logic
in `src-tauri/src/logfile/timestamp.rs` that operate on them.

## TimestampFormat (extended)

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum TimestampFormat {
    Iso8601,
    EpochSeconds,
    EpochMillis,
    SpaceSeparated, // NEW
}
```

- **`Iso8601`, `EpochSeconds`, `EpochMillis`**: unchanged (FR-004, FR-005,
  User Story 3).
- **`SpaceSeparated`** (NEW): a single date+time token pair of the form
  `YYYY-MM-DD HH:MM:SS` followed by an optional fractional-seconds part
  introduced by `.` or `,` (FR-001-FR-003). Covers:
  - `2026-05-21 18:14:06.043`
  - `2026-05-21 18:14:06,043`
  - `2026-05-21 18:14:06`

Not part of any IPC/MCP-serialized payload reachable from
`src/bindings/index.ts` (research.md §6), so this addition has no
frontend-visible effect.

## TimestampFormatProfile (unchanged)

```rust
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct TimestampFormatProfile {
    pub format: TimestampFormat,   // may now be `SpaceSeparated`
    pub match_ratio: f64,          // unchanged: count(matches) / sample_size, >= 0.70
}
```

Stored in `FileIndex.timestamp_profile` exactly as today; only the set of
possible `format` values grows.

## Line Timestamp (unchanged)

`FileIndex.line_timestamps: Option<Vec<Option<i64>>>` - one epoch-ms value
(or `None` if that line's leading tokens don't match the file's detected
format, FR-009) per line, populated by `parse_line_timestamps` using
whichever `TimestampFormat` was detected, including `SpaceSeparated`.

## Parsing algorithm for `SpaceSeparated` (new, in `timestamp.rs`)

```text
extract_timestamp(line, SpaceSeparated):
  tokens = line.split_whitespace()
  date_token = tokens.next()  -> None if absent
  time_token = tokens.next()  -> None if absent
  normalized_time = time_token.replacen(',', '.', 1)   # FR-002 normalization
  candidate = date_token + " " + normalized_time
  parse candidate with "%Y-%m-%d %H:%M:%S%.f" (NaiveDateTime)
    -> on success: .and_utc().timestamp_millis()        # FR-006: assume UTC
    -> on failure (incl. out-of-range month/day/time, Edge Cases): None
```

`%.f` is optional in chrono (matches 0 or 1-9 fractional digits introduced
by `.`), so the same format string handles all three sub-formats once the
comma (if any) has been normalized to a period.

## Detection (extended)

```rust
const CANDIDATE_FORMATS: &[TimestampFormat] = &[
    TimestampFormat::Iso8601,
    TimestampFormat::EpochMillis,
    TimestampFormat::EpochSeconds,
    TimestampFormat::SpaceSeparated, // NEW, appended
];
```

`detect_format` is otherwise unchanged: for each sampled line, it counts a
match per candidate format independently, then returns the
`TimestampFormatProfile` for whichever format has the highest `match_ratio`
that is `>= DETECTION_THRESHOLD` (0.70), or `None` if no format clears the
threshold (FR-010).
