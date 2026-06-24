# Research: Extended Timestamp Format Parsing

## §1 — Syslog Year Inference Strategy

**Decision**: Infer the year from the log file's filesystem modification time (`mtime`). When a syslog timestamp's month is greater than the file's mtime month, assign the previous year (year-boundary rollover for December→January spans).

**Rationale**: Syslog timestamps (`Dec 24 06:55:48`) omit the year entirely. The file's mtime is the most reliable heuristic available without requiring user input — it is the approach used by `rsyslog`, `logwatch`, and other widely-deployed log analysis tools. The last line of a syslog file is typically written at or near the file's mtime, so the mtime's year is a safe default for most lines, with rollover logic needed only when the file spans a year boundary.

**Algorithm**:
1. Obtain the file's mtime as a `DateTime<Utc>` (via `std::fs::metadata` on the file path, which is already available in `FileRuntime` context).
2. Parse the month and day-of-month from the syslog timestamp.
3. If the parsed month is greater than the mtime's month, assign `mtime.year - 1` (the log entry is from the previous calendar year).
4. Otherwise, assign `mtime.year`.

**Alternatives considered**:
- *Current system date*: Less accurate for files that were written days/weeks ago and then opened for analysis.
- *User-supplied year*: Adds UI complexity and breaks the "just open a file" workflow.
- *Infer from surrounding lines*: Complex, fragile, and unnecessary when mtime is available.

**Threading**: The file path is not currently stored on `FileRuntime`, but `file_id` is, and the path is persisted in the SQLite `log_file_entries` table. `detect_and_parse` will accept an optional `file_mtime: Option<SystemTime>` parameter. The caller (`index_and_detect_timestamps` in `commands/files.rs`) will stat the file before calling it.

## §2 — Apache Combined Log Mid-Line Detection

**Decision**: Use a compiled `regex::Regex` (lazy-static or `std::sync::OnceLock`) to locate the Apache timestamp within a line: `\[(\d{2}/[A-Z][a-z]{2}/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\]`.

**Rationale**: The Apache combined log format places the timestamp after the client IP and identd/user fields: `127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /..."`. The existing `extract_timestamp` function extracts the first whitespace-delimited token, which works for all other formats. For Apache, we need to search the full line for the bracketed pattern.

**Algorithm**:
1. Apply the regex to the line.
2. If matched, parse the captured group with `chrono::NaiveDateTime::parse_from_str` using format `%d/%b/%Y:%H:%M:%S %z`.
3. The `%z` chrono format specifier parses `+0000`/`-0500` style offsets and returns a `DateTime<FixedOffset>`, from which we extract epoch-ms directly (offset is automatically applied).

**Alternatives considered**:
- *Search for `[` character and parse from there*: Fragile — square brackets can appear in other log fields. A regex with the full timestamp shape is more precise and still fast on 1000-line samples.
- *Require the timestamp at a fixed column offset*: Too brittle; IP address length varies (IPv4 vs IPv6, different address lengths).

**Performance note**: The regex is compiled once (via `OnceLock`) and reused for all lines. `regex` crate's `is_match` / `captures` on a single short line is sub-microsecond, so even 1000-line samples are negligible.

## §3 — Day-First vs Month-First Disambiguation

**Decision**: Distinguish by **separator convention**: dashes (`-`) and slashes (`/`) with day≤31 in position 1 are parsed as `DD-MM-YYYY` (European). Slashes with month≤12 in position 1 are parsed as `MM/DD/YYYY` (US). The detection threshold (70%) resolves cases where both could match — whichever format consistently parses across the majority of sampled lines wins.

**Rationale**: The spec explicitly states (Assumptions): "dash or slash with day-first versus slash with month-first." The user's original example `12-06-2026` uses dashes and is European. US-style logs almost universally use slashes. This convention-based split eliminates most real-world ambiguity.

**Edge case — both day and month ≤12**: Both formats will "match" such a line. The detection loop counts matches for each format independently and picks the one with the highest ratio. Since the two formats share no lines where they would produce *different* epoch-ms values when day==month, the file will still be usable (the parsed timestamps are identical). When day≠month for some lines, the "wrong" format will produce invalid dates (month>12 or day>31 for the month), naturally reducing its match ratio below the threshold.

**Parsing approach**: `chrono::NaiveDateTime::parse_from_str` with:
- `DayFirst`: `%d-%m-%Y %H:%M:%S%.f` and `%d/%m/%Y %H:%M:%S%.f`
- `MonthFirst`: `%m/%d/%Y %H:%M:%S%.f`

**Alternatives considered**:
- *Heuristic based on value ranges (day>12 → day-first)*: Works for some files but fails silently when all values are ≤12. The separator convention is more reliable and matches the spec's stated assumption.
- *User-selectable format*: Violates the "just works" detection model. Could be added later if needed.

## §4 — CANDIDATE_FORMATS Ordering

**Decision**: The preference-ordered list becomes:

1. `Iso8601` — most specific (T separator, optional Z/offset)
2. `SpaceSeparated` — `YYYY-MM-DD HH:MM:SS` (year-first disambiguates from day/month-first)
3. `ApacheCombined` — brackets + month abbreviation make it unambiguous
4. `Syslog` — month abbreviation + no year, moderately specific
5. `EpochMillis` — 12–13 digits
6. `EpochSeconds` — 9–10 digits
7. `DayFirst` — `DD-MM-YYYY` or `DD/MM/YYYY`
8. `MonthFirst` — `MM/DD/YYYY`

**Rationale**: FR-011 requires more-specific formats to be preferred over ambiguous ones. ISO-8601 and SpaceSeparated are the most specific because their `YYYY-` prefix cannot match day/month-first formats. Apache and Syslog use month abbreviations that are unambiguous. Epoch formats are next (pure digit strings of specific lengths). Day-first and month-first are last because they are the most ambiguous formats.

The ordering only matters when multiple formats exceed the detection threshold for the same file — the highest-ranked one wins. In practice, format specificity means at most one or two formats will match a given file's lines.

## §5 — Syslog Single-Digit Day Padding

**Decision**: Handle both space-padded (`Dec  4`) and zero-padded (`Dec 04`) day values.

**Rationale**: Traditional syslog uses space-padding (`%e` in strftime), but some implementations use zero-padding (`%d`). Both are common in the wild.

**Implementation**: Use `chrono`'s `%-d` (no-padding day) format specifier, which accepts both `4`, `04`, and ` 4`. Before parsing, normalize double-space padding to single-space to handle the `MMM  D` case: replace `"  "` (two spaces) with `" "` (one space) in the first 7 characters of the line before extracting the syslog fields.

## §6 — Comma vs Period Fractional Seconds

**Decision**: Support both `.fff` and `,fff` for the day-first and month-first formats, consistent with the existing SpaceSeparated parser.

**Implementation**: Reuse the same `replacen(',', ".", 1)` normalization used by `parse_space_separated`. Apply it to the time portion of the joined `date time` string before calling `chrono::NaiveDateTime::parse_from_str`.

## §7 — File mtime Propagation

**Decision**: Pass `file_mtime: Option<std::time::SystemTime>` into `detect_and_parse`. The caller (`index_and_detect_timestamps`) will obtain it via `std::fs::metadata(&path).modified()`. The mtime is only used when the detected format is `Syslog`.

**Rationale**: Minimal API surface change. `Option` allows graceful fallback (use current year) if the mtime is unavailable (e.g., on a filesystem that doesn't support it). The path is available in `index_and_detect_timestamps` because it can be looked up from the SQLite `log_file_entries` table via `file_id`, or more simply, the mtime can be obtained from the already-open `mmap`'s underlying file descriptor — but `std::fs::metadata` on the path is simplest and most portable.

**Alternative**: Store the path on `FileRuntime`. Rejected because it's a larger structural change for a single use case, and the mtime can be obtained at the call site.
