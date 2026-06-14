# Research: Expand Supported Log Timestamp Formats

## Context

`src-tauri/src/logfile/timestamp.rs` already implements sample-based format
detection (`detect_format`, `SAMPLE_SIZE = 1000`, `DETECTION_THRESHOLD =
0.70`) and per-line epoch-ms extraction (`extract_timestamp`,
`detect_and_parse`) for three formats: `Iso8601`, `EpochSeconds`,
`EpochMillis` (`TimestampFormat` in `src-tauri/src/state.rs`). The reported
bug was confirmed against the user's open file (`get_file_properties` ->
`has_timestamp_format: false`; line 1 -> `"2026-05-21 18:14:04.274 [main]
INFO  com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting..."`),
which is exactly the `YYYY-MM-DD HH:MM:SS.mmm` format from FR-001/SC-001.

## 1. How many new `TimestampFormat` variants are needed?

**Decision**: Add a single new variant, `TimestampFormat::SpaceSeparated`,
that covers all three space-separated sub-formats from FR-001-FR-003:
- `YYYY-MM-DD HH:MM:SS.mmm` (period-decimal fraction)
- `YYYY-MM-DD HH:MM:SS,mmm` (comma-decimal fraction)
- `YYYY-MM-DD HH:MM:SS` (no fraction)

**Rationale**: chrono's `%.f` fixed-format specifier is *optional* when
parsing - if the remaining input doesn't start with `.`, it simply sets
nanoseconds to 0 and consumes nothing (`chrono-0.4.45/src/format/parse.rs`,
`Fixed::Nanosecond` arm: `if s.starts_with('.') { ... }`). So the single
format string `"%Y-%m-%d %H:%M:%S%.f"` already parses both
`2026-05-21 18:14:06.043` and `2026-05-21 18:14:06` correctly. Comma-decimal
inputs only need a one-character normalization (see §2) before the same
format string applies. One variant means:
- One extra chrono parse attempt per sampled/indexed line (alongside the
  existing 3), not three.
- One detection bucket whose `match_ratio` already reflects "any of the
  newly supported space-separated conventions", which is what FR-007's
  "evaluate the newly supported formats alongside the previously supported
  formats" requires - the spec does not require distinguishing *which*
  sub-format a file uses, only that the file-wide format is detected and
  used consistently (FR-008, Assumptions: "exactly one detected timestamp
  format for all of its lines").

**Alternatives considered**:
- *Three variants* (`SpaceSeparatedDot`, `SpaceSeparatedComma`,
  `SpaceSeparatedNone`), one per FR. Rejected: triples the candidate-format
  loop and test matrix for no behavioral benefit, and risks splitting a
  single file's match ratio across two of the three buckets if a file mixes
  e.g. a few no-fraction lines among mostly period-decimal lines (each line
  would only count toward one bucket, potentially pushing both below the
  0.70 threshold even though "space-separated" overall would clear it).
  Violates Principle III (simplicity) for no spec-mandated reason.
- *Regex-based detection* for the new format. Rejected: `regex` is already a
  dependency (used elsewhere for search), but chrono's `NaiveDateTime::
  parse_from_str` already validates calendar/time-of-day range correctness
  (rejects month `13`, etc. - Edge Cases) for free, which a hand-written
  regex would not; reusing chrono keeps validation centralized.

## 2. How to handle the comma-decimal variant (FR-002) given chrono only accepts `.`?

**Decision**: Before parsing, normalize the *time* token by replacing the
first `,` with `.` (`time_token.replacen(',', ".", 1)`), then parse the
joined `"{date} {normalized_time}"` with `"%Y-%m-%d %H:%M:%S%.f"`.

**Rationale**: Verified against
`chrono-0.4.45/src/format/parse.rs` - all of `%f`/`%.f`/`%3f`/`%6f`/`%9f`
either require a literal leading `.` (`Nanosecond*` with dot) or a fixed
digit count with *no* separator (`Nanosecond{3,6,9}NoDot`, used by `%3f`
etc.). None of chrono's built-in specifiers accept `,` directly, and the
fixed-width no-dot variants would force guessing whether a comma-decimal
file uses 3, 6, or 9 fractional digits. A one-character `replacen` is the
simplest normalization, handles any fractional-digit width via the existing
optional `%.f`, and only runs for the `SpaceSeparated` candidate - it has no
effect on (and adds negligible cost to) lines without a comma.

**Alternatives considered**:
- Format strings `"%Y-%m-%d %H:%M:%S,%3f"` / `,%6f` / `,%9f` tried in
  sequence. Rejected: requires 3 extra parse attempts per line for the
  comma case and still can't handle a comma-decimal file with, say, 1 or 2
  fractional digits (an edge case the no-dot specifiers reject as
  `TOO_SHORT`/`TOO_LONG`), whereas `%.f` after normalization accepts 1-9
  digits.

## 3. Token extraction: one token vs. two

**Decision**: `extract_timestamp` gains a dedicated branch for
`SpaceSeparated` that reads the first **two** whitespace-separated tokens
(date, time) via `line.split_whitespace()`, vs. the existing formats which
only need the first token. A new private helper,
`parse_space_separated(line: &str) -> Option<i64>`, encapsulates: take 2
tokens -> normalize comma in the time token -> join with a single space ->
`NaiveDateTime::parse_from_str(..., "%Y-%m-%d %H:%M:%S%.f")` ->
`.and_utc().timestamp_millis()` (FR-006: no-timezone => UTC, matching the
existing ISO-8601-without-offset behavior in `parse_iso8601`).

**Rationale**: Keeps the existing single-token formats untouched (no
behavior change, satisfying FR-004/FR-005/User Story 3) and isolates the
two-token logic in one small function that mirrors the existing
`parse_iso8601`/`parse_epoch` helpers' style.

## 4. False-positive risk against existing formats

**Decision**: No additional guarding needed beyond chrono's own strict
literal matching.

**Rationale**: For an ISO-8601 line (`2026-06-12T10:00:00Z connected`), the
first token is `2026-06-12T10:00:00Z` - attempting `%Y-%m-%d` against it
fails as soon as the parser reaches the `T` where a `-` or end-of-field is
expected, so `parse_space_separated` returns `None`. For epoch lines
(`1781258400000 connected`), the first token is all digits with no `-`
separators, so `%Y-%m-%d` fails immediately. This was spot-checked against
the existing `detect_format_picks_iso8601_when_dominant` /
`..._epoch_millis_..." / "..._epoch_seconds_..."` style fixtures by reasoning
through chrono's parser; new unit tests add explicit coverage (a mixed file
with both ISO-8601 and space-separated lines, per the spec's mixed-format
edge case) to lock this in.

## 5. Detection order / `CANDIDATE_FORMATS`

**Decision**: Append `TimestampFormat::SpaceSeparated` to
`CANDIDATE_FORMATS` (after the existing three). `detect_format`'s per-format
counting and `max_by(match_ratio)` selection logic needs no other changes -
it already iterates whatever is in `CANDIDATE_FORMATS` and treats each
format's count independently.

**Rationale**: Minimal diff; preserves existing ISO-8601-first preference
order documented in the const's comment for the (vanishingly unlikely, per
Edge Cases) case of an exact tie in match ratio.

## 6. Frontend / IPC / bindings impact

**Decision**: None. No changes to `src/`, `src/bindings/index.ts`,
`src/ipc/`, capabilities, or the SQLite schema.

**Rationale**: `TimestampFormat` and `TimestampFormatProfile` derive
`specta::Type` but are not part of any `#[specta]`-registered command or
event payload - only the pre-existing `has_timestamp_format: bool` (already
in `src/bindings/index.ts` via `FileProperties`/`LogFileEntry`-shaped types)
crosses the IPC boundary. Confirmed via `grep -c "TimestampFormat"
src/bindings/index.ts` -> `0`. Adding a new enum variant therefore does not
change any generated TypeScript and requires no bindings regeneration.

## 7. Query-bound (`time_from`/`time_to`) parsing

**Decision**: Out of scope - `parse_iso8601` (used by
`mcp::tools::parse_time_bound` for the MCP `search_with_context` tool's
`time_from`/`time_to` strings, and unused by the frontend `searchLogs`/
`searchWithContext` commands which already pass epoch-ms `f64`) is not
changed.

**Rationale**: FR-001-FR-009 are about recognizing timestamps *within log
lines*; the MCP tool's query-bound strings are a separate, already-ISO-8601
input contract (`contracts/mcp-tools.md` from 001) that the spec does not
ask to change. SC-002 ("filter and search by time range... with results
matching what would be expected from the timestamps shown in the file")
is satisfied purely by `line_timestamps` now being populated for the new
formats - the bound itself is still supplied as epoch-ms (UI) or ISO-8601
(MCP), unchanged.

## 8. File size / Principle III

**Decision**: Accept `src-tauri/src/logfile/timestamp.rs` growing from 262
lines to roughly 310-330 lines (new variant, `parse_space_separated` helper,
~6 new `#[cfg(test)]` cases for FR-001-FR-003, the invalid-value edge case,
and the mixed-format regression). No file split.

**Rationale**: This stays in line with this file's existing siblings in
`src-tauri/src/logfile/`, which already exceed the nominal 300-line Rust
guideline with inline `#[cfg(test)] mod tests` blocks (`query.rs`: 301
lines, `search.rs`: 312 lines) - i.e. this is the established convention for
this directory, not a new violation. Per the constitution's Development
Workflow guidance ("follow its existing conventions... flag the
inconsistency to the user rather than silently fixing it"), this is flagged
in `plan.md`'s Constitution Check rather than worked around (e.g. by
splitting tests into a separate file, which no sibling in this directory
does).
