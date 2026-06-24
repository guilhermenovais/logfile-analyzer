# Quickstart: Extended Timestamp Format Parsing

## What This Feature Does

Adds support for four new timestamp formats in the log file analyzer's Rust backend, so files using these formats are automatically detected and support time-range filtering/search.

## Key Files to Modify

| File | Change |
|------|--------|
| `src-tauri/src/state.rs` | Add `DayFirst`, `Syslog`, `ApacheCombined`, `MonthFirst` to `TimestampFormat` enum |
| `src-tauri/src/logfile/timestamp.rs` | Add parser functions, update `CANDIDATE_FORMATS`, update `extract_timestamp` and `detect_and_parse` signatures |
| `src-tauri/src/commands/files.rs` | Pass file mtime to `detect_and_parse` |

## No-Change Files

- **Frontend (src/)**: No changes. The frontend only sees `has_timestamp_format: bool`.
- **`src-tauri/src/logfile/offset.rs`**: Apache offsets are handled during parsing, not by offset detection.
- **`src-tauri/src/logfile/view_filter.rs`**: Operates on epoch-ms timestamps, format-agnostic.
- **`src-tauri/src/logfile/query.rs`**: Operates on epoch-ms timestamps, format-agnostic.

## Build & Test

```bash
# Run all Rust tests (includes new timestamp format tests)
cargo test --manifest-path src-tauri/Cargo.toml

# Type-check frontend (should be no-op for this feature)
npx tsc --noEmit

# Lint
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

## Format Examples

| Format | Example Line | Parsed As (UTC) |
|--------|-------------|-----------------|
| DayFirst (dash) | `12-06-2026 00:00:00.007 INFO ...` | 2026-06-12T00:00:00.007Z |
| DayFirst (slash) | `12/06/2026 00:00:00.007 INFO ...` | 2026-06-12T00:00:00.007Z |
| Syslog | `Dec 24 06:55:48 host sshd[1234]: ...` | 2026-12-24T06:55:48Z (year from mtime) |
| Syslog (space-padded) | `Dec  4 06:55:48 host sshd[1234]: ...` | 2026-12-04T06:55:48Z |
| Apache combined | `127.0.0.1 - - [24/Dec/2026:06:55:48 +0000] "GET /"` | 2026-12-24T06:55:48Z |
| Apache w/ offset | `127.0.0.1 - - [24/Dec/2026:06:55:48 +0530] "GET /"` | 2026-12-24T01:25:48Z |
| MonthFirst | `06/12/2026 14:30:00.500 INFO ...` | 2026-06-12T14:30:00.500Z |

## Architecture Notes

- **Single format per file**: The detection model is unchanged — one format wins for the entire file.
- **Syslog year inference**: Uses file mtime. If parsed month > mtime month, assigns previous year (December→January rollover).
- **Apache mid-line**: Only format where timestamp is not at line start. Uses a compiled `regex::Regex` via `OnceLock`.
- **Day-first vs month-first**: Distinguished by separator convention (dashes → day-first, slashes → could be either; detection threshold resolves ambiguity).
