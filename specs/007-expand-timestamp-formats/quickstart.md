# Quickstart: Verifying Expanded Timestamp Format Support

This feature is backend-only (`src-tauri/src/logfile/timestamp.rs` and
`src-tauri/src/state.rs`). Verification is primarily via `cargo test`, plus a
manual end-to-end check using the app and/or the MCP server.

## Automated

```bash
cd src-tauri
cargo test logfile::timestamp
cargo clippy -- -D warnings
cargo fmt --check
```

Expect new passing cases covering:
- `2026-05-21 18:14:06.043` -> detected as `SpaceSeparated`, parsed to the
  expected epoch-ms (FR-001 / User Story 1).
- `2026-05-21 18:14:06,043` -> detected as `SpaceSeparated`, comma normalized
  to the same epoch-ms as the `.043` case (FR-002 / User Story 2).
- `2026-05-21 18:14:06` (no fraction) -> detected as `SpaceSeparated`,
  nanoseconds = 0 (FR-003 / User Story 2).
- Existing `Iso8601` / `EpochSeconds` / `EpochMillis` cases still pass
  unchanged (FR-004 / FR-005 / User Story 3).
- A line with an out-of-range value (e.g. month `13`) is not matched as
  `SpaceSeparated` (Edge Cases).
- A sample mixing `Iso8601` and `SpaceSeparated` lines still detects the
  dominant format correctly (Edge Cases - mixed formats).

## Manual (app)

1. Build/run the app (`npm run tauri dev` or equivalent).
2. Open a log file whose lines start with `2026-05-21 18:14:06.043 ...`
   (e.g. the file already present in this workspace, alias `file`, which
   reproduces the originally-reported bug at line 1).
3. Confirm the file's properties now report a recognized timestamp format
   (`has_timestamp_format: true`) - in the UI this enables the time-range
   filter inputs in `SearchBar` (`hasTimestampFormat` prop).
4. Enter a time range (`time_from`/`time_to`) that includes only some of the
   file's lines and confirm search results are limited to that range
   (SC-002).
5. Repeat steps 2-4 with sample files using `2026-05-21 18:14:06,043` and
   `2026-05-21 18:14:06` (no fraction) leading timestamps.
6. Repeat steps 2-4 with a file using the previously-supported ISO-8601
   (`2026-06-12T10:00:00Z` / with offset) and epoch-second/-millisecond
   formats, confirming behavior is unchanged (SC-003).

## Manual (MCP)

Using the `logfile-analyzer` MCP server's `get_file_properties` /
`search_with_context` tools against a file with `YYYY-MM-DD
HH:MM:SS[.,]mmm`-style timestamps:
- `get_file_properties` -> `has_timestamp_format: true` (SC-001).
- `search_with_context` with `time_from`/`time_to` (still ISO-8601 strings,
  research.md §7) returns only lines whose leading timestamp falls within
  that range.
