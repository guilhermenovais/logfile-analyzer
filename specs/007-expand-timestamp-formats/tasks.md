# Tasks: Expand Supported Log Timestamp Formats

**Input**: Design documents from `/specs/007-expand-timestamp-formats/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: MANDATORY per the project constitution (Principle IV — Test-First Quality Gates). Each user story phase adds failing `cargo test` cases first (in `src-tauri/src/logfile/timestamp.rs`'s existing `#[cfg(test)] mod tests`), then implements until they pass.

**Organization**: Tasks are grouped by user story (US1–US3, per spec.md priorities) to enable independent implementation and testing of each story. This is a backend-only change — no frontend/`src/bindings` files change (plan.md "Project Structure").

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency on another task in flight)
- **[Story]**: Maps the task to a user story (US1–US3) for traceability
- All file paths are relative to the repository root

## Path Conventions (from plan.md)

- `src-tauri/src/state.rs` — `TimestampFormat` enum (+1 variant)
- `src-tauri/src/logfile/timestamp.rs` — `extract_timestamp`, `CANDIDATE_FORMATS`, new `parse_space_separated` helper, and all new `#[cfg(test)]` cases
- No `contracts/` directory, no IPC/bindings/schema changes (research.md §6-7)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: N/A — no new dependencies, build configuration, or project structure changes are needed (plan.md Technical Context: "no new crates added"). Proceed directly to Phase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the new `TimestampFormat` variant that every user story's tests and implementation reference.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T001 In `src-tauri/src/state.rs`, add a `SpaceSeparated` variant to the `TimestampFormat` enum (after `EpochMillis`), per data-model.md "TimestampFormat (extended)":
  ```rust
  pub enum TimestampFormat {
      Iso8601,
      EpochSeconds,
      EpochMillis,
      SpaceSeparated,
  }
  ```
  No other changes to this file (`TimestampFormatProfile`, `FileIndex`, etc. are unchanged).

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Open a log file with space-separated timestamps (Priority: P1) 🎯 MVP

**Goal**: Recognize `YYYY-MM-DD HH:MM:SS.mmm` timestamps (e.g. `2026-05-21 18:14:06.043`), the format reported as broken (FR-001, SC-001), so such files get `has_timestamp_format: true` and support time-range search/filter.

**Independent Test**: Open a log file whose lines begin with `YYYY-MM-DD HH:MM:SS.mmm` timestamps. Verify the file is reported as having a recognized timestamp format, and that searching/filtering by a time range returns only matches within that range.

### Tests for User Story 1 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation (T004)**

- [X] T002 [US1] In `src-tauri/src/logfile/timestamp.rs`'s `mod tests`, add a failing test `extract_timestamp_parses_space_separated_with_period_millis`:
  ```rust
  #[test]
  fn extract_timestamp_parses_space_separated_with_period_millis() {
      let ms = extract_timestamp(
          "2026-05-21 18:14:06.043 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
          TimestampFormat::SpaceSeparated,
      );
      assert_eq!(ms, Some(1779387246043));
  }
  ```
  (FR-001; `1779387246043` is the epoch-ms value of `2026-05-21T18:14:06.043Z`.)

- [X] T003 [US1] In the same `mod tests`, add a failing test `detect_format_picks_space_separated_when_dominant`, mirroring `detect_format_picks_iso8601_when_dominant`'s style:
  ```rust
  #[test]
  fn detect_format_picks_space_separated_when_dominant() {
      let lines = vec![
          "2026-05-21 18:14:06.043 [main] INFO one",
          "2026-05-21 18:14:07.100 [main] INFO two",
          "2026-05-21 18:14:08.250 [main] INFO three",
          "no timestamp here",
      ];
      let profile = detect_format(lines.into_iter()).unwrap();
      assert_eq!(profile.format, TimestampFormat::SpaceSeparated);
      assert!((profile.match_ratio - 0.75).abs() < f64::EPSILON);
  }
  ```
  (FR-001, FR-007, SC-001) (depends on T002 being added to the same `mod tests` block first to avoid edit conflicts)

### Implementation for User Story 1

- [X] T004 [US1] In `src-tauri/src/logfile/timestamp.rs`:
  1. Add a new private helper below `parse_epoch`:
     ```rust
     /// Parses a `SpaceSeparated` timestamp (data-model.md "Parsing algorithm
     /// for SpaceSeparated"): the first two whitespace-separated tokens of
     /// `line` are `YYYY-MM-DD` and `HH:MM:SS[.fff]`.
     fn parse_space_separated(line: &str) -> Option<i64> {
         let mut tokens = line.split_whitespace();
         let date_token = tokens.next()?;
         let time_token = tokens.next()?;
         let candidate = format!("{date_token} {time_token}");
         let naive = NaiveDateTime::parse_from_str(&candidate, "%Y-%m-%d %H:%M:%S%.f").ok()?;
         Some(naive.and_utc().timestamp_millis())
     }
     ```
  2. Add a `SpaceSeparated` arm to `extract_timestamp`'s `match format` block:
     ```rust
     TimestampFormat::SpaceSeparated => parse_space_separated(line),
     ```
  3. Append `TimestampFormat::SpaceSeparated` to `CANDIDATE_FORMATS` (after `EpochSeconds`):
     ```rust
     const CANDIDATE_FORMATS: &[TimestampFormat] = &[
         TimestampFormat::Iso8601,
         TimestampFormat::EpochMillis,
         TimestampFormat::EpochSeconds,
         TimestampFormat::SpaceSeparated,
     ];
     ```
  Run `cargo test logfile::timestamp` and confirm T002 and T003 now pass (FR-001, FR-007, SC-001). (depends on T001, T002, T003)

**Checkpoint**: User Story 1 is fully functional and independently testable — `2026-05-21 18:14:06.043 ...`-style files are detected as `SpaceSeparated` and `has_timestamp_format` becomes `true` for them.

---

## Phase 4: User Story 2 - Open a log file with comma-decimal or no-fraction timestamps (Priority: P2)

**Goal**: Recognize the same `YYYY-MM-DD HH:MM:SS` prefix when the fractional part uses a comma (`2026-05-21 18:14:06,043`, FR-002) or is absent entirely (`2026-05-21 18:14:06`, FR-003).

**Independent Test**: Open log files using `YYYY-MM-DD HH:MM:SS,mmm` and `YYYY-MM-DD HH:MM:SS` (no fraction) timestamps respectively. Verify each file is reported as having a recognized timestamp format and that time-range filtering works correctly for each.

### Tests for User Story 2 (MANDATORY per constitution) ⚠️

> **NOTE: Write these tests FIRST. T005 (comma-decimal) FAILS until T007 adds comma normalization; T006 (no-fraction) is expected to already pass after T004 (chrono's `%.f` is optional) and serves as a regression-lock for FR-003.**

- [X] T005 [US2] In `src-tauri/src/logfile/timestamp.rs`'s `mod tests`, add a failing test `extract_timestamp_parses_space_separated_with_comma_millis`:
  ```rust
  #[test]
  fn extract_timestamp_parses_space_separated_with_comma_millis() {
      let ms = extract_timestamp(
          "2026-05-21 18:14:06,043 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
          TimestampFormat::SpaceSeparated,
      );
      assert_eq!(ms, Some(1779387246043));
  }
  ```
  (FR-002; same epoch-ms value as T002's period-decimal case)

- [X] T006 [US2] In the same `mod tests`, add `extract_timestamp_parses_space_separated_without_fraction`:
  ```rust
  #[test]
  fn extract_timestamp_parses_space_separated_without_fraction() {
      let ms = extract_timestamp(
          "2026-05-21 18:14:06 [main] INFO com.zaxxer.hikari.HikariDataSource - HikariPool-1 - Starting...",
          TimestampFormat::SpaceSeparated,
      );
      assert_eq!(ms, Some(1779387246000));
  }
  ```
  (FR-003) (depends on T005 being added to the same `mod tests` block first to avoid edit conflicts)

### Implementation for User Story 2

- [X] T007 [US2] In `src-tauri/src/logfile/timestamp.rs`'s `parse_space_separated` (added in T004), normalize a comma-decimal fraction to a period before parsing (FR-002, research.md §2):
  ```rust
  fn parse_space_separated(line: &str) -> Option<i64> {
      let mut tokens = line.split_whitespace();
      let date_token = tokens.next()?;
      let time_token = tokens.next()?;
      let time_token = time_token.replacen(',', ".", 1);
      let candidate = format!("{date_token} {time_token}");
      let naive = NaiveDateTime::parse_from_str(&candidate, "%Y-%m-%d %H:%M:%S%.f").ok()?;
      Some(naive.and_utc().timestamp_millis())
  }
  ```
  Run `cargo test logfile::timestamp` and confirm T005 and T006 now pass (FR-002, FR-003, SC-002). (depends on T004, T005, T006)

**Checkpoint**: User Stories 1 AND 2 both work independently — period-decimal, comma-decimal, and no-fraction space-separated timestamps are all detected as `SpaceSeparated` and parsed to the correct epoch-ms.

---

## Phase 5: User Story 3 - Existing timestamp formats continue to work (Priority: P3)

**Goal**: Confirm the previously supported `Iso8601`, `EpochSeconds`, and `EpochMillis` formats are unaffected by the new `SpaceSeparated` candidate (FR-004, FR-005), and lock in the invalid-value and mixed-format edge cases from spec.md.

**Independent Test**: Open log files using each of the previously supported formats (ISO-8601 with and without timezone offset, epoch seconds, epoch milliseconds) and confirm detection and time-range filtering behave the same as before this change.

### Tests for User Story 3 (MANDATORY per constitution) ⚠️

- [X] T008 [US3] In `src-tauri/src/logfile/timestamp.rs`'s `mod tests`, add `extract_timestamp_space_separated_does_not_match_iso8601_or_epoch_lines` to guard against false positives (research.md §4):
  ```rust
  #[test]
  fn extract_timestamp_space_separated_does_not_match_iso8601_or_epoch_lines() {
      assert_eq!(
          extract_timestamp("2026-06-12T10:00:00Z connected", TimestampFormat::SpaceSeparated),
          None
      );
      assert_eq!(
          extract_timestamp("1781258400000 connected", TimestampFormat::SpaceSeparated),
          None
      );
  }
  ```
  (FR-004, FR-005, FR-009)

- [X] T009 [US3] In the same `mod tests`, add `extract_timestamp_space_separated_rejects_invalid_calendar_value` for the out-of-range edge case from spec.md:
  ```rust
  #[test]
  fn extract_timestamp_space_separated_rejects_invalid_calendar_value() {
      assert_eq!(
          extract_timestamp("2026-13-01 10:00:00 bad month", TimestampFormat::SpaceSeparated),
          None
      );
  }
  ```
  (Edge Cases: "a line that superficially resembles a timestamp but contains invalid values ... must not be treated as a match") (depends on T008 being added to the same `mod tests` block first to avoid edit conflicts)

- [X] T010 [US3] In the same `mod tests`, add `detect_format_picks_iso8601_for_mixed_iso8601_and_space_separated_sample` for the mixed-format edge case:
  ```rust
  #[test]
  fn detect_format_picks_iso8601_for_mixed_iso8601_and_space_separated_sample() {
      let lines = vec![
          "2026-06-12T10:00:00Z one",
          "2026-06-12T10:00:01Z two",
          "2026-06-12T10:00:02Z three",
          "2026-05-21 18:14:06.043 [main] INFO four",
      ];
      let profile = detect_format(lines.into_iter()).unwrap();
      assert_eq!(profile.format, TimestampFormat::Iso8601);
      assert!((profile.match_ratio - 0.75).abs() < f64::EPSILON);
  }
  ```
  (FR-004, FR-007; Edge Cases: "a file mixing more than one of the newly and previously supported formats ... detection picks the single best-matching format for the file as a whole") (depends on T009 being added to the same `mod tests` block first to avoid edit conflicts)

### Implementation for User Story 3

No implementation changes expected — T008-T010 verify that T004/T007 did not regress `Iso8601`/`EpochSeconds`/`EpochMillis` detection and parsing (FR-004, FR-005, User Story 3), and that the existing `extract_timestamp_parses_iso8601_*`, `extract_timestamp_parses_epoch_*`, `detect_format_picks_iso8601_when_dominant`, `detect_format_picks_epoch_millis_when_dominant`, and `detect_format_picks_epoch_seconds_when_dominant` tests still pass unchanged. If any of T008-T010 fails, fix `parse_space_separated`/`CANDIDATE_FORMATS` (T004/T007) rather than the pre-existing formats. (depends on T004, T007, T008, T009, T010)

**Checkpoint**: All three user stories are independently functional — new and previously supported timestamp formats are all detected and parsed correctly, with no regressions and the documented edge cases covered.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all user stories (quickstart.md).

- [X] T011 In `src-tauri/`, run `cargo test logfile::timestamp`, `cargo clippy -- -D warnings`, and `cargo fmt --check`; confirm all new (T002, T003, T005, T006, T008-T010) and pre-existing tests in `timestamp.rs` pass and the file is clean (quickstart.md "Automated")
- [X] T012 Manual verification per quickstart.md "Manual (app)" and/or "Manual (MCP)": open the workspace's existing `file` (lines starting `2026-05-21 18:14:06.043 ...`) and confirm `get_file_properties` now reports `has_timestamp_format: true` (SC-001), then confirm `search_with_context`/UI time-range filtering with `time_from`/`time_to` returns only in-range lines (SC-002); repeat for sample files using comma-decimal and no-fraction timestamps, and for previously-supported ISO-8601/epoch files to confirm no regression (SC-003) (depends on T004, T007, T010)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: N/A — no tasks
- **Foundational (Phase 2)**: No dependencies — BLOCKS all user stories (T002-T010 all reference `TimestampFormat::SpaceSeparated`)
- **User Story 1 (Phase 3)**: Depends on Foundational (T001) — no dependency on other stories
- **User Story 2 (Phase 4)**: Depends on Foundational (T001) and on US1's implementation (T004), since T007 edits the `parse_space_separated` helper T004 creates
- **User Story 3 (Phase 5)**: Depends on Foundational (T001) and on US1+US2's implementation (T004, T007), since it verifies no regression from those changes
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests are added and (where applicable) expected to fail before the corresponding implementation task
- All tasks touch one of two files (`src-tauri/src/state.rs` once in T001, `src-tauri/src/logfile/timestamp.rs` for everything else), so within `timestamp.rs` tasks are sequential (each depends on the prior edit landing in the same file/block) rather than parallel — no `[P]` markers are used

### Parallel Opportunities

- None beyond what's noted above: every task after T001 edits `src-tauri/src/logfile/timestamp.rs`, so this feature is best executed as a single sequential pass (T001 → T002 → ... → T012)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001 — add the `SpaceSeparated` enum variant)
2. Complete Phase 3: User Story 1 (T002-T004)
3. **STOP and VALIDATE**: `cargo test logfile::timestamp` passes T002/T003; the reported-broken file (`2026-05-21 18:14:06.043 ...`) now gets `has_timestamp_format: true`
4. This alone resolves the originally-reported bug (SC-001)

### Incremental Delivery

1. Foundational (T001) → enum ready
2. Add User Story 1 (T002-T004) → period-decimal `SpaceSeparated` detection works → validate independently (SC-001)
3. Add User Story 2 (T005-T007) → comma-decimal and no-fraction variants work → validate independently (SC-002)
4. Add User Story 3 (T008-T010) → confirm no regressions and edge cases hold (SC-003)
5. Polish (T011-T012) → full automated + manual validation

---

## Notes

- [Story] label maps task to specific user story for traceability
- Verify tests fail before implementing (T002/T003 before T004; T005 before T007 — T006 is expected to already pass after T004 and serves as a lock-in test)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
