# Tasks: Extended Timestamp Format Parsing

**Input**: Design documents from `/specs/021-extended-timestamp-parsing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are MANDATORY per the project constitution (Test-First Quality Gates). Write tests for each user story before implementing it, and ensure they fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend the `TimestampFormat` enum and update function signatures that all new formats depend on

- [X] T001 Add `DayFirst`, `Syslog`, `ApacheCombined`, `MonthFirst` variants to `TimestampFormat` enum in `src-tauri/src/state.rs`
- [X] T002 Update `CANDIDATE_FORMATS` array ordering in `src-tauri/src/logfile/timestamp.rs` per research.md §4 (Iso8601, SpaceSeparated, ApacheCombined, Syslog, EpochMillis, EpochSeconds, DayFirst, MonthFirst)
- [X] T003 Update `extract_timestamp` signature to accept `file_mtime: Option<std::time::SystemTime>` in `src-tauri/src/logfile/timestamp.rs` and pass it through in the `match` arms (existing arms ignore it)
- [X] T004 Update `detect_format` signature to accept and forward `file_mtime: Option<std::time::SystemTime>` to `extract_timestamp` in `src-tauri/src/logfile/timestamp.rs`
- [X] T005 Update `parse_line_timestamps` to accept and forward `file_mtime: Option<std::time::SystemTime>` to `extract_timestamp` in `src-tauri/src/logfile/timestamp.rs`
- [X] T006 Update `detect_and_parse` signature to accept `file_mtime: Option<std::time::SystemTime>` and forward it to `detect_format` and `parse_line_timestamps` in `src-tauri/src/logfile/timestamp.rs`
- [X] T007 Update `index_and_detect_timestamps` in `src-tauri/src/commands/files.rs` to obtain file mtime via `std::fs::metadata` and pass it to `detect_and_parse`
- [X] T008 Fix all existing tests in `src-tauri/src/logfile/timestamp.rs` to pass `None` as `file_mtime` to `extract_timestamp` and `detect_format`

**Checkpoint**: Project compiles and all existing tests pass with the new signatures and enum variants. No new parsing logic yet.

---

## Phase 2: User Story 1 — Day-First Date Timestamps (Priority: P1) 🎯 MVP

**Goal**: Detect and parse `DD-MM-YYYY HH:MM:SS[.fff]` and `DD/MM/YYYY HH:MM:SS[.fff]` timestamps

**Independent Test**: Open a log file with `DD-MM-YYYY HH:MM:SS.fff` timestamps. Verify detection and time-range filtering work.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [P] [US1] Add unit test `extract_timestamp_parses_day_first_dash` for `12-06-2026 00:00:00.007 INFO ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T010 [P] [US1] Add unit test `extract_timestamp_parses_day_first_slash` for `12/06/2026 00:00:00.007 INFO ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T011 [P] [US1] Add unit test `extract_timestamp_parses_day_first_comma_millis` for `12-06-2026 00:00:00,007 INFO ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T012 [P] [US1] Add unit test `extract_timestamp_parses_day_first_without_fraction` for `12-06-2026 00:00:00 INFO ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T013 [P] [US1] Add unit test `extract_timestamp_day_first_rejects_invalid_date` for `31-02-2026 00:00:00 ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T014 [P] [US1] Add unit test `detect_format_picks_day_first_when_dominant` with a sample of day-first lines in `src-tauri/src/logfile/timestamp.rs`

### Implementation for User Story 1

- [X] T015 [US1] Implement `parse_day_first(line: &str) -> Option<i64>` in `src-tauri/src/logfile/timestamp.rs` — extract first two tokens, normalize `,` → `.`, try `%d-%m-%Y %H:%M:%S%.f` then `%d/%m/%Y %H:%M:%S%.f`
- [X] T016 [US1] Add `TimestampFormat::DayFirst` branch to `extract_timestamp` calling `parse_day_first` in `src-tauri/src/logfile/timestamp.rs`

**Checkpoint**: All US1 tests pass. Day-first detection and parsing work end-to-end.

---

## Phase 3: User Story 2 — Syslog-Style Timestamps (Priority: P2)

**Goal**: Detect and parse `MMM DD HH:MM:SS` (BSD/syslog) timestamps with year inference from file mtime

**Independent Test**: Open a log file with `MMM DD HH:MM:SS` timestamps. Verify detection and time-range filtering work.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T017 [P] [US2] Add unit test `extract_timestamp_parses_syslog` for `Dec 24 06:55:48 host sshd[1234]: ...` with mtime in Dec 2026 in `src-tauri/src/logfile/timestamp.rs`
- [X] T018 [P] [US2] Add unit test `extract_timestamp_parses_syslog_space_padded_day` for `Dec  4 06:55:48 host ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T019 [P] [US2] Add unit test `extract_timestamp_parses_syslog_zero_padded_day` for `Dec 04 06:55:48 host ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T020 [P] [US2] Add unit test `extract_timestamp_syslog_year_rollover` — syslog line with month > mtime month infers previous year in `src-tauri/src/logfile/timestamp.rs`
- [X] T021 [P] [US2] Add unit test `extract_timestamp_syslog_no_mtime_uses_current_year` — passes `None` as mtime in `src-tauri/src/logfile/timestamp.rs`
- [X] T022 [P] [US2] Add unit test `extract_timestamp_syslog_rejects_invalid` for `Abc 99 25:00:00 ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T023 [P] [US2] Add unit test `detect_format_picks_syslog_when_dominant` with a sample of syslog lines in `src-tauri/src/logfile/timestamp.rs`

### Implementation for User Story 2

- [X] T024 [US2] Implement `parse_syslog(line: &str, file_mtime: Option<std::time::SystemTime>) -> Option<i64>` in `src-tauri/src/logfile/timestamp.rs` — normalize double-space, extract three tokens, parse `%b %-d %H:%M:%S`, infer year from mtime per research.md §1
- [X] T025 [US2] Add `TimestampFormat::Syslog` branch to `extract_timestamp` calling `parse_syslog` with `file_mtime` in `src-tauri/src/logfile/timestamp.rs`

**Checkpoint**: All US2 tests pass. Syslog detection, parsing, and year inference work end-to-end.

---

## Phase 4: User Story 3 — Apache/Nginx Combined Log Timestamps (Priority: P3)

**Goal**: Detect and parse `[DD/Mon/YYYY:HH:MM:SS ±ZZZZ]` timestamps with timezone offset application

**Independent Test**: Open a web server access log. Verify detection and time-range filtering work, including timezone offset conversion.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T026 [P] [US3] Add unit test `extract_timestamp_parses_apache_combined` for `127.0.0.1 - - [24/Dec/2026:06:55:48 +0000] "GET /"` in `src-tauri/src/logfile/timestamp.rs`
- [X] T027 [P] [US3] Add unit test `extract_timestamp_parses_apache_combined_with_offset` for `[24/Dec/2026:06:55:48 +0530]` verifying offset is applied in `src-tauri/src/logfile/timestamp.rs`
- [X] T028 [P] [US3] Add unit test `extract_timestamp_parses_apache_combined_negative_offset` for `[24/Dec/2026:06:55:48 -0500]` in `src-tauri/src/logfile/timestamp.rs`
- [X] T029 [P] [US3] Add unit test `extract_timestamp_apache_rejects_no_brackets` — line without brackets doesn't match in `src-tauri/src/logfile/timestamp.rs`
- [X] T030 [P] [US3] Add unit test `detect_format_picks_apache_when_dominant` with a sample of Apache access log lines in `src-tauri/src/logfile/timestamp.rs`

### Implementation for User Story 3

- [X] T031 [US3] Implement `parse_apache_combined(line: &str) -> Option<i64>` in `src-tauri/src/logfile/timestamp.rs` — compile regex via `OnceLock`, search line for bracketed timestamp pattern, parse with `%d/%b/%Y:%H:%M:%S %z`, return epoch-ms
- [X] T032 [US3] Add `TimestampFormat::ApacheCombined` branch to `extract_timestamp` calling `parse_apache_combined` in `src-tauri/src/logfile/timestamp.rs`

**Checkpoint**: All US3 tests pass. Apache combined log detection and parsing work, including timezone offset application.

---

## Phase 5: User Story 4 — US-Style Month-First Timestamps (Priority: P4)

**Goal**: Detect and parse `MM/DD/YYYY HH:MM:SS[.fff]` timestamps

**Independent Test**: Open a log file with `MM/DD/YYYY HH:MM:SS` timestamps. Verify detection and time-range filtering work.

### Tests for User Story 4 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T033 [P] [US4] Add unit test `extract_timestamp_parses_month_first` for `06/12/2026 14:30:00.500 INFO ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T034 [P] [US4] Add unit test `extract_timestamp_parses_month_first_without_fraction` for `06/12/2026 14:30:00 INFO ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T035 [P] [US4] Add unit test `extract_timestamp_parses_month_first_comma_millis` for `06/12/2026 14:30:00,500 INFO ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T036 [P] [US4] Add unit test `extract_timestamp_month_first_rejects_invalid_date` for `13/32/2026 00:00:00 ...` in `src-tauri/src/logfile/timestamp.rs`
- [X] T037 [P] [US4] Add unit test `detect_format_picks_month_first_when_dominant` with a sample of month-first lines in `src-tauri/src/logfile/timestamp.rs`

### Implementation for User Story 4

- [X] T038 [US4] Implement `parse_month_first(line: &str) -> Option<i64>` in `src-tauri/src/logfile/timestamp.rs` — extract first two tokens, normalize `,` → `.`, parse with `%m/%d/%Y %H:%M:%S%.f`
- [X] T039 [US4] Add `TimestampFormat::MonthFirst` branch to `extract_timestamp` calling `parse_month_first` in `src-tauri/src/logfile/timestamp.rs`

**Checkpoint**: All US4 tests pass. Month-first detection and parsing work end-to-end.

---

## Phase 6: User Story 5 — Existing Format Regression Protection (Priority: P5)

**Goal**: Confirm all previously supported formats (ISO-8601, SpaceSeparated, EpochSeconds, EpochMillis) continue working with the new signatures and expanded candidate list

**Independent Test**: Run the full existing test suite; all pre-existing tests pass unchanged.

### Tests for User Story 5 (MANDATORY per constitution) ⚠️

- [X] T040 [P] [US5] Add unit test `detect_format_still_picks_iso8601_over_new_formats` — ISO-8601 lines are not misdetected as another format in `src-tauri/src/logfile/timestamp.rs`
- [X] T041 [P] [US5] Add unit test `detect_format_still_picks_space_separated_over_new_formats` — SpaceSeparated lines are not misdetected in `src-tauri/src/logfile/timestamp.rs`
- [X] T042 [P] [US5] Add unit test `detect_format_prefers_iso8601_over_day_first` — mixed sample with both ISO-8601 and day-first lines picks ISO-8601 in `src-tauri/src/logfile/timestamp.rs`

### Verification for User Story 5

- [X] T043 [US5] Run `cargo test --manifest-path src-tauri/Cargo.toml` and verify all pre-existing and new tests pass
- [X] T044 [US5] Run `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` and fix any warnings

**Checkpoint**: Full test suite green. No regressions in existing format detection or parsing.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all formats

- [X] T045 [P] Run `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and fix any formatting issues
- [X] T046 Run quickstart.md validation — verify all format examples from quickstart.md parse to the expected UTC values
- [X] T047 Run `npx tsc --noEmit` to confirm no frontend type errors from the updated specta bindings

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **User Story 1 (Phase 2)**: Depends on Setup (Phase 1) — enum variants and signatures must exist
- **User Story 2 (Phase 3)**: Depends on Setup (Phase 1) — needs `file_mtime` parameter in signatures
- **User Story 3 (Phase 4)**: Depends on Setup (Phase 1) — needs enum variant and `extract_timestamp` match arm
- **User Story 4 (Phase 5)**: Depends on Setup (Phase 1) — needs enum variant and signatures
- **User Story 5 (Phase 6)**: Depends on Phases 2–5 — validates all formats together
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 1. No dependencies on other stories.
- **US2 (P2)**: Can start after Phase 1. No dependencies on other stories.
- **US3 (P3)**: Can start after Phase 1. No dependencies on other stories.
- **US4 (P4)**: Can start after Phase 1. No dependencies on other stories.
- **US5 (P5)**: Depends on US1–US4 completion (regression validation).

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Parser function before `extract_timestamp` match arm integration
- Story complete before moving to next priority (or implement in parallel)

### Parallel Opportunities

- All test tasks (T009–T014, T017–T023, T026–T030, T033–T037, T040–T042) within a story are parallelizable
- US1, US2, US3, US4 can be implemented in parallel after Phase 1 (different parsers, same file but independent functions)
- T045, T046, T047 in Phase 7 are independent of each other

---

## Parallel Example: User Story 1

```bash
# Launch all tests for US1 together (all [P]):
Task T009: "Unit test for day-first dash separator"
Task T010: "Unit test for day-first slash separator"
Task T011: "Unit test for day-first comma millis"
Task T012: "Unit test for day-first without fraction"
Task T013: "Unit test for day-first invalid date rejection"
Task T014: "Unit test for day-first detection"

# Then implement sequentially:
Task T015: "Implement parse_day_first function"
Task T016: "Add DayFirst branch to extract_timestamp"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T008)
2. Complete Phase 2: User Story 1 (T009–T016)
3. **STOP and VALIDATE**: Run `cargo test`, verify day-first format works
4. This alone fixes one of the two formats the user explicitly reported as broken

### Incremental Delivery

1. Phase 1 → Signatures and enum ready
2. US1 → Day-first timestamps work (MVP — user's first reported format)
3. US2 → Syslog timestamps work (user's second reported format)
4. US3 → Apache combined logs work (common format expansion)
5. US4 → US-style month-first works (locale coverage)
6. US5 → Full regression validation
7. Phase 7 → Polish and final checks
