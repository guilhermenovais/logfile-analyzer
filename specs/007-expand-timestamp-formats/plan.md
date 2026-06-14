# Implementation Plan: Expand Supported Log Timestamp Formats

**Branch**: `007-expand-timestamp-formats` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-expand-timestamp-formats/spec.md`

## Summary

Today's timestamp-format detection (`src-tauri/src/logfile/timestamp.rs`)
only recognizes ISO-8601 (`T`-separated) and raw epoch-second/millisecond
timestamps, so the very common `YYYY-MM-DD HH:MM:SS.mmm` log-line prefix
(default for many Java/Python/.NET loggers - confirmed against the user's
open file, which currently has `has_timestamp_format: false`) is never
detected. This plan adds one new `TimestampFormat::SpaceSeparated` variant
that covers the space-separated date/time form with an optional
fractional-seconds part introduced by `.` or `,`, or no fraction at all
(FR-001-FR-003), reusing chrono's existing optional `%.f` specifier plus a
one-character comma-to-period normalization (research.md §1-2). It is added
to the existing `CANDIDATE_FORMATS` list used by `detect_format`, so
detection, per-line parsing (`detect_and_parse`/`parse_line_timestamps`),
time-range search/filter, and the existing ISO-8601/epoch formats all
continue to work exactly as today (FR-004-FR-010). Backend-only: no
frontend, IPC, bindings, or schema changes (research.md §6).

## Technical Context

**Language/Version**: Rust (stable, pinned via `rust-toolchain.toml`) - backend-only change; no frontend/TypeScript code touched
**Primary Dependencies**: `chrono = "0.4.45"` (existing dependency, already used for `Iso8601`/epoch parsing) - no new crates added
**Storage**: N/A - no schema changes; `has_timestamp_format` (SQLite `INTEGER`) and its set/get path in `src-tauri/src/persistence/repo/log_file_entry.rs` are unchanged, only the conditions under which `timestamp_profile` (and thus `has_timestamp_format`) becomes `Some`/`true` are widened
**Testing**: `cargo test` - new `#[cfg(test)]` cases in `src-tauri/src/logfile/timestamp.rs` for `extract_timestamp`/`detect_format` covering FR-001-FR-003 (new formats), FR-004/FR-005 (regression - existing formats unaffected), the invalid-value edge case, and the mixed-format edge case (research.md §4, quickstart.md). No Vitest/RTL changes - `TimestampFormat`/`TimestampFormatProfile` aren't reachable from `src/bindings` (research.md §6)
**Target Platform**: Desktop - Linux, macOS, Windows (Tauri v2 supported matrix), unchanged
**Project Type**: Desktop app (Tauri: Rust backend + React/TS webview frontend) - this feature touches only the Rust backend
**Performance Goals**: Unchanged complexity class - detection still samples up to `SAMPLE_SIZE` (1000) lines and per-line parsing is still O(total_lines); adding one more candidate format adds one more chrono parse attempt per sampled line during detection, and (only if `SpaceSeparated` wins) one chrono parse per line during `parse_line_timestamps` - negligible relative to existing `Iso8601`/epoch parsing already done per line
**Constraints**: `src-tauri/src/logfile/timestamp.rs` grows from 262 to roughly 310-330 lines with the new variant, `parse_space_separated` helper, and new tests - in line with (not newly exceeding relative to) sibling files `query.rs` (301 lines) and `search.rs` (312 lines), which already carry inline `#[cfg(test)]` blocks past the nominal 300-line Rust guideline (research.md §8)
**Scale/Scope**: 2 files modified: `src-tauri/src/state.rs` (+1 `TimestampFormat` enum variant), `src-tauri/src/logfile/timestamp.rs` (new `SpaceSeparated` branch in `extract_timestamp`, new `parse_space_separated` helper, `CANDIDATE_FORMATS` entry, new unit tests). No new files, no files deleted, no frontend/`src/bindings`/IPC/capability/schema changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Type-Safe IPC & Shared Contracts | PASS (N/A) | No Tauri command signatures, IPC payloads, or `src/bindings` types change. `TimestampFormat`/`TimestampFormatProfile` derive `specta::Type` but are not reachable from any `#[specta]`-registered command/event (verified: `src/bindings/index.ts` has zero references), so the new `SpaceSeparated` variant generates no TS diff. |
| II | Security & Least Privilege | PASS (N/A) | No new capabilities, commands, or input surfaces. Timestamp text still comes from file bytes already read via the existing mmap path; `NaiveDateTime::parse_from_str` rejects out-of-range values (Edge Cases), same validation discipline as the existing `Iso8601`/epoch parsers. |
| III | Simplicity & Minimal Footprint | PASS | One new enum variant and one new helper function cover all three new sub-formats (FR-001-FR-003) via chrono's optional `%.f` plus a 1-char `replacen` for the comma case, instead of three variants/format strings (research.md §1-2). No new dependencies. File-size growth follows this directory's existing precedent rather than introducing a new split (research.md §8, flagged here per the "follow existing conventions, flag inconsistency" workflow rule rather than silently restructuring `query.rs`/`search.rs`/`timestamp.rs`). |
| IV | Test-First Quality Gates | PASS | New `cargo test` cases for every new FR plus regression cases for FR-004/FR-005 (Technical Context, quickstart.md). `tsc --noEmit`/`eslint`/Vitest are unaffected (no frontend changes) and must still pass; `cargo clippy -D warnings` and `cargo fmt --check` must still pass on the modified files. |
| V | Accessible, Native-Feeling Desktop UI | PASS (N/A) | No UI changes. (`SearchBar`'s existing `hasTimestampFormat`-gated time-range inputs simply become available for more files once `has_timestamp_format` is `true` for them - no component changes.) |
| VI | Performance for Large Log Volumes | PASS | Parsing remains in Rust on the existing `spawn_blocking` indexing path (`detect_and_parse`, unchanged call site in `commands/files.rs`); no new IPC/Channel traffic; added per-line cost is one more chrono parse attempt, same order of magnitude as the three existing candidates. |

**Result**: All gates PASS. No deviations - Complexity Tracking table is empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-expand-timestamp-formats/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # /speckit-tasks output (NOT created here)
```

No `contracts/` directory - this feature adds/changes no Tauri commands, MCP
tool schemas, IPC payloads, or other external interfaces (Phase 1 step 2 is
skipped, per the "skip if purely internal" rule). The only externally visible
effect is that `has_timestamp_format` (an existing boolean already in
`FileProperties`/`LogFileEntry`) becomes `true` for more files; its shape and
the `get_file_properties`/`search_with_context` MCP contracts from
001 (`contracts/mcp-tools.md`) are unchanged.

### Source Code (repository root)

```text
src-tauri/src/
├── state.rs                 # MODIFIED: + TimestampFormat::SpaceSeparated variant
└── logfile/
    └── timestamp.rs          # MODIFIED: + SpaceSeparated arm in extract_timestamp,
                               #   + parse_space_separated helper (date+time token
                               #   pair, comma->period normalization, "%Y-%m-%d
                               #   %H:%M:%S%.f"), + CANDIDATE_FORMATS entry,
                               #   + new #[cfg(test)] cases (FR-001-FR-003, FR-004/
                               #   FR-005 regression, invalid-value + mixed-format
                               #   edge cases)
```

No changes to `src/`, `src/bindings/index.ts`, `src/ipc/`,
`src-tauri/capabilities/`, `src-tauri/src/persistence/schema.rs`, or any
other backend module (`commands/files.rs`'s call to
`timestamp::detect_and_parse` and `mcp/tools.rs`'s
`parse_iso8601`/`parse_time_bound` are unchanged - research.md §7).

**Structure Decision**: Follows the existing `src-tauri/src/logfile/`
layout from 001 - format-detection and per-line parsing logic for all
`TimestampFormat` variants lives in `timestamp.rs`, and the shared enum
lives in `state.rs` alongside `TimestampFormatProfile`/`FileIndex`. No new
modules; the new format is "one more case" in the existing
detect/extract/test structure, consistent with how `EpochSeconds` and
`EpochMillis` were added alongside `Iso8601`.

## Complexity Tracking

*No Constitution Check violations - table intentionally empty.*
